
"use client";

import { useState, useCallback, useEffect, useRef } from 'react';
import type { CloudFile, CloudFolder, MediaHistoryResponse, InputPeer } from '@/types';
import * as telegramService from '@/services/telegramService';
import type { useToast } from "@/hooks/use-toast";

const GLOBAL_DRIVE_DIALOG_FETCH_LIMIT = 50; // How many dialogs to fetch in one go
const GLOBAL_DRIVE_MEDIA_PER_DIALOG_INITIAL_FETCH_LIMIT = 100; // For the first fetch from a dialog
const GLOBAL_DRIVE_MEDIA_PER_DIALOG_SUBSEQUENT_LIMIT = 50;  // For subsequent fetches from the same dialog

// Scan Phase Targets
const INITIAL_GLOBAL_SCAN_FETCH_TARGET = 1000; // Target for the first automatic scan phase
const INCREMENTAL_GLOBAL_SCAN_FETCH_TARGET = 200; // Target for subsequent manual "Load More" phases


interface UseGlobalDriveManagerProps {
  toast: ReturnType<typeof useToast>['toast'];
  handleGlobalApiError: (error: any, title: string, defaultMessage: string, doPageReset?: boolean) => void;
  isConnected: boolean; // This is the `initialIsConnected` prop
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
  const [hasMore, setHasMore] = useState(true); // Overall, if there's more data to fetch
  const [statusMessage, setStatusMessage] = useState<string | null>("Global Drive: Idle. Open to start scanning.");

  const allDialogsCacheRef = useRef<CloudFolder[]>([]);
  const dialogsProcessQueueRef = useRef<DialogProcessInfo[]>([]);

  const [currentDialogsOffsetDate, setCurrentDialogsOffsetDate] = useState(0);
  const [currentDialogsOffsetId, setCurrentDialogsOffsetId] = useState(0);
  const [currentDialogsOffsetPeer, setCurrentDialogsOffsetPeer] = useState<any>({ _: 'inputPeerEmpty' });
  const [hasMoreDialogsToFetch, setHasMoreDialogsToFetch] = useState(true);

  const [isScanBatchActive, setIsScanBatchActive] = useState(false);
  const isInitialScanPhaseRef = useRef(true);
  const fetchedItemsInCurrentBatchRef = useRef(0);

  const [isConnectedInternal, setIsConnectedInternal] = useState(initialIsConnected);
  const scanIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const processedDialogsCountRef = useRef(0);
  const scanActiveButWaitingForConnectionRef = useRef(false);


  const setIsConnected = useCallback((connected: boolean) => {
    setIsConnectedInternal(connected);
  }, [setIsConnectedInternal]);

  useEffect(() => {
    setIsConnectedInternal(initialIsConnected); // Sync with prop
    if (!initialIsConnected) {
      if (isScanBatchActive) {
        setIsScanBatchActive(false); // Stop scan if connection drops
        if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
        setStatusMessage("Global Drive scan paused: Disconnected.");
        setIsLoading(false);
      } else if (globalMediaItems.length === 0 && !isLoading) {
        setStatusMessage("Global Drive: Disconnected. Connect and open to scan.");
      }
    } else {
        // If connection is restored and a scan was pending, it will be picked up by the main scan useEffect
        if (scanActiveButWaitingForConnectionRef.current && !isScanBatchActive) {
            // Potentially restart the scan if it was flagged as waiting
        }
    }
  }, [initialIsConnected, isScanBatchActive, globalMediaItems.length, isLoading]);


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
    scanActiveButWaitingForConnectionRef.current = false;
    if (resetStatusMsg) {
      setStatusMessage("Global Drive: Idle. Open to start scanning.");
    }
  }, []);

  const fetchAndQueueDialogs = useCallback(async () => {
    if (!isConnectedInternal) {
      setStatusMessage("Cannot fetch dialogs: Disconnected.");
      return false;
    }
    if (!hasMoreDialogsToFetch && allDialogsCacheRef.current.length > 0) {
      setStatusMessage(`All ${allDialogsCacheRef.current.length} dialogs fetched. Processing media...`);
      return false;
    }
     if (!hasMoreDialogsToFetch && allDialogsCacheRef.current.length === 0) {
      setStatusMessage("No dialogs found to scan.");
      setHasMore(false); // No dialogs, so no more media overall
      return false;
    }

    const initialFetch = currentDialogsOffsetId === 0 && allDialogsCacheRef.current.length === 0;
    setStatusMessage(initialFetch
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
      return true; // Indicated that dialogs were fetched or state was updated
    } catch (error) {
      handleGlobalApiError(error, "Error Fetching Dialogs for Global Drive", "Could not load dialog list.");
      setHasMoreDialogsToFetch(false);
      setStatusMessage("Error fetching dialogs. Scan may be incomplete.");
      return false;
    }
  }, [isConnectedInternal, handleGlobalApiError, currentDialogsOffsetDate, currentDialogsOffsetId, currentDialogsOffsetPeer, hasMoreDialogsToFetch]);


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
            setStatusMessage(`Batch complete (${fetchedItemsInCurrentBatchRef.current} items). ${globalMediaItems.length} total. Resume to load next batch.`);
            setIsLoading(false);
            return;
        }

        if (dialogsProcessQueueRef.current.length === 0 && hasMoreDialogsToFetch) {
          await fetchAndQueueDialogs();
          // After fetching, if queue is still empty but more dialogs were supposed to be fetched, it implies an issue or end.
          // If fetchAndQueueDialogs sets hasMoreDialogsToFetch to false, this will be handled in next check.
        }

        let newOverallHasMoreState = hasMore; // Assume current hasMore unless proven otherwise

        if (dialogsProcessQueueRef.current.length > 0) {
          const processInfo = dialogsProcessQueueRef.current.shift(); // Take one dialog to process
          if (processInfo && processInfo.dialog.inputPeer && processInfo.hasMoreMedia && (processInfo.attemptCount || 0) < MAX_DIALOG_PROCESS_ATTEMPTS) {
            const currentDialogName = processInfo.dialog.name;
            const totalDialogs = allDialogsCacheRef.current.length;
            const dialogsRemainingInQueue = dialogsProcessQueueRef.current.length;

            setStatusMessage(`Scanning media in: ${currentDialogName}... (Dialogs Queued: ${dialogsRemainingInQueue}/${totalDialogs}, Batch: ${fetchedItemsInCurrentBatchRef.current}/${currentBatchTargetLimit})`);

            try {
              const mediaLimitForThisDialog = processInfo.mediaOffsetId === 0
                ? GLOBAL_DRIVE_MEDIA_PER_DIALOG_INITIAL_FETCH_LIMIT
                : GLOBAL_DRIVE_MEDIA_PER_DIALOG_SUBSEQUENT_LIMIT;
              const mediaResponse = await telegramService.getChatMediaHistory(
                processInfo.dialog.inputPeer,
                mediaLimitForThisDialog,
                processInfo.mediaOffsetId,
                false // Global drive fetches all media types, not just 'cloud channel' VFS structure
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
                dialogsProcessQueueRef.current.push(processInfo); // Re-queue if this dialog still has more media
              } else {
                processInfo.isFullyScanned = true;
                processedDialogsCountRef.current += 1;
              }
            } catch (error: any) {
              handleGlobalApiError(error, `Error Fetching Media for ${processInfo.dialog.name}`, `Skipping ${processInfo.dialog.name} after error: ${error.message}`);
              processInfo.hasMoreMedia = false; // Stop processing this dialog
              processInfo.isFullyScanned = true; // Mark as scanned (due to error)
              processInfo.attemptCount = (processInfo.attemptCount || 0) + 1;
              if (processInfo.attemptCount < MAX_DIALOG_PROCESS_ATTEMPTS && !String(error.message).includes('AUTH_RESTART')) {
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

        // Update overall hasMore state
        const anyDialogHasMoreMedia = dialogsProcessQueueRef.current.some(info => info.hasMoreMedia && !info.isFullyScanned);
        newOverallHasMoreState = hasMoreDialogsToFetch || anyDialogHasMoreMedia;
        setHasMore(newOverallHasMoreState);

        // Check for batch completion or full scan completion
        if (fetchedItemsInCurrentBatchRef.current >= currentBatchTargetLimit && newOverallHasMoreState) {
            setIsScanBatchActive(false);
            setStatusMessage(`Batch complete (${fetchedItemsInCurrentBatchRef.current} items). ${globalMediaItems.length} total. Resume to load next batch.`);
        } else if (!newOverallHasMoreState) {
          setIsScanBatchActive(false);
          const finalStatus = globalMediaItems.length > 0
            ? `Global Drive scan complete. ${processedDialogsCountRef.current} dialogs processed. Found ${globalMediaItems.length} items.`
            : `Global Drive scan complete. ${processedDialogsCountRef.current} dialogs processed. No media items found.`;
          setStatusMessage(finalStatus);
        } else if (isScanBatchActive) { // Still active within the current batch or fetching more dialogs
            const activeDialogsInQueue = dialogsProcessQueueRef.current.filter(info => info.hasMoreMedia && !info.isFullyScanned).length;
            const totalDialogs = allDialogsCacheRef.current.length;
            const currentDialogName = dialogsProcessQueueRef.current[0]?.dialog.name || (hasMoreDialogsToFetch ? "next list of chats" : "remaining chats");
            setStatusMessage(`Scanning media in: ${currentDialogName}... (Dialogs Queued: ${activeDialogsInQueue}/${totalDialogs}, More Dialogs From Server: ${hasMoreDialogsToFetch})`);
        }

    } catch (e: any) {
        setStatusMessage(`An unexpected error occurred during scan: ${e.message}`);
        setIsScanBatchActive(false); // Stop scan on unhandled error
    } finally {
        setIsLoading(false);
    }
  }, [
      isLoading, isScanBatchActive, isConnectedInternal,
      fetchAndQueueDialogs, handleGlobalApiError,
      hasMoreDialogsToFetch, globalMediaItems.length, hasMore
  ]);

  useEffect(() => {
    if (isScanBatchActive && isConnectedInternal) {
      if (!isLoading) {
        processNextBatch(); // Initial call for the batch if not already loading
      }
      if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = setInterval(async () => {
        if (!isLoading) { // Subsequent calls for the batch if not loading
            await processNextBatch();
        }
      }, 1000);
    } else {
      if (scanIntervalRef.current) {
        clearInterval(scanIntervalRef.current);
        scanIntervalRef.current = null;
      }
    }
    return () => {
      if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
    };
  }, [isScanBatchActive, isConnectedInternal, processNextBatch, isLoading]);


  const fetchInitialGlobalMedia = useCallback(() => {
    if (!isConnectedInternal) {
      setStatusMessage("Not connected. Cannot start Global Drive scan.");
      scanActiveButWaitingForConnectionRef.current = true; // Flag that a scan was intended
      return;
    }
    setStatusMessage("Starting initial Global Drive scan...");
    resetManager(false); // Don't reset status message here, already set
    isInitialScanPhaseRef.current = true;
    fetchedItemsInCurrentBatchRef.current = 0;
    scanActiveButWaitingForConnectionRef.current = false;
    setIsScanBatchActive(true); // This will trigger the useEffect to call processNextBatch
  }, [isConnectedInternal, resetManager]);


  const loadMoreGlobalMedia = useCallback(() => {
    if (!isConnectedInternal) {
        toast({ title: "Not Connected", description: "Cannot load more, not connected to Telegram.", variant: "default" });
        scanActiveButWaitingForConnectionRef.current = true;
        return;
    }
    if (isLoading) {
      toast({ title: "Scan in Progress", description: "Global Drive is already loading.", variant: "default"});
      return;
    }
     if (isScanBatchActive) {
        toast({ title: "Scan Active", description: "Global Drive scan is already running.", variant: "default"});
        return;
    }

    if (hasMore) {
      setStatusMessage("Loading next batch of media...");
      isInitialScanPhaseRef.current = false; // Switch to incremental phase
      fetchedItemsInCurrentBatchRef.current = 0;
      scanActiveButWaitingForConnectionRef.current = false;
      setIsScanBatchActive(true); // This will trigger the useEffect
      toast({ title: "Loading More Media...", description: "Fetching the next batch of items."});
    } else {
      toast({ title: "All Loaded", description: "All accessible media has been loaded.", variant: "default"});
      const finalStatus = globalMediaItems.length > 0
            ? `Global Drive scan complete. ${processedDialogsCountRef.current} dialogs processed. Found ${globalMediaItems.length} items.`
            : `Global Drive scan complete. ${processedDialogsCountRef.current} dialogs processed. No media items found.`;
      setStatusMessage(finalStatus);
    }
  }, [isConnectedInternal, isLoading, isScanBatchActive, hasMore, toast, globalMediaItems.length]);

  return {
    globalMediaItems,
    isLoading,
    hasMore,
    statusMessage,
    fetchInitialGlobalMedia,
    loadMoreGlobalMedia,
    resetManager,
    setIsConnected, // Exposed for page.tsx to update this hook's internal connection state
    setGlobalMediaItemsDirectly: setGlobalMediaItems,
    isFullScanActive: isScanBatchActive,
  };
}

