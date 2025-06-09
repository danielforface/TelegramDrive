
"use client";

import { useState, useCallback, useEffect, useRef } from 'react';
import type { CloudFile, CloudFolder, MediaHistoryResponse, InputPeer } from '@/types';
import * as telegramService from '@/services/telegramService';
import type { useToast } from "@/hooks/use-toast";

const GLOBAL_DRIVE_DIALOG_FETCH_LIMIT = 50;
const GLOBAL_DRIVE_MEDIA_PER_DIALOG_INITIAL_FETCH_LIMIT = 100;
const GLOBAL_DRIVE_MEDIA_PER_DIALOG_SUBSEQUENT_LIMIT = 50;

// Scan Phase Targets
const INITIAL_GLOBAL_SCAN_FETCH_TARGET = 1000; // Target for the first automatic scan phase
const INCREMENTAL_GLOBAL_SCAN_FETCH_TARGET = 200; // Target for subsequent manual "Load More" phases

interface UseGlobalDriveManagerProps {
  toast: ReturnType<typeof useToast>['toast'];
  handleGlobalApiError: (error: any, title: string, defaultMessage: string, doPageReset?: boolean) => void;
  isConnected: boolean;
}

interface DialogProcessInfo {
  dialog: CloudFolder;
  mediaOffsetId: number;
  hasMoreMedia: boolean;
  isFullyScanned?: boolean; // True if this specific dialog has no more media according to API
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
  const [isScanBatchActive, setIsScanBatchActive] = useState(false); // True if a scan (initial or incremental) is currently running

  const allDialogsCacheRef = useRef<CloudFolder[]>([]); // Stores all dialogs ever fetched from server
  const dialogsProcessQueueRef = useRef<DialogProcessInfo[]>([]); // Dialogs currently queued for media fetching

  const [currentDialogsOffsetDate, setCurrentDialogsOffsetDate] = useState(0);
  const [currentDialogsOffsetId, setCurrentDialogsOffsetId] = useState(0);
  const [currentDialogsOffsetPeer, setCurrentDialogsOffsetPeer] = useState<any>({ _: 'inputPeerEmpty' });
  const [hasMoreDialogsToFetch, setHasMoreDialogsToFetch] = useState(true); // If server has more *pages* of dialogs

  const isInitialScanPhaseRef = useRef(true); // True for the first large batch, false for subsequent incremental ones
  const fetchedItemsInCurrentBatchRef = useRef(0); // Items fetched in the current active batch

  const [isConnectedInternal, setIsConnectedInternal] = useState(initialIsConnected);
  const scanIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const processedDialogsCountRef = useRef(0); // Total unique dialogs fully processed for media

  const stableSetIsConnectedInternal = useRef(setIsConnectedInternal);
  useEffect(() => {
    stableSetIsConnectedInternal.current = setIsConnectedInternal;
  }, []);

  const setIsConnected = useCallback((connected: boolean) => {
    stableSetIsConnectedInternal.current(connected);
  }, []);


  useEffect(() => {
    setIsConnectedInternal(initialIsConnected);
    if (!initialIsConnected) {
      if (isScanBatchActive) {
        setIsScanBatchActive(false);
        if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
        setStatusMessage("Global Drive scan paused: Disconnected.");
        setIsLoading(false);
      } else if (globalMediaItems.length === 0 && !isLoading) {
        setStatusMessage("Global Drive: Disconnected. Connect and open to scan.");
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
    isInitialScanPhaseRef.current = true; // Reset to initial phase on full reset
    setIsLoading(false);
    if (resetStatusMsg) {
      setStatusMessage("Global Drive: Idle. Open to start scanning.");
    }
  }, []);

  const fetchAndQueueDialogs = useCallback(async () => {
    if (!isConnectedInternal) {
      setStatusMessage("Cannot fetch dialogs: Disconnected.");
      return false; // Indicate no new dialogs were added or state didn't allow fetching
    }
    if (!hasMoreDialogsToFetch) {
      setStatusMessage(`All ${allDialogsCacheRef.current.length} dialogs previously fetched. Processing media...`);
      return false; // No new dialogs to fetch from server
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

      const newDialogsFromServer = response.folders.filter(d => d.inputPeer); // Ensure dialog has inputPeer
      // Add to allDialogsCacheRef only if not already present by ID
      newDialogsFromServer.forEach(nd => {
        if (!allDialogsCacheRef.current.some(existing => existing.id === nd.id)) {
          allDialogsCacheRef.current.push(nd);
        }
      });
      
      // Add to processing queue only if not already there and not marked fully scanned from a *prior complete run*
      const newQueueItems: DialogProcessInfo[] = newDialogsFromServer
        .filter(dialog => !dialogsProcessQueueRef.current.some(qi => qi.dialog.id === dialog.id))
        .map(dialog => ({
          dialog,
          mediaOffsetId: 0,
          hasMoreMedia: true,
          attemptCount: 0,
          isFullyScanned: false,
      }));
      dialogsProcessQueueRef.current.push(...newQueueItems);

      setHasMoreDialogsToFetch(response.hasMore);
      setCurrentDialogsOffsetDate(response.nextOffsetDate);
      setCurrentDialogsOffsetId(response.nextOffsetId);
      setCurrentDialogsOffsetPeer(response.nextOffsetPeer);

      if (!response.hasMore) {
         setStatusMessage(`All ${allDialogsCacheRef.current.length} dialogs fetched from server. Total in queue: ${dialogsProcessQueueRef.current.length}. Processing media...`);
      } else {
         setStatusMessage(`Fetched ${allDialogsCacheRef.current.length} dialogs. ${dialogsProcessQueueRef.current.length} in queue. More dialogs available from server...`);
      }
      return newDialogsFromServer.length > 0 || newQueueItems.length > 0; // Indicate if new dialogs were processed or queue was affected
    } catch (error) {
      handleGlobalApiError(error, "Error Fetching Dialogs for Global Drive", "Could not load dialog list.");
      setHasMoreDialogsToFetch(false); // Stop trying to fetch more dialogs on error
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

        // If current batch target is met, pause, but only if there's potentially more overall.
        // The overall 'hasMore' will be re-evaluated at the end of this function.
        if (fetchedItemsInCurrentBatchRef.current >= currentBatchTargetLimit && hasMore) {
            setIsScanBatchActive(false);
            setStatusMessage(`Batch complete (${fetchedItemsInCurrentBatchRef.current} items). ${globalMediaItems.length} total. Resume to load next batch.`);
            setIsLoading(false);
            return;
        }

        // Try to ensure queue has items if dialogs can still be fetched
        if (dialogsProcessQueueRef.current.length === 0 && hasMoreDialogsToFetch) {
            await fetchAndQueueDialogs();
        }

        let itemsProcessedInThisCycle = 0;

        // Process one dialog from the queue
        if (dialogsProcessQueueRef.current.length > 0) {
            const processInfo = dialogsProcessQueueRef.current.shift(); // Take one dialog
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
                        processInfo.dialog.inputPeer,
                        mediaLimitForThisDialog,
                        processInfo.mediaOffsetId,
                        false // Global drive fetches all, not just VFS structure
                    );

                    itemsProcessedInThisCycle = mediaResponse.files.length; // How many items this specific API call returned

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
                        processInfo.attemptCount = 0; // Reset attempts on success
                        dialogsProcessQueueRef.current.push(processInfo); // Re-queue if this dialog still has more media
                    } else {
                        processInfo.isFullyScanned = true; // Mark this dialog as fully scanned for media
                        // Only increment processedDialogsCountRef if it's the first time this dialog is marked fullyScanned
                        // This needs a better way to track "truly unique dialogs fully processed"
                        // For now, this is a simplification.
                        if (!allDialogsCacheRef.current.find(d => d.id === processInfo.dialog.id)?.isFullyScannedForGlobalDrive) {
                           processedDialogsCountRef.current += 1;
                           const dialogInCache = allDialogsCacheRef.current.find(d => d.id === processInfo.dialog.id);
                           if(dialogInCache) (dialogInCache as any).isFullyScannedForGlobalDrive = true;
                        }
                    }
                } catch (error: any) {
                    handleGlobalApiError(error, `Error Fetching Media for ${processInfo.dialog.name}`, `Skipping ${processInfo.dialog.name} after error: ${error.message}`);
                    processInfo.hasMoreMedia = false;
                    processInfo.isFullyScanned = true;
                    processInfo.attemptCount = (processInfo.attemptCount || 0) + 1;
                    if (processInfo.attemptCount < MAX_DIALOG_PROCESS_ATTEMPTS && !String(error.message).includes('AUTH_RESTART')) {
                        dialogsProcessQueueRef.current.unshift(processInfo); // Re-queue at front for retry
                    } else {
                        if (!allDialogsCacheRef.current.find(d => d.id === processInfo.dialog.id)?.isFullyScannedForGlobalDrive) {
                           processedDialogsCountRef.current += 1;
                           const dialogInCache = allDialogsCacheRef.current.find(d => d.id === processInfo.dialog.id);
                           if(dialogInCache) (dialogInCache as any).isFullyScannedForGlobalDrive = true;
                        }
                    }
                }
            } else if (processInfo && !processInfo.hasMoreMedia && !processInfo.isFullyScanned) {
                processInfo.isFullyScanned = true;
                 if (!allDialogsCacheRef.current.find(d => d.id === processInfo.dialog.id)?.isFullyScannedForGlobalDrive) {
                   processedDialogsCountRef.current += 1;
                   const dialogInCache = allDialogsCacheRef.current.find(d => d.id === processInfo.dialog.id);
                   if(dialogInCache) (dialogInCache as any).isFullyScannedForGlobalDrive = true;
                }
            }
        }

        // Determine if there's potentially more data overall
        const anyDialogInQueueHasMoreMedia = dialogsProcessQueueRef.current.some(info => info.hasMoreMedia && !info.isFullyScanned);
        const overallMoreToFetch = hasMoreDialogsToFetch || anyDialogInQueueHasMoreMedia;
        setHasMore(overallMoreToFetch);

        // Check for current batch completion or full scan completion
        if (fetchedItemsInCurrentBatchRef.current >= currentBatchTargetLimit) {
            if (overallMoreToFetch) { // If there's still more overall, just pause this batch
                setIsScanBatchActive(false);
                setStatusMessage(`Batch complete (${fetchedItemsInCurrentBatchRef.current} items). ${globalMediaItems.length} total. Resume to load next batch.`);
            } else { // No more overall, so the entire scan is complete
                setIsScanBatchActive(false);
                const finalStatus = globalMediaItems.length > 0
                    ? `Global Drive scan complete. ${processedDialogsCountRef.current} dialogs processed. Found ${globalMediaItems.length} items.`
                    : `Global Drive scan complete. ${processedDialogsCountRef.current} dialogs processed. No media items found.`;
                setStatusMessage(finalStatus);
            }
        } else if (!overallMoreToFetch) { // Current batch target not met, but no more data anywhere
            setIsScanBatchActive(false);
            const finalStatus = globalMediaItems.length > 0
                ? `Global Drive scan complete. ${processedDialogsCountRef.current} dialogs processed. Found ${globalMediaItems.length} items.`
                : `Global Drive scan complete. ${processedDialogsCountRef.current} dialogs processed. No media items found.`;
            setStatusMessage(finalStatus);
        } else if (isScanBatchActive) { // Still active within current batch and more to fetch overall
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
      isLoading, isScanBatchActive, isConnectedInternal,
      fetchAndQueueDialogs, handleGlobalApiError,
      globalMediaItems.length, hasMore, hasMoreDialogsToFetch, // Added hasMore and hasMoreDialogsToFetch
      isInitialScanPhaseRef, // Added isInitialScanPhaseRef (ref.current usage is fine)
      // fetchedItemsInCurrentBatchRef - ref, no need
  ]);

  useEffect(() => {
    if (isScanBatchActive && isConnectedInternal) {
      if (!isLoading) {
        processNextBatch();
      }
      if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = setInterval(async () => {
        if (!isLoading) {
            await processNextBatch();
        }
      }, 750); // Slightly reduced interval for potentially faster batch item processing
    } else {
      if (scanIntervalRef.current) {
        clearInterval(scanIntervalRef.current);
        scanIntervalRef.current = null;
      }
      if (isLoading) { // If scan stopped but was loading, ensure isLoading is false
          setIsLoading(false);
      }
    }
    return () => {
      if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
    };
  }, [isScanBatchActive, isConnectedInternal, processNextBatch, isLoading]);


  const fetchInitialGlobalMedia = useCallback(() => {
    if (!isConnectedInternal) {
      setStatusMessage("Not connected. Cannot start Global Drive scan.");
      return;
    }
    setStatusMessage("Starting initial Global Drive scan...");
    resetManager(false); // Reset manager but keep the "Starting..." message
    isInitialScanPhaseRef.current = true;
    fetchedItemsInCurrentBatchRef.current = 0;
    setIsScanBatchActive(true);
  }, [isConnectedInternal, resetManager]);


  const loadMoreGlobalMedia = useCallback(() => {
    if (!isConnectedInternal) {
        toast({ title: "Not Connected", description: "Cannot load more, not connected to Telegram.", variant: "default" });
        return;
    }
    if (isLoading || isScanBatchActive) {
      toast({ title: "Scan Active", description: "Global Drive scan is already running or loading.", variant: "default"});
      return;
    }

    if (hasMore) {
      setStatusMessage("Resuming Global Drive scan for next batch...");
      isInitialScanPhaseRef.current = false; // Switch to incremental batches
      fetchedItemsInCurrentBatchRef.current = 0; // Reset for the new batch

      // Critical: If the queue is empty AND we thought there were no more dialog *pages* to fetch,
      // "Resuming" must re-evaluate all known dialogs from the start of their media.
      if (dialogsProcessQueueRef.current.length === 0 && !hasMoreDialogsToFetch && allDialogsCacheRef.current.length > 0) {
          toast({ title: "Deep Resume", description: "Re-checking all known chats for more media." });
          dialogsProcessQueueRef.current = allDialogsCacheRef.current.map(dialog => ({
              dialog,
              mediaOffsetId: 0, // Start from the beginning of media
              hasMoreMedia: true, // Assume it might have more
              isFullyScanned: false,
              attemptCount: 0,
          }));
          // Ensure 'hasMore' is true if we're forcing a re-check
          setHasMore(true);
      } else if (dialogsProcessQueueRef.current.length === 0 && allDialogsCacheRef.current.length === 0 && !hasMoreDialogsToFetch) {
          // No dialogs ever found and no more pages to fetch from server.
          toast({ title: "No Chats Found", description: "No chats available to scan for media.", variant: "default" });
          setHasMore(false);
          setIsScanBatchActive(false);
          setStatusMessage("Global Drive: No chats found to scan.");
          return;
      }
      // Otherwise, the existing queue or the ability to fetch more dialog pages will be handled by processNextBatch.

      setIsScanBatchActive(true); // This will trigger the useEffect to call processNextBatch
    } else {
      toast({ title: "All Loaded", description: "All accessible media has been loaded.", variant: "default"});
      const finalStatus = globalMediaItems.length > 0
            ? `Global Drive scan complete. ${processedDialogsCountRef.current} dialogs processed. Found ${globalMediaItems.length} items.`
            : `Global Drive scan complete. ${processedDialogsCountRef.current} dialogs processed. No media items found.`;
      setStatusMessage(finalStatus);
    }
  }, [isConnectedInternal, isLoading, isScanBatchActive, hasMore, toast, hasMoreDialogsToFetch, globalMediaItems.length]); // Added hasMoreDialogsToFetch

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
    isScanBatchActive, // Use this consistent name
  };
}

