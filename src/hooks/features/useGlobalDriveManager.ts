"use client";

import { useState, useCallback, useEffect, useRef } from 'react';
import type { CloudFile, CloudFolder, MediaHistoryResponse, InputPeer } from '@/types';
import * as telegramService from '@/services/telegramService';
import type { useToast } from "@/hooks/use-toast";

const GLOBAL_DRIVE_DIALOG_FETCH_LIMIT = 50;
const GLOBAL_DRIVE_MEDIA_PER_DIALOG_INITIAL_FETCH_LIMIT = 100; // For each dialog during any scan phase
const GLOBAL_DRIVE_MEDIA_PER_DIALOG_SUBSEQUENT_LIMIT = 50;  // For each dialog during any scan phase (if it had more)

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

  const [isScanBatchActive, setIsScanBatchActive] = useState(false); // True when any scan (initial or incremental) is actively fetching
  const isInitialScanPhaseRef = useRef(true); // Tracks if we are in the initial large batch phase
  const fetchedItemsInCurrentBatchRef = useRef(0); // Tracks items fetched for the current batch target

  const [isConnectedInternal, setIsConnectedInternal] = useState(initialIsConnected);
  const scanIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const processedDialogsCountRef = useRef(0);

  useEffect(() => {
    setIsConnectedInternal(initialIsConnected);
    if (!initialIsConnected && isScanBatchActive) {
      setIsScanBatchActive(false);
      if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
      setStatusMessage("Global Drive scan paused: Disconnected.");
      setIsLoading(false);
    }
  }, [initialIsConnected, isScanBatchActive]);


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
      return false;
    }
    if (!hasMoreDialogsToFetch) {
      if (allDialogsCacheRef.current.length > 0) {
        // Status will be updated by processNextBatch
      } else {
        setStatusMessage("No dialogs found to scan.");
      }
      return false;
    }

    const initialFetch = currentDialogsOffsetId === 0;
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
        // Status will be updated by processNextBatch
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
    if (!isScanBatchActive || !isConnectedInternal || isLoading) {
        return;
    }
    setIsLoading(true);

    try {
        const currentBatchTargetLimit = isInitialScanPhaseRef.current
            ? INITIAL_GLOBAL_SCAN_FETCH_TARGET
            : INCREMENTAL_GLOBAL_SCAN_FETCH_TARGET;

        if (fetchedItemsInCurrentBatchRef.current >= currentBatchTargetLimit && hasMore) {
            setIsScanBatchActive(false); // Pause after current batch target is met
            setStatusMessage(`Batch complete (${fetchedItemsInCurrentBatchRef.current} items). ${globalMediaItems.length} total. Click "Resume Scan" to load more.`);
            setIsLoading(false);
            return;
        }

        if (dialogsProcessQueueRef.current.length > 0) {
          const processInfo = dialogsProcessQueueRef.current.shift();
          if (processInfo && processInfo.dialog.inputPeer && processInfo.hasMoreMedia && (processInfo.attemptCount || 0) < MAX_DIALOG_PROCESS_ATTEMPTS) {
            const currentDialogName = processInfo.dialog.name;
            const dialogsInQueueCount = dialogsProcessQueueRef.current.length;
            const totalDialogsFetched = allDialogsCacheRef.current.length;
            setStatusMessage(`Scanning media in: ${currentDialogName}... (Dialogs Scanned: ${processedDialogsCountRef.current}/${totalDialogsFetched}, Batch: ${fetchedItemsInCurrentBatchRef.current}/${currentBatchTargetLimit})`);

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
                  fetchedItemsInCurrentBatchRef.current += newUniqueFiles.length;
                  return [...prevItems, ...newUniqueFiles].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
                });
              }

              processInfo.mediaOffsetId = mediaResponse.nextOffsetId || 0;
              processInfo.hasMoreMedia = mediaResponse.hasMore;

              if (mediaResponse.hasMore) {
                processInfo.attemptCount = 0; // Reset attempts on successful fetch with more media
                dialogsProcessQueueRef.current.push(processInfo); // Re-queue if this dialog still has more media
              } else {
                processInfo.isFullyScanned = true;
                processedDialogsCountRef.current += 1;
              }
            } catch (error: any) {
              handleGlobalApiError(error, `Error Fetching Media for ${processInfo.dialog.name}`, `Skipping ${processInfo.dialog.name} after error: ${error.message}`);
              processInfo.hasMoreMedia = false; // Stop processing this dialog
              processInfo.isFullyScanned = true;
              processInfo.attemptCount = (processInfo.attemptCount || 0) + 1;
              if (processInfo.attemptCount < MAX_DIALOG_PROCESS_ATTEMPTS && !String(error.message).includes('AUTH_RESTART')) {
                 dialogsProcessQueueRef.current.unshift(processInfo); // Re-queue for retry if not max attempts and not auth error
              } else {
                processedDialogsCountRef.current += 1; // Count as processed if max attempts or auth error
              }
            }
          } else if (processInfo && processInfo.attemptCount && processInfo.attemptCount >= MAX_DIALOG_PROCESS_ATTEMPTS) {
            processInfo.isFullyScanned = true; // Max attempts reached
            processedDialogsCountRef.current += 1;
          } else if (processInfo && !processInfo.hasMoreMedia && !processInfo.isFullyScanned) {
            processInfo.isFullyScanned = true; // No more media, mark as scanned
            processedDialogsCountRef.current += 1;
          }
        }

        if (dialogsProcessQueueRef.current.length === 0 && hasMoreDialogsToFetch) {
          await fetchAndQueueDialogs();
        }

        const overallMoreDialogsToFetch = hasMoreDialogsToFetch;
        const overallMoreMediaInQueue = dialogsProcessQueueRef.current.some(info => info.hasMoreMedia && !info.isFullyScanned);
        const overallMoreToFetch = overallMoreDialogsToFetch || overallMoreMediaInQueue;
        setHasMore(overallMoreToFetch);

        if (fetchedItemsInCurrentBatchRef.current >= currentBatchTargetLimit && overallMoreToFetch) {
            setIsScanBatchActive(false); // Pause after current batch target is met
            setStatusMessage(`Batch complete (${fetchedItemsInCurrentBatchRef.current} items). ${globalMediaItems.length} total. Click "Resume Scan" to load more.`);
        } else if (!overallMoreToFetch) {
          setIsScanBatchActive(false);
          const finalStatus = globalMediaItems.length > 0
            ? `Global Drive scan complete. ${processedDialogsCountRef.current} dialogs processed. Found ${globalMediaItems.length} items.`
            : `Global Drive scan complete. ${processedDialogsCountRef.current} dialogs processed. No media items found.`;
          setStatusMessage(finalStatus);
        } else if (isScanBatchActive) { // Still active within the current batch
            const activeDialogsInQueue = dialogsProcessQueueRef.current.filter(info => info.hasMoreMedia && !info.isFullyScanned).length;
            const currentDialogName = dialogsProcessQueueRef.current[0]?.dialog.name || "next available";
            setStatusMessage(`Scanning media in: ${currentDialogName}... (Dialogs Scanned: ${processedDialogsCountRef.current}/${allDialogsCacheRef.current.length}, Batch: ${fetchedItemsInCurrentBatchRef.current}/${currentBatchTargetLimit})`);
        }
    } catch (e: any) {
        setStatusMessage(`An unexpected error occurred during scan: ${e.message}`);
        setIsScanBatchActive(false);
    } finally {
        setIsLoading(false);
    }
  }, [
      isScanBatchActive, isLoading, isConnectedInternal,
      fetchAndQueueDialogs, handleGlobalApiError,
      hasMoreDialogsToFetch, globalMediaItems.length, hasMore
  ]);

  useEffect(() => {
    if (isScanBatchActive && isConnectedInternal) {
      if (!isLoading) { // Initial call for the batch
        processNextBatch();
      }
      if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = setInterval(async () => {
        if (!isLoading) { // Subsequent calls for the batch
            await processNextBatch();
        }
      }, 1000); // Interval to process queue or fetch more dialogs
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
      setStatusMessage("Cannot start Global Drive scan: Not connected.");
      return;
    }
    setStatusMessage("Starting initial Global Drive scan...");
    resetManager(false);
    isInitialScanPhaseRef.current = true;
    fetchedItemsInCurrentBatchRef.current = 0;
    setIsScanBatchActive(true);
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
    if (isScanBatchActive) { // If a batch is already active (e.g., interval running)
        toast({ title: "Scan Active", description: "Global Drive scan is already running.", variant: "default"});
        return;
    }

    if (hasMore) {
      setStatusMessage("Loading next batch of media...");
      isInitialScanPhaseRef.current = false; // Switch to incremental phase
      fetchedItemsInCurrentBatchRef.current = 0; // Reset for the new incremental batch
      setIsScanBatchActive(true);
      toast({ title: "Loading More Media...", description: "Fetching the next batch of items."});
    } else {
      toast({ title: "All Loaded", description: "All accessible media has been loaded.", variant: "default"});
      setStatusMessage(`Global Drive scan complete. ${processedDialogsCountRef.current} dialogs processed. Found ${globalMediaItems.length} items.`);
    }
  }, [isConnectedInternal, isLoading, isScanBatchActive, hasMore, toast, globalMediaItems.length]);

  return {
    globalMediaItems,
    isLoading,
    hasMore, // Overall "hasMore"
    statusMessage,
    fetchInitialGlobalMedia,
    loadMoreGlobalMedia,
    resetManager,
    setIsConnected, // Propagated from page.tsx
    setGlobalMediaItemsDirectly: setGlobalMediaItems, // For direct manipulation if needed (e.g., VFS)
    isFullScanActive: isScanBatchActive, // Renamed prop for clarity in MainContentView
  };
}
