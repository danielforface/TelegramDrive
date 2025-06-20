
"use client";

import { useState, useCallback, useEffect } from 'react';
import type { DialogFilter, GetChatsPaginatedResponse, CloudFolder } from '@/types';
import * as telegramService from '@/services/telegramService';
import { ALL_CHATS_FILTER_ID } from "@/services/telegramService";
import type { useToast } from "@/hooks/use-toast";

const defaultAllChatsFilter: DialogFilter = {
  _: 'dialogFilterDefault',
  id: ALL_CHATS_FILTER_ID,
  title: "All Chats",
  flags: 0,
  pinned_peers: [],
  include_peers: [],
  exclude_peers: []
};

interface UseDialogFiltersManagerProps {
  isConnected: boolean;
  setIsConnected?: (isConnected: boolean) => void; // Optional: Only used if hook needs to inform parent of its internal changes
  toast: ReturnType<typeof useToast>['toast'];
  handleGlobalApiError: (error: any, title: string, defaultMessage: string, doPageReset?: boolean) => void;
  setChatsDataCacheForFilter: (filterId: number, data: { folders: CloudFolder[], pagination: GetChatsPaginatedResponse, isLoading: boolean, error?: string | null }) => void;
  resetMasterChatListForFilteringInCache: () => void;
  updateMasterChatListInCache: (folders: CloudFolder[], pagination: GetChatsPaginatedResponse) => void;
  getChatDataCacheEntry: (cacheKey: number) => any;
  fetchAndCacheDialogsForListManager: (cacheKeyToFetch: number, isLoadingMore: boolean, folderIdForApiCall?: number, customLimit?: number) => Promise<void>;
  setLastFetchedFilterIdForChatListManager: (filterId: number | null) => void;
}

const INITIAL_MASTER_CHATS_LOAD_LIMIT = 100;
const INITIAL_SPECIFIC_FOLDER_CHATS_LOAD_LIMIT = 20;


export function useDialogFiltersManager({
  isConnected: initialIsConnected,
  // setIsConnected: setExternalIsConnected, // This prop is removed if not used to set parent's state
  toast,
  handleGlobalApiError,
  fetchAndCacheDialogsForListManager,
  setLastFetchedFilterIdForChatListManager,
}: UseDialogFiltersManagerProps) {
  const [dialogFilters, setDialogFilters] = useState<DialogFilter[]>([defaultAllChatsFilter]);
  const [activeDialogFilterId, setActiveDialogFilterIdInternal] = useState<number>(ALL_CHATS_FILTER_ID);
  const [activeFilterDetails, setActiveFilterDetailsInternal] = useState<DialogFilter | null>(defaultAllChatsFilter);
  const [isLoadingDialogFilters, setIsLoadingDialogFilters] = useState(true);
  const [hasFetchedDialogFiltersOnce, setHasFetchedDialogFiltersOnce] = useState(false);
  const [isReorderingFolders, setIsReorderingFolders] = useState(false);
  const [isConnectedInternal, setIsConnectedInternal] = useState(initialIsConnected);

  useEffect(() => {
    setIsConnectedInternal(initialIsConnected);
  }, [initialIsConnected]);

  const setIsConnected = useCallback((connected: boolean) => {
    setIsConnectedInternal(connected);
    // If this hook needs to inform its parent about connection changes (e.g., if parent holds 'isConnected'),
    // then call setExternalIsConnected(connected) here.
    // For page.tsx, it's usually the parent (connectionManager) informing this hook.
  }, [/* remove setIsConnectedInternal if it's only a useState setter */]);


  const setActiveDialogFilterId = useCallback(setActiveDialogFilterIdInternal, [setActiveDialogFilterIdInternal]);
  const setActiveFilterDetails = useCallback(setActiveFilterDetailsInternal, [setActiveFilterDetailsInternal]);


  const fetchDialogFilters = useCallback(async (forceRefresh = false) => {
    if (!isConnectedInternal) {
      setIsLoadingDialogFilters(false);
      return;
    }
    if (!forceRefresh && hasFetchedDialogFiltersOnce && dialogFilters.length > 1 && !isReorderingFolders) {
      setIsLoadingDialogFilters(false);
      return;
    }
    setIsLoadingDialogFilters(true);
    try {
      const filtersFromServer = await telegramService.getDialogFilters();
      const processedFilters: DialogFilter[] = [];
      let allChatsFilterExists = false;

      if (filtersFromServer && filtersFromServer.length > 0) {
        filtersFromServer.forEach(filter => {
          if (filter._ === 'dialogFilterDefault') {
            processedFilters.push({ ...filter, id: ALL_CHATS_FILTER_ID, title: "All Chats", pinned_peers: [], include_peers: [], exclude_peers: [] });
            allChatsFilterExists = true;
          } else if (filter._ === 'dialogFilter' || filter._ === 'dialogFilterChatlist') {
            processedFilters.push({ ...filter, pinned_peers: filter.pinned_peers || [], include_peers: filter.include_peers || [], exclude_peers: filter.exclude_peers || [], });
          }
        });
      }

      if (!allChatsFilterExists && !processedFilters.some(f => f.id === ALL_CHATS_FILTER_ID)) {
        processedFilters.unshift({ ...defaultAllChatsFilter });
      }

      processedFilters.sort((a, b) => {
        if (a.id === ALL_CHATS_FILTER_ID) return -1;
        if (b.id === ALL_CHATS_FILTER_ID) return 1;
        const originalFilters = filtersFromServer || [];
        return (originalFilters.findIndex(df => df.id === a.id)) - (originalFilters.findIndex(df => df.id === b.id));
      });

      const finalFilters = processedFilters.length > 0 ? processedFilters : [defaultAllChatsFilter];
      setDialogFilters(finalFilters); 
      setHasFetchedDialogFiltersOnce(true);

      const currentActiveIdBeforeUpdate = activeDialogFilterId; 
      const currentActiveStillExists = finalFilters.some(f => f.id === currentActiveIdBeforeUpdate);

      if (!currentActiveStillExists && finalFilters.length > 0) {
        const newActiveIdToSet = finalFilters.find(f => f.id === ALL_CHATS_FILTER_ID) ? ALL_CHATS_FILTER_ID : finalFilters[0].id;
        setActiveDialogFilterIdInternal(newActiveIdToSet); 
      } else if (finalFilters.length === 0) {
        setActiveDialogFilterIdInternal(ALL_CHATS_FILTER_ID); 
      }
      
      if (forceRefresh || finalFilters.length > 0) {
        await fetchAndCacheDialogsForListManager(ALL_CHATS_FILTER_ID, false, undefined, INITIAL_MASTER_CHATS_LOAD_LIMIT);
        for (const filter of finalFilters) {
          if (filter._ === 'dialogFilter' && filter.id !== ALL_CHATS_FILTER_ID) {
            await fetchAndCacheDialogsForListManager(filter.id, false, filter.id, INITIAL_SPECIFIC_FOLDER_CHATS_LOAD_LIMIT);
          }
        }
      }

    } catch (error: any) {
      handleGlobalApiError(error, "Error Fetching Folders", "Could not load your chat folders.");
      setDialogFilters([defaultAllChatsFilter]);
      setActiveDialogFilterIdInternal(ALL_CHATS_FILTER_ID); 
      setHasFetchedDialogFiltersOnce(false);
    } finally {
      setIsLoadingDialogFilters(false);
    }
  }, [
      isConnectedInternal, handleGlobalApiError, hasFetchedDialogFiltersOnce, dialogFilters.length, isReorderingFolders,
      fetchAndCacheDialogsForListManager, activeDialogFilterId, 
  ]);

  const handleSelectDialogFilter = useCallback((filterId: number) => {
    if (isReorderingFolders) return;
    setActiveDialogFilterIdInternal(filterId); 
    setLastFetchedFilterIdForChatListManager(null);
  }, [isReorderingFolders, setLastFetchedFilterIdForChatListManager]);

  const handleToggleReorderFolders = useCallback(async () => {
    if (isReorderingFolders) {
      const newOrder = dialogFilters
        .filter(f => f.id !== ALL_CHATS_FILTER_ID)
        .map(f => f.id);
      try {
        await telegramService.updateDialogFiltersOrder(newOrder);
        toast({ title: "Folder Order Saved", description: "The new folder order has been saved to Telegram." });
      } catch (error: any) {
        handleGlobalApiError(error, "Error Saving Order", "Could not save the folder order.");
        await fetchDialogFilters(true);
      }
    }
    setIsReorderingFolders(prev => !prev);
  }, [isReorderingFolders, dialogFilters, toast, handleGlobalApiError, fetchDialogFilters]);

  const handleMoveFilter = useCallback((dragIndex: number, hoverIndex: number) => {
    const draggedFilter = dialogFilters[dragIndex];
    if (draggedFilter.id === ALL_CHATS_FILTER_ID || (dialogFilters[hoverIndex] && dialogFilters[hoverIndex].id === ALL_CHATS_FILTER_ID)) {
      return;
    }
    setDialogFilters(prevFilters => {
      const updatedFilters = [...prevFilters];
      const [movedItem] = updatedFilters.splice(dragIndex, 1);
      updatedFilters.splice(hoverIndex, 0, movedItem);
      return updatedFilters;
    });
  }, [dialogFilters]);

  const handleShareFilter = useCallback(async (filterId: number) => {
    if (filterId === ALL_CHATS_FILTER_ID) {
      toast({ title: "Cannot Share", description: "This view cannot be shared." });
      return;
    }
    setDialogFilters(prev => prev.map(f => f.id === filterId ? { ...f, isLoading: true, inviteLink: undefined } : f));
    try {
      const result = await telegramService.exportChatlistInvite(filterId);
      if (result && result.link) {
        setDialogFilters(prev => prev.map(f => f.id === filterId ? { ...f, isLoading: false, inviteLink: result.link } : f));
        toast({ title: "Folder Invite Link Created", description: `Link: ${result.link} (Copied to console)`, });
      } else {
        throw new Error("No link returned from server.");
      }
    } catch (error: any) {
      handleGlobalApiError(error, "Error Sharing Folder", "Could not create an invite link for this folder.");
      setDialogFilters(prev => prev.map(f => f.id === filterId ? { ...f, isLoading: false } : f));
    }
  }, [toast, handleGlobalApiError]);

  const handleRefreshCurrentFilterView = useCallback(() => {
     if (activeFilterDetails) { 
        toast({ title: `Refreshing "${activeFilterDetails.title}"...`});
        setLastFetchedFilterIdForChatListManager(null);
    }
  }, [activeFilterDetails, toast, setLastFetchedFilterIdForChatListManager]);

  const resetDialogFiltersState = useCallback(() => {
    setDialogFilters([defaultAllChatsFilter]);
    setActiveDialogFilterIdInternal(ALL_CHATS_FILTER_ID);
    setActiveFilterDetailsInternal(defaultAllChatsFilter);
    setIsLoadingDialogFilters(true);
    setHasFetchedDialogFiltersOnce(false);
    setIsReorderingFolders(false);
  }, []);

  return {
    dialogFilters,
    setDialogFilters, 
    activeDialogFilterId, 
    activeFilterDetails,  
    setActiveDialogFilterId, 
    setActiveFilterDetails,  
    isLoadingDialogFilters,
    setIsLoadingDialogFilters,
    hasFetchedDialogFiltersOnce,
    setHasFetchedDialogFiltersOnce,
    isReorderingFolders,
    fetchDialogFilters,
    handleSelectDialogFilter,
    handleToggleReorderFolders,
    handleMoveFilter,
    handleShareFilter,
    handleRefreshCurrentFilterView,
    defaultAllChatsFilter,
    resetDialogFiltersState,
    setIsConnected,
  };
}
    
