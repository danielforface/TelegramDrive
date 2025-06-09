
"use client";

import { useState, useCallback, useEffect, useRef } from 'react';
import type { CloudFile, CloudFolder, MediaHistoryResponse, InputPeer } from '@/types';
import * as telegramService from '@/services/telegramService';
import type { useToast } from "@/hooks/use-toast";

const GLOBAL_DRIVE_DIALOG_FETCH_LIMIT = 50; // How many dialogs to fetch per server request
const GLOBAL_DRIVE_MEDIA_PER_DIALOG_INITIAL_FETCH_LIMIT = 100; // Media items per dialog for its first scan
const GLOBAL_DRIVE_MEDIA_PER_DIALOG_SUBSEQUENT_LIMIT = 50;   // Media items per dialog for subsequent scans

const INITIAL_GLOBAL_SCAN_FETCH_TARGET = 1000; // Target for the first automatic scan phase
const INCREMENTAL_GLOBAL_SCAN_FETCH_TARGET = 200; // Target for subsequent manual "Load More" phases

interface UseGlobalDriveManagerProps {
  toast: ReturnType<typeof useToast>['toast'];
  handleGlobalApiError: (error: any, title: string, defaultMessage: string, doPageReset?: boolean) => void;
  isConnected: boolean; // This is the 'initialIsConnected' prop from page.tsx
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
  isConnected: initialIsConnected, // Renamed prop for clarity within the hook
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


  useEffect(() => {
    setIsConnectedInternal(initialIsConnected);
    if (!initialIsConnected) {
      if (isScanBatchActive) {
        setIsScanBatchActive(false); // Stop scan if disconnected
        if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
        setStatusMessage("Global Drive scan paused: Disconnected.");
        setIsLoading(false);
      } else if (globalMediaItems.length === 0 && !isLoading) {
         setStatusMessage("Global Drive: Disconnected. Connect and open to scan.");
      }
    }
  }, [initialIsConnected, isScanBatchActive, globalMediaItems.length, isLoading]); // Added isLoading here


  const setIsConnected = useCallback((connected: boolean) => {
    setIsConnectedInternal(connected);
  }, [setIsConnectedInternal]);


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
    setIsLoading(false); // Ensure isLoading is reset
    if (resetStatusMsg) {
      setStatusMessage("Global Drive: Idle. Open to start scanning.");
    }
  }, []);

  const fetchAndQueueDialogs = useCallback(async () => {
    if (!isConnectedInternal) { // Check internal state first
      setStatusMessage("Cannot fetch dialogs: Disconnected.");
      return false;
    }
    if (!hasMoreDialogsToFetch) {
      setStatusMessage(`All ${allDialogsCacheRef.current.length} dialogs previously fetched. Processing media...`);
      return false;
    }

    const initialFetch = currentDialogsOffsetId === 0 && allDialogsCacheRef.current.length === 0;
    setStatusMessage(initialFetch
      ? `Fetching initial dialog list for Global Drive... (Found ${allDialogsCacheRef.current.length})`
      : `Fetching more dialogs... (Found ${allDialogsCacheRef.current.length} so far, More dialog pages from server: ${hasMoreDialogsToFetch})`);

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
        setStatusMessage(`All ${allDialogsCacheRef.current.length} dialogs fetched from server. Total in queue: ${dialogsProcessQueueRef.current.length}. Processing media...`);
      } else {
        setStatusMessage(`Fetched ${allDialogsCacheRef.current.length} dialogs. ${dialogsProcessQueueRef.current.length} in queue. More dialog pages from server: ${response.hasMore}`);
      }
      return newDialogsFromServer.length > 0 || newQueueItems.length > 0;
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
      }

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
            } else if (!allDialogsCacheRef.current.find(d => d.id === processInfo.dialog.id)?.isFullyScannedForGlobalDrive) {
                processedDialogsCountRef.current += 1;
                const dialogInCache = allDialogsCacheRef.current.find(d => d.id === processInfo.dialog.id);
                if (dialogInCache) (dialogInCache as any).isFullyScannedForGlobalDrive = true;
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
      const overallMoreToFetch = hasMoreDialogsToFetch || anyDialogInQueueHasMoreMedia;
      setHasMore(overallMoreToFetch);

      if (fetchedItemsInCurrentBatchRef.current >= currentBatchTargetLimit) {
        if (overallMoreToFetch) {
          setIsScanBatchActive(false);
          setStatusMessage(`Batch complete (${fetchedItemsInCurrentBatchRef.current} items). ${globalMediaItems.length} total. Resume to load next batch.`);
        } else {
          setIsScanBatchActive(false);
          const finalStatus = globalMediaItems.length > 0
            ? `Global Drive scan complete. ${processedDialogsCountRef.current} dialogs processed. Found ${globalMediaItems.length} items.`
            : `Global Drive scan complete. ${processedDialogsCountRef.current} dialogs processed. No media items found.`;
          setStatusMessage(finalStatus);
        }
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
    isLoading, isScanBatchActive, isConnectedInternal,
    fetchAndQueueDialogs, handleGlobalApiError,
    globalMediaItems.length, hasMore, hasMoreDialogsToFetch,
  ]);

  useEffect(() => {
    if (isScanBatchActive && isConnectedInternal) {
      if (!isLoading) {
        processNextBatch(); // Call immediately if not already loading
      }
      if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = setInterval(async () => {
        if (!isLoading) { // Prevent re-entrancy
            await processNextBatch();
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
  }, [isScanBatchActive, isConnectedInternal, processNextBatch, isLoading]);


  const fetchInitialGlobalMedia = useCallback(() => {
    // Immediately sync internal connection state with prop
    if (initialIsConnected && !isConnectedInternal) {
      setIsConnectedInternal(true);
    }

    if (!initialIsConnected && !isConnectedInternal) { // Check after attempting sync
      setStatusMessage("Not connected. Cannot start Global Drive scan.");
      return;
    }
    setStatusMessage("Starting initial Global Drive scan...");
    resetManager(false);
    isInitialScanPhaseRef.current = true;
    fetchedItemsInCurrentBatchRef.current = 0;
    setIsScanBatchActive(true);
    // The useEffect watching isScanBatchActive will trigger processNextBatch
  }, [initialIsConnected, isConnectedInternal, resetManager]);


  const loadMoreGlobalMedia = useCallback(() => {
    // Immediately sync internal connection state with prop
    if (initialIsConnected && !isConnectedInternal) {
      setIsConnectedInternal(true);
    }
    // Use a short timeout to allow state to propagate if needed,
    // though direct check should be primary
    setTimeout(() => {
        if (!isConnectedInternal && !initialIsConnected) {
            toast({ title: "Not Connected", description: "Cannot load more, not connected to Telegram.", variant: "default" });
            return;
        }
        if (isLoading || isScanBatchActive) {
          toast({ title: "Scan Active", description: "Global Drive scan is already running or loading.", variant: "default"});
          return;
        }

        if (hasMore) {
          setStatusMessage("Resuming Global Drive scan for next batch...");
          isInitialScanPhaseRef.current = false;
          fetchedItemsInCurrentBatchRef.current = 0;

          if (dialogsProcessQueueRef.current.length === 0 && !hasMoreDialogsToFetch && allDialogsCacheRef.current.length > 0) {
            toast({ title: "Deep Resume", description: "Re-checking all known chats for more media." });
            dialogsProcessQueueRef.current = allDialogsCacheRef.current.map(dialog => ({
              dialog, mediaOffsetId: 0, hasMoreMedia: true, isFullyScanned: false, attemptCount: 0,
            }));
            setHasMore(true); // Ensure hasMore is true if we are forcing a re-check
          } else if (dialogsProcessQueueRef.current.length === 0 && allDialogsCacheRef.current.length === 0 && !hasMoreDialogsToFetch) {
            toast({ title: "No Chats Found", description: "No chats available to scan for media.", variant: "default" });
            setHasMore(false);
            setIsScanBatchActive(false);
            setStatusMessage("Global Drive: No chats found to scan.");
            return;
          }
          setIsScanBatchActive(true);
        } else {
          toast({ title: "All Loaded", description: "All accessible media has been loaded.", variant: "default"});
          const finalStatus = globalMediaItems.length > 0
                ? `Global Drive scan complete. ${processedDialogsCountRef.current} dialogs processed. Found ${globalMediaItems.length} items.`
                : `Global Drive scan complete. ${processedDialogsCountRef.current} dialogs processed. No media items found.`;
          setStatusMessage(finalStatus);
        }
    }, 50); // 50ms delay, adjust if needed

  }, [initialIsConnected, isConnectedInternal, isLoading, isScanBatchActive, hasMore, toast, hasMoreDialogsToFetch, globalMediaItems.length]);

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

