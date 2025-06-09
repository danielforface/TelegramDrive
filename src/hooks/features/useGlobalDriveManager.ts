"use client";

import { useState, useCallback, useEffect, useRef } from 'react';
import type { CloudFile, CloudFolder, MediaHistoryResponse, InputPeer } from '@/types';
import * as telegramService from '@/services/telegramService';
import type { useToast } from "@/hooks/use-toast";

const GLOBAL_DRIVE_DIALOG_FETCH_LIMIT = 50;
const GLOBAL_DRIVE_MEDIA_PER_DIALOG_INITIAL_FETCH_LIMIT = 100;
const GLOBAL_DRIVE_MEDIA_PER_DIALOG_SUBSEQUENT_LIMIT = 50;
const MEDIA_ITEMS_FETCH_THRESHOLD_PER_SESSION = 1000;


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
  const processedDialogsCountRef = useRef(0);
  const fetchedItemsInCurrentScanSessionRef = useRef(0);

  useEffect(() => {
    setIsConnectedInternal(initialIsConnected);
  }, [initialIsConnected]);

  const setIsConnected = useCallback((connected: boolean) => {
    setIsConnectedInternal(connected);
  }, []);


  const resetManager = useCallback((resetStatusMsg = true) => {
    setGlobalMediaItems([]);
    setHasMore(true);
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
    processedDialogsCountRef.current = 0;
    fetchedItemsInCurrentScanSessionRef.current = 0; // Reset session counter
    setIsLoading(false);
    if (resetStatusMsg) {
      setStatusMessage("Global Drive: Idle. Open to start scanning.");
    }
  }, []);

  const fetchAndQueueDialogs = useCallback(async () => {
    if (!isConnectedInternal) {
      setStatusMessage("Cannot fetch dialogs: Disconnected.");
      return false;
    }
    if (!hasMoreDialogsToFetch) {
      if (allDialogsCacheRef.current.length > 0) {
        setStatusMessage(`All ${allDialogsCacheRef.current.length} dialogs fetched. Continuing media scan...`);
      } else {
        setStatusMessage("No dialogs found to scan.");
      }
      return false;
    }

    setStatusMessage(currentDialogsOffsetId === 0
      ? `Fetching initial dialog list for Global Drive... (Found ${allDialogsCacheRef.current.length})`
      : `Fetching more dialogs... (Found ${allDialogsCacheRef.current.length} so far)`);

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
        setStatusMessage(`All ${allDialogsCacheRef.current.length} dialogs fetched. Processing media...`);
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
    if (!isFullScanActive || !isConnectedInternal || isLoading) {
        return;
    }
    setIsLoading(true);

    try {
        if (dialogsProcessQueueRef.current.length > 0) {
          const processInfo = dialogsProcessQueueRef.current.shift();
          if (processInfo && processInfo.dialog.inputPeer && processInfo.hasMoreMedia && (processInfo.attemptCount || 0) < MAX_DIALOG_PROCESS_ATTEMPTS) {
            const currentDialogName = processInfo.dialog.name;
            const dialogsInQueueCount = dialogsProcessQueueRef.current.length;
            const totalDialogsFetched = allDialogsCacheRef.current.length;
            setStatusMessage(`Scanning media in: ${currentDialogName}... (Dialogs Queued: ${dialogsInQueueCount}/${totalDialogsFetched}, More Dialogs From Server: ${hasMoreDialogsToFetch})`);

            try {
              const mediaLimitForThisDialog = processInfo.mediaOffsetId === 0
                ? GLOBAL_DRIVE_MEDIA_PER_DIALOG_INITIAL_FETCH_LIMIT
                : GLOBAL_DRIVE_MEDIA_PER_DIALOG_SUBSEQUENT_LIMIT;
              const mediaResponse = await telegramService.getChatMediaHistory(
                processInfo.dialog.inputPeer,
                mediaLimitForThisDialog,
                processInfo.mediaOffsetId,
                false
              );

              if (mediaResponse.files.length > 0) {
                setGlobalMediaItems(prevItems => {
                  const existingIds = new Set(prevItems.map(item => item.id));
                  const newUniqueFiles = mediaResponse.files.filter(file => !existingIds.has(file.id));
                  fetchedItemsInCurrentScanSessionRef.current += newUniqueFiles.length;
                  return [...prevItems, ...newUniqueFiles].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
                });
              }

              processInfo.mediaOffsetId = mediaResponse.nextOffsetId || 0;
              processInfo.hasMoreMedia = mediaResponse.hasMore;

              if (mediaResponse.hasMore) {
                processInfo.attemptCount = 0;
                dialogsProcessQueueRef.current.push(processInfo);
              } else {
                processInfo.isFullyScanned = true;
                processedDialogsCountRef.current += 1;
              }
            } catch (error: any) {
              handleGlobalApiError(error, `Error Fetching Media for ${processInfo.dialog.name}`, `Skipping ${processInfo.dialog.name} after error: ${error.message}`);
              processInfo.hasMoreMedia = false;
              processInfo.isFullyScanned = true;
              processInfo.attemptCount = (processInfo.attemptCount || 0) + 1;
              if (processInfo.attemptCount < MAX_DIALOG_PROCESS_ATTEMPTS && !error.message?.includes('AUTH_RESTART')) {
                 dialogsProcessQueueRef.current.unshift(processInfo);
              } else {
                processedDialogsCountRef.current += 1;
              }
            }
          } else if (processInfo && processInfo.attemptCount && processInfo.attemptCount >= MAX_DIALOG_PROCESS_ATTEMPTS) {
            processInfo.isFullyScanned = true;
            processedDialogsCountRef.current += 1;
          } else if (processInfo && !processInfo.hasMoreMedia && !processInfo.isFullyScanned) {
            processInfo.isFullyScanned = true;
            processedDialogsCountRef.current += 1;
          }
        }

        if (dialogsProcessQueueRef.current.length === 0 && hasMoreDialogsToFetch) {
          await fetchAndQueueDialogs();
        }

        const stillMoreDialogsToFetchOverall = hasMoreDialogsToFetch;
        const stillDialogsWithMediaToScanInQueue = dialogsProcessQueueRef.current.some(info => info.hasMoreMedia && !info.isFullyScanned);
        const newOverallHasMoreState = stillMoreDialogsToFetchOverall || stillDialogsWithMediaToScanInQueue;
        setHasMore(newOverallHasMoreState);

        if (fetchedItemsInCurrentScanSessionRef.current >= MEDIA_ITEMS_FETCH_THRESHOLD_PER_SESSION && newOverallHasMoreState) {
          setIsFullScanActive(false); // Pause automatic scanning
          setStatusMessage(`Scan paused after fetching ${fetchedItemsInCurrentScanSessionRef.current} items. Click "Resume Scan" to continue.`);
        } else if (!newOverallHasMoreState) {
          setIsFullScanActive(false);
          const finalStatus = globalMediaItems.length > 0
            ? `Global Drive scan complete. ${processedDialogsCountRef.current} dialogs processed. Found ${globalMediaItems.length} items.`
            : `Global Drive scan complete. ${processedDialogsCountRef.current} dialogs processed. No media items found.`;
          setStatusMessage(finalStatus);
        } else if (isFullScanActive) {
          const activeDialogsInQueue = dialogsProcessQueueRef.current.filter(info => info.hasMoreMedia && !info.isFullyScanned).length;
          const currentDialogName = dialogsProcessQueueRef.current[0]?.dialog.name || "next available";
          setStatusMessage(`Scanning media in: ${currentDialogName}... (Dialogs Queued: ${activeDialogsInQueue}/${allDialogsCacheRef.current.length}, More Dialogs From Server: ${hasMoreDialogsToFetch})`);
        }
    } catch (e: any) {
        setStatusMessage(`An unexpected error occurred during scan: ${e.message}`);
        setIsFullScanActive(false);
    } finally {
        setIsLoading(false);
    }
  }, [
      isFullScanActive, isLoading, isConnectedInternal,
      fetchAndQueueDialogs, handleGlobalApiError,
      hasMoreDialogsToFetch, globalMediaItems.length
  ]);

  useEffect(() => {
    if (isFullScanActive && isConnectedInternal) {
      if (!isLoading) {
        processNextBatch();
      }
      if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = setInterval(async () => {
        if (!isLoading) {
            await processNextBatch();
        }
      }, 1000);
    } else {
      if (scanIntervalRef.current) {
        clearInterval(scanIntervalRef.current);
        scanIntervalRef.current = null;
      }
      if (isFullScanActive && !isConnectedInternal) {
        setStatusMessage("Global Drive scan paused: Disconnected.");
        setIsFullScanActive(false);
        if (isLoading) setIsLoading(false);
      } else if (!isFullScanActive && !isConnectedInternal && globalMediaItems.length === 0 && !isLoading) {
         setStatusMessage("Global Drive: Disconnected. Connect and open to scan.");
      }
    }
    return () => {
      if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
    };
  }, [isFullScanActive, isConnectedInternal, processNextBatch, isLoading, globalMediaItems.length]);


  const fetchInitialGlobalMedia = useCallback(() => {
    if (!isConnectedInternal) {
      setStatusMessage("Cannot start Global Drive scan: Not connected.");
      return;
    }
    setStatusMessage("Starting Global Drive scan...");
    resetManager(false); // Don't reset status message here
    setIsFullScanActive(true);
    fetchedItemsInCurrentScanSessionRef.current = 0; // Reset for new full scan
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
      setIsFullScanActive(true);
      fetchedItemsInCurrentScanSessionRef.current = 0; // Reset counter for this "resume" session
      toast({ title: "Resuming Full Scan...", description: "Continuing to fetch all media."});
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
