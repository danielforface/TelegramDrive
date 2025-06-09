
"use client";

import { useState, useCallback, useEffect, useRef } from 'react';
import type { CloudFile, CloudFolder, MediaHistoryResponse, InputPeer } from '@/types';
import * as telegramService from '@/services/telegramService';
import type { useToast } from "@/hooks/use-toast";

const GLOBAL_DRIVE_DIALOG_FETCH_LIMIT = 50; 
const GLOBAL_DRIVE_MEDIA_PER_DIALOG_INITIAL_LIMIT = 10; 
const GLOBAL_DRIVE_MEDIA_PER_DIALOG_SUBSEQUENT_LIMIT = 10; // Increased for more autonomous loading

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
  attemptCount?: number; // To prevent infinite loops on problematic dialogs
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
  const [statusMessage, setStatusMessage] = useState<string | null>("Initializing Global Drive...");

  const allDialogsCacheRef = useRef<CloudFolder[]>([]);
  const dialogsProcessQueueRef = useRef<DialogProcessInfo[]>([]);
  
  const [currentDialogsOffsetDate, setCurrentDialogsOffsetDate] = useState(0);
  const [currentDialogsOffsetId, setCurrentDialogsOffsetId] = useState(0);
  const [currentDialogsOffsetPeer, setCurrentDialogsOffsetPeer] = useState<any>({ _: 'inputPeerEmpty' });
  const [hasMoreDialogsToFetch, setHasMoreDialogsToFetch] = useState(true);
  const [isFullScanActive, setIsFullScanActive] = useState(false); // Controls the autonomous loop

  const [isConnectedInternal, setIsConnectedInternal] = useState(initialIsConnected);
  const scanIntervalRef = useRef<NodeJS.Timeout | null>(null);


  useEffect(() => {
    setIsConnectedInternal(initialIsConnected);
    if (!initialIsConnected && isFullScanActive) {
      setIsFullScanActive(false); // Stop scan if disconnected
      if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
      setStatusMessage("Global Drive scan paused: Disconnected.");
    }
  }, [initialIsConnected, isFullScanActive]);

  const setIsConnected = useCallback((connected: boolean) => {
    setIsConnectedInternal(connected);
    if (!connected && isFullScanActive) {
      setIsFullScanActive(false);
      if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
      setStatusMessage("Global Drive scan paused: Disconnected.");
    }
  }, [isFullScanActive]);


  const resetManager = useCallback(() => {
    setGlobalMediaItems([]);
    setIsLoading(false); // Should be false after reset
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
        setStatusMessage(allDialogsCacheRef.current.length > 0 ? `All ${allDialogsCacheRef.current.length} dialogs fetched. Continuing media scan...` : "No dialogs found.");
      }
      return false; // No more dialogs to fetch or not connected
    }
    
    setStatusMessage(currentDialogsOffsetId === 0 
      ? "Fetching initial dialog list for Global Drive..." 
      : `Fetching more dialogs... (${allDialogsCacheRef.current.length} dialogs found so far)`);
    
    // No need to set isLoading here if the main loop controls it or if this is called from within the loop
    
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
        setStatusMessage(allDialogsCacheRef.current.length > 0 ? `All ${allDialogsCacheRef.current.length} dialogs fetched. Processing media...` : "No dialogs found.");
      } else {
         setStatusMessage(`Fetched ${allDialogsCacheRef.current.length} dialogs. ${dialogsProcessQueueRef.current.length} in queue. More available...`);
      }
      return true; // Dialogs were fetched or attempted
    } catch (error) {
      handleGlobalApiError(error, "Error Fetching Dialogs for Global Drive", "Could not load dialog list.");
      setHasMoreDialogsToFetch(false); // Stop trying to fetch more dialogs on error
      setStatusMessage("Error fetching dialogs. Scan may be incomplete.");
      return false;
    }
  }, [isConnectedInternal, handleGlobalApiError, currentDialogsOffsetDate, currentDialogsOffsetId, currentDialogsOffsetPeer, hasMoreDialogsToFetch]);


  const processNextBatch = useCallback(async () => {
    if (!isFullScanActive || isLoading || !isConnectedInternal) return; // Only run if scan is active and not already loading

    setIsLoading(true);
    let mediaFetchedThisCycle = false;

    // Prioritize processing existing dialog queue for media
    if (dialogsProcessQueueRef.current.length > 0) {
      const processInfo = dialogsProcessQueueRef.current.shift(); // Take one dialog to process
      if (processInfo && processInfo.dialog.inputPeer && processInfo.hasMoreMedia && (processInfo.attemptCount || 0) < MAX_DIALOG_PROCESS_ATTEMPTS) {
        setStatusMessage(`Scanning media in: ${processInfo.dialog.name}... (${dialogsProcessQueueRef.current.length} dialogs remaining in queue)`);
        try {
          const mediaResponse = await telegramService.getChatMediaHistory(
            processInfo.dialog.inputPeer,
            GLOBAL_DRIVE_MEDIA_PER_DIALOG_SUBSEQUENT_LIMIT,
            processInfo.mediaOffsetId
          );

          if (mediaResponse.files.length > 0) {
            setGlobalMediaItems(prevItems => {
              const existingIds = new Set(prevItems.map(item => item.id));
              const newUniqueFiles = mediaResponse.files.filter(file => !existingIds.has(file.id));
              return [...prevItems, ...newUniqueFiles].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
            });
            mediaFetchedThisCycle = true;
          }
          
          processInfo.mediaOffsetId = mediaResponse.nextOffsetId || 0;
          processInfo.hasMoreMedia = mediaResponse.hasMore;

          if (mediaResponse.hasMore) {
            processInfo.attemptCount = 0; // Reset attempt count on success
            dialogsProcessQueueRef.current.push(processInfo); // Re-queue if more media
          } else {
            processInfo.isFullyScanned = true;
          }
        } catch (error) {
          handleGlobalApiError(error, `Error Fetching Media for ${processInfo.dialog.name}`, `Skipping ${processInfo.dialog.name} after error.`);
          processInfo.hasMoreMedia = false;
          processInfo.isFullyScanned = true; // Mark as scanned even on error to avoid retrying indefinitely
          processInfo.attemptCount = (processInfo.attemptCount || 0) + 1;
          if (processInfo.attemptCount < MAX_DIALOG_PROCESS_ATTEMPTS) {
             dialogsProcessQueueRef.current.unshift(processInfo); // Put back at front to retry if attempts left
          }
        }
      } else if (processInfo && processInfo.attemptCount && processInfo.attemptCount >= MAX_DIALOG_PROCESS_ATTEMPTS) {
        // console.warn(`Max attempts reached for dialog ${processInfo.dialog.name}. Skipping.`);
        processInfo.isFullyScanned = true;
      }
    }

    // If dialog queue is empty, try fetching more dialogs
    if (dialogsProcessQueueRef.current.length === 0 && hasMoreDialogsToFetch) {
      await fetchAndQueueDialogs(); // This will update hasMoreDialogsToFetch and queue
      mediaFetchedThisCycle = true; // Indicate activity
    }
    
    // Determine overall 'hasMore' status
    const stillMoreDialogsToFetch = hasMoreDialogsToFetch;
    const stillDialogsWithMediaToScan = dialogsProcessQueueRef.current.some(info => info.hasMoreMedia && !info.isFullyScanned);
    const newHasMoreState = stillMoreDialogsToFetch || stillDialogsWithMediaToScan;
    setHasMore(newHasMoreState);

    if (!newHasMoreState) {
      setIsFullScanActive(false); // Stop autonomous scanning
      setStatusMessage(globalMediaItems.length > 0 ? "Global Drive scan complete. All accessible media loaded." : "Global Drive scan complete. No media items found.");
    } else {
      // If something was fetched or dialogs were queued, the loop will continue via interval.
      // If nothing happened (e.g., dialog queue empty, no more dialogs to fetch), the interval will still fire but this function might return early.
      setStatusMessage(`Processing... Dialogs in queue: ${dialogsProcessQueueRef.current.length}, More dialogs to fetch: ${hasMoreDialogsToFetch}`);
    }

    setIsLoading(false);
    return mediaFetchedThisCycle; // Indicate if any work was done
  }, [
      isFullScanActive, isLoading, isConnectedInternal, 
      fetchAndQueueDialogs, handleGlobalApiError, 
      hasMoreDialogsToFetch, globalMediaItems.length
  ]);

  useEffect(() => {
    if (isFullScanActive && isConnectedInternal) {
      if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = setInterval(async () => {
        const workDone = await processNextBatch();
        if (!hasMore && isFullScanActive) { // If no more overall and scan was active, stop interval
            setIsFullScanActive(false);
        }
      }, 1000); // Interval to process batches
    } else {
      if (scanIntervalRef.current) {
        clearInterval(scanIntervalRef.current);
        scanIntervalRef.current = null;
      }
    }
    return () => {
      if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
    };
  }, [isFullScanActive, isConnectedInternal, processNextBatch, hasMore]);


  const fetchInitialGlobalMedia = useCallback(async () => {
    if (!isConnectedInternal) {
      setStatusMessage("Not connected. Cannot start Global Drive scan.");
      setIsLoading(false);
      return;
    }
    resetManager(); 
    setIsFullScanActive(true); // Start autonomous scanning
    // Initial fetch of dialogs will be triggered by the processNextBatch via the interval effect
  }, [isConnectedInternal, resetManager]);


  const loadMoreGlobalMedia = useCallback(() => {
    // This button is now less for "overall scan" and more for "show more of what's loaded if filtered"
    // Or, if the scan paused for some reason, this could re-trigger it.
    // For now, if the scan isn't active and there's potentially more, restart it.
    if (!isFullScanActive && hasMore && isConnectedInternal) {
      setIsFullScanActive(true);
      toast({ title: "Resuming Global Scan...", description: "Continuing to fetch all media."});
    } else if (isLoading) {
      toast({ title: "Scan in Progress", description: "Global Drive is already loading."});
    } else if (!hasMore) {
      toast({ title: "All Loaded", description: "All accessible media has been loaded."});
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
    isFullScanActive, // Expose this if UI wants to reflect active scanning state
  };
}

    
