

"use client";

import { useState, useCallback, useEffect, useRef } from 'react';
import type { CloudFile, CloudFolder, MediaHistoryResponse, InputPeer } from '@/types';
import * as telegramService from '@/services/telegramService';
import type { useToast } from "@/hooks/use-toast";

const GLOBAL_DRIVE_DIALOG_FETCH_LIMIT = 50;
const GLOBAL_DRIVE_MEDIA_PER_DIALOG_INITIAL_FETCH_LIMIT = 50; // Fetch a larger batch initially for each dialog.
const GLOBAL_DRIVE_MEDIA_PER_DIALOG_SUBSEQUENT_LIMIT = 20; // Subsequent fetches for a dialog.


interface UseGlobalDriveManagerProps {
  toast: ReturnType<typeof useToast>['toast'];
  handleGlobalApiError: (error: any, title: string, defaultMessage: string, doPageReset?: boolean) => void;
  isConnected: boolean;
}

interface DialogProcessInfo {
  dialog: CloudFolder;
  mediaOffsetId: number;
  hasMoreMedia: boolean;
  isFullyScanned?: boolean;
  attemptCount?: number;
}

const MAX_DIALOG_PROCESS_ATTEMPTS = 3;

export function useGlobalDriveManager({
  toast,
  handleGlobalApiError,
  isConnected: initialIsConnected,
}: UseGlobalDriveManagerProps) {
  const [globalMediaItems, setGlobalMediaItems] = useState<CloudFile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [statusMessage, setStatusMessage] = useState<string | null>("Global Drive: Idle. Open to start scanning.");

  const allDialogsCacheRef = useRef<CloudFolder[]>([]);
  const dialogsProcessQueueRef = useRef<DialogProcessInfo[]>([]);

  const [currentDialogsOffsetDate, setCurrentDialogsOffsetDate] = useState(0);
  const [currentDialogsOffsetId, setCurrentDialogsOffsetId] = useState(0);
  const [currentDialogsOffsetPeer, setCurrentDialogsOffsetPeer] = useState<any>({ _: 'inputPeerEmpty' });
  const [hasMoreDialogsToFetch, setHasMoreDialogsToFetch] = useState(true);
  const [isFullScanActive, setIsFullScanActive] = useState(false);

  const [isConnectedInternal, setIsConnectedInternal] = useState(initialIsConnected);
  const scanIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setIsConnectedInternal(initialIsConnected);
    if (!initialIsConnected) {
      if (isFullScanActive) {
        setIsFullScanActive(false);
        if (scanIntervalRef.current) {
          clearInterval(scanIntervalRef.current);
          scanIntervalRef.current = null;
        }
        setStatusMessage("Global Drive scan paused: Disconnected.");
      } else if (globalMediaItems.length === 0 && !isLoading && statusMessage !== "Not connected. Cannot start Global Drive scan.") {
        setStatusMessage("Global Drive: Disconnected. Connect and open to scan.");
      }
    }
  }, [initialIsConnected, isFullScanActive, globalMediaItems.length, isLoading, statusMessage]);


  const setIsConnected = useCallback((connected: boolean) => {
    setIsConnectedInternal(connected);
    if (!connected) {
      if (isFullScanActive) {
        setIsFullScanActive(false);
        if (scanIntervalRef.current) {
          clearInterval(scanIntervalRef.current);
          scanIntervalRef.current = null;
        }
        setStatusMessage("Global Drive scan paused: Disconnected.");
      } else if (globalMediaItems.length === 0 && !isLoading && statusMessage !== "Not connected. Cannot start Global Drive scan.") {
         setStatusMessage("Global Drive: Disconnected. Connect and open to scan.");
      }
    }
  }, [isFullScanActive, globalMediaItems.length, isLoading, statusMessage]);


  const resetManager = useCallback(() => {
    setGlobalMediaItems([]);
    setIsLoading(false);
    setHasMore(true);
    setStatusMessage("Initializing Global Drive...");
    allDialogsCacheRef.current = [];
    dialogsProcessQueueRef.current = [];
    setCurrentDialogsOffsetDate(0);
    setCurrentDialogsOffsetId(0);
    setCurrentDialogsOffsetPeer({ _: 'inputPeerEmpty' });
    setHasMoreDialogsToFetch(true);
    setIsFullScanActive(false);
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
  }, []);

  const fetchAndQueueDialogs = useCallback(async () => {
    if (!isConnectedInternal || !hasMoreDialogsToFetch) {
      if (!hasMoreDialogsToFetch) {
        setStatusMessage(allDialogsCacheRef.current.length > 0 ? `All ${allDialogsCacheRef.current.length} dialogs fetched. Continuing media scan...` : "No dialogs found to scan.");
      } else if (!isConnectedInternal) {
        setStatusMessage("Cannot fetch dialogs: Disconnected.");
      }
      return false;
    }

    setStatusMessage(currentDialogsOffsetId === 0
      ? "Fetching initial dialog list for Global Drive..."
      : `Fetching more dialogs... (${allDialogsCacheRef.current.length} dialogs found so far)`);

    try {
      const response = await telegramService.getTelegramChats(
        GLOBAL_DRIVE_DIALOG_FETCH_LIMIT,
        currentDialogsOffsetDate,
        currentDialogsOffsetId,
        currentDialogsOffsetPeer
      );

      const newDialogs = response.folders.filter(d => d.inputPeer && !allDialogsCacheRef.current.some(existing => existing.id === d.id));
      allDialogsCacheRef.current.push(...newDialogs);

      const newQueueItems: DialogProcessInfo[] = newDialogs.map(dialog => ({
        dialog,
        mediaOffsetId: 0,
        hasMoreMedia: true,
        attemptCount: 0,
      }));
      dialogsProcessQueueRef.current.push(...newQueueItems);

      setHasMoreDialogsToFetch(response.hasMore);
      setCurrentDialogsOffsetDate(response.nextOffsetDate);
      setCurrentDialogsOffsetId(response.nextOffsetId);
      setCurrentDialogsOffsetPeer(response.nextOffsetPeer);

      if (!response.hasMore) {
        setStatusMessage(allDialogsCacheRef.current.length > 0 ? `All ${allDialogsCacheRef.current.length} dialogs fetched. Processing media...` : "No dialogs found to scan.");
      } else {
         setStatusMessage(`Fetched ${allDialogsCacheRef.current.length} dialogs. ${dialogsProcessQueueRef.current.length} in queue. More dialogs available...`);
      }
      return true;
    } catch (error) {
      handleGlobalApiError(error, "Error Fetching Dialogs for Global Drive", "Could not load dialog list.");
      setHasMoreDialogsToFetch(false);
      setStatusMessage("Error fetching dialogs. Scan may be incomplete.");
      return false;
    }
  }, [isConnectedInternal, handleGlobalApiError, currentDialogsOffsetDate, currentDialogsOffsetId, currentDialogsOffsetPeer, hasMoreDialogsToFetch]);


  const processNextBatch = useCallback(async () => {
    if (!isFullScanActive || !isConnectedInternal) {
        if (isLoading) setIsLoading(false);
        return;
    }
    if (isLoading) return; // Prevent re-entrancy

    setIsLoading(true);

    if (dialogsProcessQueueRef.current.length > 0) {
      const processInfo = dialogsProcessQueueRef.current.shift();
      if (processInfo && processInfo.dialog.inputPeer && processInfo.hasMoreMedia && (processInfo.attemptCount || 0) < MAX_DIALOG_PROCESS_ATTEMPTS) {
        setStatusMessage(`Scanning media in: ${processInfo.dialog.name}... (${dialogsProcessQueueRef.current.length} dialogs remaining in current queue)`);
        try {
          const mediaLimitForThisDialog = processInfo.mediaOffsetId === 0
            ? GLOBAL_DRIVE_MEDIA_PER_DIALOG_INITIAL_FETCH_LIMIT
            : GLOBAL_DRIVE_MEDIA_PER_DIALOG_SUBSEQUENT_LIMIT;
          const mediaResponse = await telegramService.getChatMediaHistory(
            processInfo.dialog.inputPeer,
            mediaLimitForThisDialog,
            processInfo.mediaOffsetId,
            false // isCloudChannelFetch is false for default global drive
          );

          if (mediaResponse.files.length > 0) {
            setGlobalMediaItems(prevItems => {
              const existingIds = new Set(prevItems.map(item => item.id));
              const newUniqueFiles = mediaResponse.files.filter(file => !existingIds.has(file.id));
              return [...prevItems, ...newUniqueFiles].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
            });
          }

          processInfo.mediaOffsetId = mediaResponse.nextOffsetId || 0;
          processInfo.hasMoreMedia = mediaResponse.hasMore;

          if (mediaResponse.hasMore) {
            processInfo.attemptCount = 0; // Reset attempts on successful fetch with more media
            dialogsProcessQueueRef.current.push(processInfo); // Re-queue if more media
          } else {
            processInfo.isFullyScanned = true; // Mark as fully scanned for this dialog
          }
        } catch (error: any) {
          handleGlobalApiError(error, `Error Fetching Media for ${processInfo.dialog.name}`, `Skipping ${processInfo.dialog.name} after error: ${error.message}`);
          processInfo.hasMoreMedia = false; // Assume no more media on error for this dialog
          processInfo.isFullyScanned = true;
          processInfo.attemptCount = (processInfo.attemptCount || 0) + 1;
          if (processInfo.attemptCount < MAX_DIALOG_PROCESS_ATTEMPTS && !error.message?.includes('AUTH_RESTART')) {
             dialogsProcessQueueRef.current.unshift(processInfo); // Re-queue for another attempt if not auth error
          }
        }
      } else if (processInfo && processInfo.attemptCount && processInfo.attemptCount >= MAX_DIALOG_PROCESS_ATTEMPTS) {
        processInfo.isFullyScanned = true; // Max attempts reached
      }
    }

    if (dialogsProcessQueueRef.current.length === 0 && hasMoreDialogsToFetch) {
      await fetchAndQueueDialogs();
    }

    const stillMoreDialogsToFetchOverall = hasMoreDialogsToFetch;
    const stillDialogsWithMediaToScanInQueue = dialogsProcessQueueRef.current.some(info => info.hasMoreMedia && !info.isFullyScanned);
    const newOverallHasMoreState = stillMoreDialogsToFetchOverall || stillDialogsWithMediaToScanInQueue;
    setHasMore(newOverallHasMoreState);

    if (!newOverallHasMoreState) {
      setIsFullScanActive(false);
      setStatusMessage(globalMediaItems.length > 0 ? "Global Drive scan complete. All accessible media loaded." : "Global Drive scan complete. No media items found.");
    } else if (isFullScanActive) {
      const activeDialogsInQueue = dialogsProcessQueueRef.current.filter(info => info.hasMoreMedia && !info.isFullyScanned).length;
      setStatusMessage(`Processing... Dialogs in queue: ${activeDialogsInQueue} of ${allDialogsCacheRef.current.length}. More dialogs to fetch: ${hasMoreDialogsToFetch}.`);
    }
    setIsLoading(false);
  }, [
      isFullScanActive, isLoading, isConnectedInternal,
      fetchAndQueueDialogs, handleGlobalApiError,
      hasMoreDialogsToFetch, globalMediaItems.length
  ]);

  useEffect(() => {
    if (isFullScanActive && isConnectedInternal) {
      if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = setInterval(async () => {
        if (!isLoading) {
            await processNextBatch();
        }
      }, 750);
    } else {
      if (scanIntervalRef.current) {
        clearInterval(scanIntervalRef.current);
        scanIntervalRef.current = null;
      }
      if (!isFullScanActive && isLoading) {
          setIsLoading(false);
      }
    }
    return () => {
      if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
    };
  }, [isFullScanActive, isConnectedInternal, processNextBatch, isLoading]);


  const fetchInitialGlobalMedia = useCallback(async () => {
    if (!isConnectedInternal) {
      setStatusMessage("Not connected. Cannot start Global Drive scan.");
      setIsLoading(false);
      setIsFullScanActive(false);
      return;
    }
    setIsLoading(true);
    resetManager();
    setStatusMessage("Starting Global Drive scan...");
    setIsFullScanActive(true);
  }, [isConnectedInternal, resetManager]);


  const loadMoreGlobalMedia = useCallback(() => {
    if (!isConnectedInternal) {
        toast({ title: "Not Connected", description: "Cannot load more, not connected to Telegram.", variant: "default" });
        return;
    }
    if (isLoading) {
      toast({ title: "Scan in Progress", description: "Global Drive is already loading.", variant: "default"});
      return;
    }
    if (!isFullScanActive && hasMore) {
      setStatusMessage("Resuming Global Drive scan...");
      setIsFullScanActive(true); // This will trigger the useEffect to start the interval
      toast({ title: "Resuming Global Scan...", description: "Continuing to fetch all media."});
    } else if (!hasMore) {
      toast({ title: "All Loaded", description: "All accessible media has been loaded.", variant: "default"});
    } else if (isFullScanActive) {
      toast({ title: "Scan Active", description: "Global Drive scan is already running.", variant: "default"});
    }
  }, [isFullScanActive, hasMore, isConnectedInternal, isLoading, toast]);

  return {
    globalMediaItems,
    isLoading,
    hasMore,
    statusMessage,
    fetchInitialGlobalMedia,
    loadMoreGlobalMedia,
    resetManager,
    setIsConnected,
    setGlobalMediaItemsDirectly: setGlobalMediaItems,
    isFullScanActive,
  };
}

