
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
  isConnected: initialIsConnected, // Renamed prop for clarity
}: UseGlobalDriveManagerProps) {
  const [globalMediaItems, setGlobalMediaItems] = useState<CloudFile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true); // Overall "has more" for the global drive
  const [statusMessage, setStatusMessage] = useState<string | null>("Initializing Global Drive...");

  const allDialogsCacheRef = useRef<CloudFolder[]>([]);
  const dialogsProcessQueueRef = useRef<DialogProcessInfo[]>([]);
  const processedDialogIdsRef = useRef<Set<string>>(new Set());
  const dialogMediaOffsetCacheRef = useRef<Map<string, { offsetId: number, hasMore: boolean }>>(new Map());

  const [isInitialScanComplete, setIsInitialScanComplete] = useState(false);
  const [currentDialogsOffsetDate, setCurrentDialogsOffsetDate] = useState(0);
  const [currentDialogsOffsetId, setCurrentDialogsOffsetId] = useState(0);
  const [currentDialogsOffsetPeer, setCurrentDialogsOffsetPeer] = useState<any>({ _: 'inputPeerEmpty' });
  const [hasMoreDialogsToFetch, setHasMoreDialogsToFetch] = useState(true);

  const [isConnectedInternal, setIsConnectedInternal] = useState(initialIsConnected);

  useEffect(() => {
    setIsConnectedInternal(initialIsConnected);
  }, [initialIsConnected]);

  const setIsConnected = useCallback((connected: boolean) => {
    setIsConnectedInternal(connected);
  }, []);


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
    if (!isConnectedInternal || (!isLoadMoreDialogs && allDialogsCacheRef.current.length > 0) || (isLoadMoreDialogs && !hasMoreDialogsToFetch)) {
      if (!hasMoreDialogsToFetch && isLoadMoreDialogs) setStatusMessage("All dialogs scanned. No more to fetch.");
      return false;
    }
    setStatusMessage(isLoadMoreDialogs ? `Fetching more dialogs... (${allDialogsCacheRef.current.length} dialogs found so far)` : "Fetching initial dialog list for Global Drive...");
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
        setStatusMessage(allDialogsCacheRef.current.length > 0 ? `All ${allDialogsCacheRef.current.length} dialogs fetched. Starting media scan...` : "No dialogs found.");
      } else {
        setStatusMessage(`Fetched ${allDialogsCacheRef.current.length} dialogs. More available...`);
      }
      return true;
    } catch (error) {
      handleGlobalApiError(error, "Error Fetching Dialogs for Global Drive", "Could not load dialog list.");
      setHasMoreDialogsToFetch(false);
      setStatusMessage("Error fetching dialogs. Scan cannot continue.");
      return false;
    } finally {
       // setIsLoading(false); // isLoading is managed by the main loop now
    }
  }, [isConnectedInternal, handleGlobalApiError, currentDialogsOffsetDate, currentDialogsOffsetId, currentDialogsOffsetPeer, hasMoreDialogsToFetch]);


  const processMediaFetchLoop = useCallback(async () => {
    if (!isConnectedInternal || isLoading) return;
    setIsLoading(true);

    let itemsFetchedInThisRun = 0;
    const BATCH_SIZE_GLOBAL_MEDIA = 3;

    while (itemsFetchedInThisRun < BATCH_SIZE_GLOBAL_MEDIA) {
        if (dialogsProcessQueueRef.current.length === 0) {
            if (hasMoreDialogsToFetch) {
                setStatusMessage(`Fetching next batch of dialogs... (${allDialogsCacheRef.current.length} found so far)`);
                const gotMoreDialogs = await fetchAndQueueDialogs(true);
                if (!gotMoreDialogs && !hasMoreDialogsToFetch) {
                    break;
                }
                if(dialogsProcessQueueRef.current.length === 0 && !hasMoreDialogsToFetch) break;
            } else {
                break; 
            }
        }

        const currentProcessInfo = dialogsProcessQueueRef.current.shift();
        if (!currentProcessInfo || !currentProcessInfo.dialog.inputPeer || !currentProcessInfo.hasMoreMedia) {
            if(currentProcessInfo) currentProcessInfo.isFullyScanned = true;
            continue;
        }
        
        const { dialog, mediaOffsetId: currentMediaOffset } = currentProcessInfo;
        setStatusMessage(`Scanning media in: ${dialog.name}... (${dialogsProcessQueueRef.current.length} chats remaining in queue)`);

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
                dialogsProcessQueueRef.current.push(currentProcessInfo);
            } else {
                currentProcessInfo.isFullyScanned = true;
            }
            itemsFetchedInThisRun++;

        } catch (error) {
            handleGlobalApiError(error, `Error Fetching Media for ${dialog.name}`, `Could not load media from ${dialog.name}.`);
            currentProcessInfo.hasMoreMedia = false;
            currentProcessInfo.isFullyScanned = true;
        }
    }

    if (dialogsProcessQueueRef.current.length === 0 && !hasMoreDialogsToFetch) {
      setHasMore(false);
      setStatusMessage(globalMediaItems.length > 0 ? "Global Drive scan complete. All accessible media loaded." : "Global Drive scan complete. No media items found.");
      if(!isInitialScanComplete) setIsInitialScanComplete(true);
    } else {
      setHasMore(true);
      if(!isInitialScanComplete && allDialogsCacheRef.current.length > 0) setIsInitialScanComplete(true);
      setStatusMessage(
        dialogsProcessQueueRef.current.length > 0 
          ? `More media to scan. In queue: ${dialogsProcessQueueRef.current.length} dialogs.` 
          : (hasMoreDialogsToFetch 
              ? `Ready to fetch more dialogs. (${allDialogsCacheRef.current.length} found)`
              : "Processing final media batches...")
      );
    }
    setIsLoading(false);

  }, [isConnectedInternal, isLoading, handleGlobalApiError, fetchAndQueueDialogs, isInitialScanComplete, hasMoreDialogsToFetch, globalMediaItems.length]);


  const fetchInitialGlobalMedia = useCallback(async () => {
    if (!isConnectedInternal) {
      setStatusMessage("Not connected. Cannot start Global Drive scan.");
      setIsLoading(false);
      return;
    }
    resetManager();
    setIsLoading(true);
    setStatusMessage("Fetching initial dialog list for Global Drive...");

    const dialogsFetched = await fetchAndQueueDialogs(false);
    if (dialogsFetched && dialogsProcessQueueRef.current.length > 0) {
        processMediaFetchLoop();
    } else if (!dialogsFetched && !hasMoreDialogsToFetch) {
        setHasMore(false);
        setStatusMessage(allDialogsCacheRef.current.length === 0 ? "No dialogs found to scan." : "All dialogs fetched, but queue is empty. Check processing logic.");
        setIsLoading(false);
    }
  }, [isConnectedInternal, resetManager, fetchAndQueueDialogs, processMediaFetchLoop, hasMoreDialogsToFetch]);


  const loadMoreGlobalMedia = useCallback(() => {
    if (isLoading || !hasMore) return;
    processMediaFetchLoop();
  }, [isLoading, hasMore, processMediaFetchLoop]);

  return {
    globalMediaItems,
    isLoading,
    hasMore,
    statusMessage,
    fetchInitialGlobalMedia,
    loadMoreGlobalMedia,
    resetManager,
    setIsConnected, // Expose the setter
    setGlobalMediaItemsDirectly: setGlobalMediaItems, // For file operations if needed
  };
}

    