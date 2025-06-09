
"use client";

import { useState, useCallback, useEffect, useRef } from 'react';
import type { CloudFile, CloudFolder, MediaHistoryResponse, InputPeer } from '@/types';
import * as telegramService from '@/services/telegramService';
import type { useToast } from "@/hooks/use-toast";

const GLOBAL_DRIVE_DIALOG_FETCH_LIMIT = 50; // How many dialogs to fetch info for at a time
const GLOBAL_DRIVE_MEDIA_PER_DIALOG_INITIAL_LIMIT = 10; // How many media items to fetch initially per dialog
const GLOBAL_DRIVE_MEDIA_PER_DIALOG_SUBSEQUENT_LIMIT = 5; // How many media items to fetch on "load more" per dialog

interface UseGlobalDriveManagerProps {
  toast: ReturnType<typeof useToast>['toast'];
  handleGlobalApiError: (error: any, title: string, defaultMessage: string, doPageReset?: boolean) => void;
  isConnected: boolean;
}

interface DialogProcessInfo {
  dialog: CloudFolder;
  mediaOffsetId: number;
  hasMoreMedia: boolean;
  isFullyScanned?: boolean; // True if we've tried to load all its media or it has no more
}

export function useGlobalDriveManager({
  toast,
  handleGlobalApiError,
  isConnected,
}: UseGlobalDriveManagerProps) {
  const [globalMediaItems, setGlobalMediaItems] = useState<CloudFile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true); // Overall "has more" for the global drive
  const [statusMessage, setStatusMessage] = useState<string | null>("Initializing Global Drive...");

  const allDialogsCacheRef = useRef<CloudFolder[]>([]);
  const dialogsProcessQueueRef = useRef<DialogProcessInfo[]>([]);
  const processedDialogIdsRef = useRef<Set<string>>(new Set()); // To avoid re-processing a dialog unless for "load more" from it
  const dialogMediaOffsetCacheRef = useRef<Map<string, { offsetId: number, hasMore: boolean }>>(new Map());

  const [isInitialScanComplete, setIsInitialScanComplete] = useState(false);
  const [currentDialogsOffsetDate, setCurrentDialogsOffsetDate] = useState(0);
  const [currentDialogsOffsetId, setCurrentDialogsOffsetId] = useState(0);
  const [currentDialogsOffsetPeer, setCurrentDialogsOffsetPeer] = useState<any>({ _: 'inputPeerEmpty' });
  const [hasMoreDialogsToFetch, setHasMoreDialogsToFetch] = useState(true);

  const resetManager = useCallback(() => {
    setGlobalMediaItems([]);
    setIsLoading(false);
    setHasMore(true);
    setStatusMessage("Initializing Global Drive...");
    allDialogsCacheRef.current = [];
    dialogsProcessQueueRef.current = [];
    processedDialogIdsRef.current = new Set();
    dialogMediaOffsetCacheRef.current = new Map();
    setIsInitialScanComplete(false);
    setCurrentDialogsOffsetDate(0);
    setCurrentDialogsOffsetId(0);
    setCurrentDialogsOffsetPeer({ _: 'inputPeerEmpty' });
    setHasMoreDialogsToFetch(true);
  }, []);

  const fetchAndQueueDialogs = useCallback(async (isLoadMoreDialogs: boolean = false) => {
    if (!isConnected || (!isLoadMoreDialogs && allDialogsCacheRef.current.length > 0) || (isLoadMoreDialogs && !hasMoreDialogsToFetch)) {
      if (!hasMoreDialogsToFetch && isLoadMoreDialogs) setStatusMessage("All dialogs scanned.");
      return false; // Don't re-fetch if already have dialogs unless loading more
    }
    setStatusMessage(isLoadMoreDialogs ? "Fetching more dialogs..." : "Fetching dialog list...");
    setIsLoading(true);
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
      }));
      dialogsProcessQueueRef.current.push(...newQueueItems);

      setHasMoreDialogsToFetch(response.hasMore);
      setCurrentDialogsOffsetDate(response.nextOffsetDate);
      setCurrentDialogsOffsetId(response.nextOffsetId);
      setCurrentDialogsOffsetPeer(response.nextOffsetPeer);
      
      if (!response.hasMore) {
        setStatusMessage("All dialogs fetched. Starting media scan...");
      } else {
        setStatusMessage(`Fetched ${allDialogsCacheRef.current.length} dialogs. More dialogs to fetch...`);
      }
      return true; // Indicates dialogs were fetched or queue was populated
    } catch (error) {
      handleGlobalApiError(error, "Error Fetching Dialogs for Global Drive", "Could not load dialog list.");
      setHasMoreDialogsToFetch(false); // Stop trying to fetch more dialogs on error
      return false;
    } finally {
       if (!isLoadMoreDialogs) setIsLoading(false); // Only set loading false for initial dialog fetch phase
    }
  }, [isConnected, handleGlobalApiError, currentDialogsOffsetDate, currentDialogsOffsetId, currentDialogsOffsetPeer, hasMoreDialogsToFetch]);


  const processMediaFetchLoop = useCallback(async () => {
    if (!isConnected || isLoading) return;
    setIsLoading(true);

    let itemsFetchedInThisRun = 0;
    const BATCH_SIZE_GLOBAL_MEDIA = 3; // How many dialogs to process media for in one go

    while (itemsFetchedInThisRun < BATCH_SIZE_GLOBAL_MEDIA) {
        if (dialogsProcessQueueRef.current.length === 0) {
            if (hasMoreDialogsToFetch) {
                setStatusMessage("Fetching next batch of dialogs...");
                const gotMoreDialogs = await fetchAndQueueDialogs(true);
                if (!gotMoreDialogs && !hasMoreDialogsToFetch) { // No more dialogs and fetch didn't yield any
                    break; // Break inner loop
                }
                if(dialogsProcessQueueRef.current.length === 0 && !hasMoreDialogsToFetch) break; // Still no dialogs, break
                // If dialogs were fetched, the loop will continue
            } else {
                // No more dialogs in queue and no more dialogs to fetch from server
                break; 
            }
        }

        const currentProcessInfo = dialogsProcessQueueRef.current.shift();
        if (!currentProcessInfo || !currentProcessInfo.dialog.inputPeer || !currentProcessInfo.hasMoreMedia) {
            if(currentProcessInfo) currentProcessInfo.isFullyScanned = true; // Mark as scanned if no peer or no more media
            continue;
        }
        
        const { dialog, mediaOffsetId: currentMediaOffset } = currentProcessInfo;
        setStatusMessage(`Scanning media in: ${dialog.name}...`);

        try {
            const mediaResponse = await telegramService.getChatMediaHistory(
                dialog.inputPeer,
                isInitialScanComplete ? GLOBAL_DRIVE_MEDIA_PER_DIALOG_SUBSEQUENT_LIMIT : GLOBAL_DRIVE_MEDIA_PER_DIALOG_INITIAL_LIMIT,
                currentMediaOffset
            );

            setGlobalMediaItems(prevItems => {
                const existingIds = new Set(prevItems.map(item => item.id));
                const newUniqueFiles = mediaResponse.files.filter(file => !existingIds.has(file.id));
                return [...prevItems, ...newUniqueFiles].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
            });
            
            dialogMediaOffsetCacheRef.current.set(dialog.id, { offsetId: mediaResponse.nextOffsetId || 0, hasMore: mediaResponse.hasMore });
            currentProcessInfo.mediaOffsetId = mediaResponse.nextOffsetId || 0;
            currentProcessInfo.hasMoreMedia = mediaResponse.hasMore;

            if (mediaResponse.hasMore) {
                dialogsProcessQueueRef.current.push(currentProcessInfo); // Re-queue if dialog has more media
            } else {
                currentProcessInfo.isFullyScanned = true; // Mark as fully scanned for this dialog
            }
            itemsFetchedInThisRun++;

        } catch (error) {
            handleGlobalApiError(error, `Error Fetching Media for ${dialog.name}`, `Could not load media from ${dialog.name}.`);
            currentProcessInfo.hasMoreMedia = false; // Stop trying for this dialog on error
            currentProcessInfo.isFullyScanned = true;
        }
    } // End of while loop

    if (dialogsProcessQueueRef.current.length === 0 && !hasMoreDialogsToFetch) {
      setHasMore(false);
      setStatusMessage("Global Drive scan complete. All accessible media loaded.");
      if(!isInitialScanComplete) setIsInitialScanComplete(true);
    } else {
      setHasMore(true); // Still more to process or fetch
      if(!isInitialScanComplete && itemsFetchedInThisRun === 0 && allDialogsCacheRef.current.length > 0){
         // This case means we have dialogs, but the first batch processing yielded no media from them (empty chats)
         // If there are more dialogs to fetch, it'll try. If not, it will eventually set hasMore to false.
      }
      if(!isInitialScanComplete && allDialogsCacheRef.current.length > 0) setIsInitialScanComplete(true); // Mark initial scan as done after first pass
       setStatusMessage(dialogsProcessQueueRef.current.length > 0 ? `More media to scan. In queue: ${dialogsProcessQueueRef.current.length} dialogs.` : (hasMoreDialogsToFetch ? "Ready to fetch more dialogs." : "Processing final media batches..."));
    }
    setIsLoading(false);

  }, [isConnected, isLoading, handleGlobalApiError, fetchAndQueueDialogs, isInitialScanComplete, hasMoreDialogsToFetch]);


  const fetchInitialGlobalMedia = useCallback(async () => {
    if (!isConnected) {
      setStatusMessage("Not connected. Cannot start Global Drive scan.");
      setIsLoading(false);
      return;
    }
    resetManager(); // Clear previous state before starting
    setIsLoading(true);
    setStatusMessage("Fetching initial dialog list for Global Drive...");

    const dialogsFetched = await fetchAndQueueDialogs(false);
    if (dialogsFetched && dialogsProcessQueueRef.current.length > 0) {
        processMediaFetchLoop(); // Start the media fetching loop
    } else if (!dialogsFetched && !hasMoreDialogsToFetch) {
        // This means fetchAndQueueDialogs returned false (e.g. error or no dialogs at all)
        // AND there are no more dialogs to fetch.
        setHasMore(false);
        setStatusMessage("No dialogs found or could not fetch dialog list.");
        setIsLoading(false);
    } else {
        // Dialogs might still be fetching or an error occurred.
        // fetchAndQueueDialogs's finally block would have set isLoading to false if it completed without queuing.
        // If it queued items, processMediaFetchLoop will handle isLoading.
    }
  }, [isConnected, resetManager, fetchAndQueueDialogs, processMediaFetchLoop]);


  const loadMoreGlobalMedia = useCallback(() => {
    if (isLoading || !hasMore) return;
    processMediaFetchLoop();
  }, [isLoading, hasMore, processMediaFetchLoop]);

  // Effect to start initial fetch when isConnected changes to true
  useEffect(() => {
    if (isConnected && !isInitialScanComplete && allDialogsCacheRef.current.length === 0 && dialogsProcessQueueRef.current.length === 0) {
      // This condition ensures it only auto-starts if not already scanned and no dialogs are loaded/queued
      // fetchInitialGlobalMedia(); // This will be triggered by page.tsx via onOpenGlobalDrive
    }
  }, [isConnected, isInitialScanComplete /*, fetchInitialGlobalMedia */]);


  return {
    globalMediaItems,
    isLoading,
    hasMore,
    statusMessage,
    fetchInitialGlobalMedia,
    loadMoreGlobalMedia,
    resetManager,
  };
}

