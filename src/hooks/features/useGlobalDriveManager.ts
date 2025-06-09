
"use client";

import { useState, useCallback, useEffect, useRef } from 'react';
import type { CloudFile, CloudFolder, MediaHistoryResponse, InputPeer } from '@/types';
import * as telegramService from '@/services/telegramService';
import type { useToast } from "@/hooks/use-toast";

const GLOBAL_DRIVE_DIALOG_FETCH_LIMIT = 50;
const GLOBAL_DRIVE_MEDIA_PER_DIALOG_INITIAL_FETCH_LIMIT = 100;
const GLOBAL_DRIVE_MEDIA_PER_DIALOG_SUBSEQUENT_LIMIT = 50;

const INITIAL_GLOBAL_SCAN_FETCH_TARGET = 1000;
const INCREMENTAL_GLOBAL_SCAN_FETCH_TARGET = 200; // Smaller batches for incremental resume

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
  const [isScanBatchActive, setIsScanBatchActive] = useState(false);

  const allDialogsCacheRef = useRef<CloudFolder[]>([]);
  const dialogsProcessQueueRef = useRef<DialogProcessInfo[]>([]);

  const [currentDialogsOffsetDate, setCurrentDialogsOffsetDate] = useState(0);
  const [currentDialogsOffsetId, setCurrentDialogsOffsetId] = useState(0);
  const [currentDialogsOffsetPeer, setCurrentDialogsOffsetPeer] = useState<any>({ _: 'inputPeerEmpty' });
  const [hasMoreDialogsToFetch, setHasMoreDialogsToFetch] = useState(true);

  const isInitialScanPhaseRef = useRef(true);
  const fetchedItemsInCurrentBatchRef = useRef(0);

  const [isConnectedInternal, setIsConnectedInternal] = useState(initialIsConnected);
  const scanIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const processedDialogsCountRef = useRef(0);

  const setIsConnected = useCallback((connected: boolean) => {
    setIsConnectedInternal(connected);
  }, [setIsConnectedInternal]);

  useEffect(() => {
    setIsConnectedInternal(initialIsConnected);
  }, [initialIsConnected]);

  const resetManager = useCallback((resetStatusMsg = true) => {
    setGlobalMediaItems([]);
    setHasMore(true);
    allDialogsCacheRef.current = [];
    dialogsProcessQueueRef.current = [];
    setCurrentDialogsOffsetDate(0);
    setCurrentDialogsOffsetId(0);
    setCurrentDialogsOffsetPeer({ _: 'inputPeerEmpty' });
    setHasMoreDialogsToFetch(true);
    setIsScanBatchActive(false);
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
    processedDialogsCountRef.current = 0;
    fetchedItemsInCurrentBatchRef.current = 0;
    isInitialScanPhaseRef.current = true;
    setIsLoading(false);
    if (resetStatusMsg) {
      setStatusMessage("Global Drive: Idle. Open to start scanning.");
    }
  }, [setStatusMessage, setIsLoading, setHasMore, setIsScanBatchActive]);

  const fetchAndQueueDialogs = useCallback(async (): Promise<boolean> => {
    if (!isConnectedInternal) {
      setStatusMessage("Cannot fetch dialogs: Disconnected.");
      return false;
    }
    if (!hasMoreDialogsToFetch) {
      setStatusMessage(`All ${allDialogsCacheRef.current.length} dialogs previously fetched. Processing media...`);
      return false;
    }

    const initialFetch = currentDialogsOffsetId === 0 && allDialogsCacheRef.current.length === 0;
    setStatusMessage(initialFetch
      ? `Fetching initial dialog list... (Found ${allDialogsCacheRef.current.length})`
      : `Fetching more dialogs... (Found ${allDialogsCacheRef.current.length} so far)`);

    try {
      const response = await telegramService.getTelegramChats(
        GLOBAL_DRIVE_DIALOG_FETCH_LIMIT,
        currentDialogsOffsetDate,
        currentDialogsOffsetId,
        currentDialogsOffsetPeer
      );

      const newDialogsFromServer = response.folders.filter(d => d.inputPeer);
      newDialogsFromServer.forEach(nd => {
        if (!allDialogsCacheRef.current.some(existing => existing.id === nd.id)) {
          allDialogsCacheRef.current.push(nd);
        }
      });

      const newQueueItems: DialogProcessInfo[] = newDialogsFromServer
        .filter(dialog => !dialogsProcessQueueRef.current.some(qi => qi.dialog.id === dialog.id))
        .map(dialog => ({
          dialog, mediaOffsetId: 0, hasMoreMedia: true, attemptCount: 0, isFullyScanned: false,
        }));
      dialogsProcessQueueRef.current.push(...newQueueItems);

      setHasMoreDialogsToFetch(response.hasMore);
      setCurrentDialogsOffsetDate(response.nextOffsetDate);
      setCurrentDialogsOffsetId(response.nextOffsetId);
      setCurrentDialogsOffsetPeer(response.nextOffsetPeer);

      if (!response.hasMore) {
        setStatusMessage(`All ${allDialogsCacheRef.current.length} dialogs fetched. Total in queue: ${dialogsProcessQueueRef.current.length}. Processing media...`);
      } else {
        setStatusMessage(`Fetched ${allDialogsCacheRef.current.length} dialogs. ${dialogsProcessQueueRef.current.length} in queue. More from server: ${response.hasMore}`);
      }
      return newDialogsFromServer.length > 0 || newQueueItems.length > 0;
    } catch (error) {
      handleGlobalApiError(error, "Error Fetching Dialogs for Global Drive", "Could not load dialog list.");
      setHasMoreDialogsToFetch(false);
      setStatusMessage("Error fetching dialogs. Scan may be incomplete.");
      return false;
    }
  }, [isConnectedInternal, handleGlobalApiError, currentDialogsOffsetDate, currentDialogsOffsetId, currentDialogsOffsetPeer, hasMoreDialogsToFetch, setStatusMessage]);

  const processNextBatch = useCallback(async () => {
    if (isLoading || !isScanBatchActive || !isConnectedInternal) {
      return;
    }
    setIsLoading(true);

    try {
      const currentBatchTargetLimit = isInitialScanPhaseRef.current
        ? INITIAL_GLOBAL_SCAN_FETCH_TARGET
        : INCREMENTAL_GLOBAL_SCAN_FETCH_TARGET;

      if (fetchedItemsInCurrentBatchRef.current >= currentBatchTargetLimit && hasMore) {
        setIsScanBatchActive(false);
        setStatusMessage(`Batch complete (${fetchedItemsInCurrentBatchRef.current} items). ${globalMediaItems.length} total. ${dialogsProcessQueueRef.current.length} dialogs pending. Resume to load next.`);
        setIsLoading(false);
        return;
      }

      if (dialogsProcessQueueRef.current.length === 0 && hasMoreDialogsToFetch) {
        const fetchedNewDialogs = await fetchAndQueueDialogs();
        if (!fetchedNewDialogs && dialogsProcessQueueRef.current.length === 0 && !hasMoreDialogsToFetch) {
            setHasMore(false);
            setIsScanBatchActive(false);
            const finalStatus = globalMediaItems.length > 0
              ? `Global Drive scan complete. ${processedDialogsCountRef.current} dialogs processed. Found ${globalMediaItems.length} items.`
              : `Global Drive scan complete. ${processedDialogsCountRef.current} dialogs processed. No media items found.`;
            setStatusMessage(finalStatus);
            setIsLoading(false);
            return;
        }
      }

      let overallMoreToFetch = hasMore;

      if (dialogsProcessQueueRef.current.length > 0) {
        const processInfo = dialogsProcessQueueRef.current.shift();
        if (processInfo && processInfo.dialog.inputPeer && processInfo.hasMoreMedia && (processInfo.attemptCount || 0) < MAX_DIALOG_PROCESS_ATTEMPTS) {
          const currentDialogName = processInfo.dialog.name;
          const totalKnownDialogs = allDialogsCacheRef.current.length;
          const dialogsRemainingInQueue = dialogsProcessQueueRef.current.length;

          setStatusMessage(`Scanning media in: ${currentDialogName}... (Dialogs Queued: ${dialogsRemainingInQueue}/${totalKnownDialogs}, Batch: ${fetchedItemsInCurrentBatchRef.current}/${currentBatchTargetLimit})`);

          try {
            const mediaLimitForThisDialog = processInfo.mediaOffsetId === 0
              ? GLOBAL_DRIVE_MEDIA_PER_DIALOG_INITIAL_FETCH_LIMIT
              : GLOBAL_DRIVE_MEDIA_PER_DIALOG_SUBSEQUENT_LIMIT;

            const mediaResponse = await telegramService.getChatMediaHistory(
              processInfo.dialog.inputPeer, mediaLimitForThisDialog, processInfo.mediaOffsetId, false
            );

            if (mediaResponse.files.length > 0) {
              setGlobalMediaItems(prevItems => {
                const existingIds = new Set(prevItems.map(item => item.id));
                const newUniqueFiles = mediaResponse.files.filter(file => !existingIds.has(file.id));
                fetchedItemsInCurrentBatchRef.current += newUniqueFiles.length;
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
              if (!allDialogsCacheRef.current.find(d => d.id === processInfo.dialog.id)?.isFullyScannedForGlobalDrive) {
                 processedDialogsCountRef.current += 1;
                 const dialogInCache = allDialogsCacheRef.current.find(d => d.id === processInfo.dialog.id);
                 if (dialogInCache) (dialogInCache as any).isFullyScannedForGlobalDrive = true;
              }
            }
          } catch (error: any) {
            handleGlobalApiError(error, `Error Fetching Media for ${processInfo.dialog.name}`, `Skipping ${processInfo.dialog.name} after error: ${error.message}`);
            processInfo.hasMoreMedia = false;
            processInfo.isFullyScanned = true;
            processInfo.attemptCount = (processInfo.attemptCount || 0) + 1;
            if (processInfo.attemptCount < MAX_DIALOG_PROCESS_ATTEMPTS && !String(error.message).includes('AUTH_RESTART')) {
              dialogsProcessQueueRef.current.unshift(processInfo);
            } else {
                if (!allDialogsCacheRef.current.find(d => d.id === processInfo.dialog.id)?.isFullyScannedForGlobalDrive) {
                   processedDialogsCountRef.current += 1;
                   const dialogInCache = allDialogsCacheRef.current.find(d => d.id === processInfo.dialog.id);
                   if (dialogInCache) (dialogInCache as any).isFullyScannedForGlobalDrive = true;
                }
            }
          }
        } else if (processInfo && !processInfo.hasMoreMedia && !processInfo.isFullyScanned) {
            processInfo.isFullyScanned = true;
            if (!allDialogsCacheRef.current.find(d => d.id === processInfo.dialog.id)?.isFullyScannedForGlobalDrive) {
                processedDialogsCountRef.current += 1;
                const dialogInCache = allDialogsCacheRef.current.find(d => d.id === processInfo.dialog.id);
                if (dialogInCache) (dialogInCache as any).isFullyScannedForGlobalDrive = true;
            }
        }
      }

      const anyDialogInQueueHasMoreMedia = dialogsProcessQueueRef.current.some(info => info.hasMoreMedia && !info.isFullyScanned);
      overallMoreToFetch = hasMoreDialogsToFetch || anyDialogInQueueHasMoreMedia;
      setHasMore(overallMoreToFetch);

      if (fetchedItemsInCurrentBatchRef.current >= currentBatchTargetLimit && overallMoreToFetch) {
        setIsScanBatchActive(false);
        setStatusMessage(`Batch complete (${fetchedItemsInCurrentBatchRef.current} items). ${globalMediaItems.length} total. ${dialogsProcessQueueRef.current.length} dialogs pending. Resume to load next.`);
      } else if (!overallMoreToFetch) {
        setIsScanBatchActive(false);
        const finalStatus = globalMediaItems.length > 0
          ? `Global Drive scan complete. ${processedDialogsCountRef.current} dialogs processed. Found ${globalMediaItems.length} items.`
          : `Global Drive scan complete. ${processedDialogsCountRef.current} dialogs processed. No media items found.`;
        setStatusMessage(finalStatus);
      } else if (isScanBatchActive) {
        const activeDialogsInQueue = dialogsProcessQueueRef.current.length;
        const totalKnownDialogs = allDialogsCacheRef.current.length;
        const nextDialogToProcessName = dialogsProcessQueueRef.current[0]?.dialog.name || (hasMoreDialogsToFetch ? "next list of chats" : "remaining chats in queue");
        setStatusMessage(`Scanning media in: ${nextDialogToProcessName}... (Dialogs Queued: ${activeDialogsInQueue}/${totalKnownDialogs}, Batch: ${fetchedItemsInCurrentBatchRef.current}/${currentBatchTargetLimit})`);
      }

    } catch (e: any) {
      setStatusMessage(`An unexpected error occurred during scan: ${e.message}`);
      setIsScanBatchActive(false);
    } finally {
      setIsLoading(false);
    }
  }, [
    isLoading, isScanBatchActive, isConnectedInternal, fetchAndQueueDialogs, handleGlobalApiError,
    globalMediaItems.length, hasMore, hasMoreDialogsToFetch,
    setHasMore, setIsLoading, setIsScanBatchActive, setStatusMessage,
  ]);


 useEffect(() => {
    if (!initialIsConnected && isScanBatchActive) {
      setIsScanBatchActive(false);
      if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
      setStatusMessage("Global Drive scan paused: Disconnected.");
      setIsLoading(false);
    } else if (!initialIsConnected && globalMediaItems.length === 0 && !isLoading) {
      setStatusMessage("Global Drive: Disconnected. Connect and open to scan.");
    }
  }, [initialIsConnected, isScanBatchActive, globalMediaItems.length, isLoading, setStatusMessage, setIsScanBatchActive, setIsLoading]);


  useEffect(() => {
    if (isScanBatchActive && isConnectedInternal) {
      if (!isLoading) {
        processNextBatch();
      }
      if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = setInterval(async () => {
        if (!isLoading && isScanBatchActive && isConnectedInternal) {
          await processNextBatch();
        } else if (!isScanBatchActive || !isConnectedInternal) {
          if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
        }
      }, 1000);
    } else {
      if (scanIntervalRef.current) {
        clearInterval(scanIntervalRef.current);
        scanIntervalRef.current = null;
      }
      if (isLoading) {
          setIsLoading(false);
      }
    }
    return () => {
      if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
    };
  }, [isScanBatchActive, isConnectedInternal, isLoading, processNextBatch]);

  const fetchInitialGlobalMedia = useCallback(() => {
    setIsConnectedInternal(initialIsConnected);
    if (!initialIsConnected) {
      setStatusMessage("Not connected. Cannot start Global Drive scan.");
      return;
    }
    setStatusMessage("Starting initial Global Drive scan...");
    resetManager(false);
    isInitialScanPhaseRef.current = true;
    fetchedItemsInCurrentBatchRef.current = 0;
    setIsScanBatchActive(true);
  }, [initialIsConnected, resetManager, setStatusMessage, setIsScanBatchActive]);


  const loadMoreGlobalMedia = useCallback(() => {
    setIsConnectedInternal(initialIsConnected);

    if (!isConnectedInternal) {
      toast({ title: "Not Connected", description: "Cannot load more, not connected to Telegram.", variant: "default" });
      return;
    }
    if (isLoading || isScanBatchActive) {
      toast({ title: "Scan Active", description: "Global Drive scan is already running or loading.", variant: "default" });
      return;
    }

    if (hasMore) {
      setStatusMessage("Loading next batch of media...");
      isInitialScanPhaseRef.current = false;
      fetchedItemsInCurrentBatchRef.current = 0;
      setIsScanBatchActive(true);
    } else {
      toast({ title: "All Loaded", description: "All accessible media has been loaded.", variant: "default" });
      const finalStatus = globalMediaItems.length > 0
        ? `Global Drive scan complete. ${processedDialogsCountRef.current} dialogs processed. Found ${globalMediaItems.length} items.`
        : `Global Drive scan complete. ${processedDialogsCountRef.current} dialogs processed. No media items found.`;
      setStatusMessage(finalStatus);
    }
  }, [initialIsConnected, isConnectedInternal, isLoading, isScanBatchActive, hasMore, toast, globalMediaItems.length, setIsScanBatchActive, setStatusMessage]);


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
    isScanBatchActive,
  };
}

