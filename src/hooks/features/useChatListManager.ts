
"use client";

import { useState, useCallback, useEffect } from 'react';
import type { CloudFolder, DialogFilter, GetChatsPaginatedResponse } from '@/types';
import * as telegramService from '@/services/telegramService';
import { ALL_CHATS_FILTER_ID } from "@/services/telegramService";
import type { useToast } from "@/hooks/use-toast";

interface CachedFolderData {
  folders: CloudFolder[];
  pagination: GetChatsPaginatedResponse; 
  isLoading: boolean;
  error?: string | null;
}

const initialPaginationStateForCache: GetChatsPaginatedResponse = {
  folders: [],
  nextOffsetDate: 0,
  nextOffsetId: 0,
  nextOffsetPeer: { _: 'inputPeerEmpty' },
  hasMore: true,
};

const SUBSEQUENT_MASTER_CHATS_LOAD_LIMIT = 50;
const SUBSEQUENT_SPECIFIC_FOLDER_CHATS_LOAD_LIMIT = 20;
const INITIAL_MASTER_CHATS_LOAD_LIMIT = 100;
const INITIAL_SPECIFIC_FOLDER_CHATS_LOAD_LIMIT = 20;


interface UseChatListManagerProps {
  isConnected: boolean;
  setIsConnected?: (isConnected: boolean) => void; // Optional prop
  activeFilterDetails: DialogFilter | null; 
  toast: ReturnType<typeof useToast>['toast'];
  handleGlobalApiError: (error: any, title: string, defaultMessage: string, doPageReset?: boolean) => void;
  dialogFilters: DialogFilter[]; 
  resetSelectedMedia: () => void; 
  setClipboardItem: (item: any) => void; 
}

export function useChatListManager({
  isConnected: initialIsConnected,
  setIsConnected: setExternalIsConnected,
  activeFilterDetails,
  toast,
  handleGlobalApiError,
  dialogFilters,
  resetSelectedMedia,
  setClipboardItem,
}: UseChatListManagerProps) {
  const [chatDataCache, setChatDataCache] = useState<Map<number, CachedFolderData>>(new Map());
  const [masterChatListForFiltering, setMasterChatListForFiltering] = useState<CloudFolder[]>([]); 
  const [masterChatListPaginationForFiltering, setMasterChatListPaginationForFiltering] = useState<GetChatsPaginatedResponse>(initialPaginationStateForCache);

  const [displayedChats, setDisplayedChats] = useState<CloudFolder[]>([]);
  const [isLoadingDisplayedChats, setIsLoadingDisplayedChats] = useState(false);
  const [hasMoreDisplayedChats, setHasMoreDisplayedChats] = useState(true);
  const [currentErrorMessageForChatList, setCurrentErrorMessageForChatList] = useState<string | null>(null);
  const [lastFetchedFilterIdForChatList, setLastFetchedFilterIdForChatList] = useState<number | null>(null);
  const [isConnectedInternal, setIsConnectedInternal] = useState(initialIsConnected);

  useEffect(() => {
    setIsConnectedInternal(initialIsConnected);
  }, [initialIsConnected]);

  const setIsConnected = useCallback((connected: boolean) => {
    setIsConnectedInternal(connected);
    if (setExternalIsConnected) {
      setExternalIsConnected(connected);
    }
  }, [setExternalIsConnected]);

  const peerToKey = useCallback((peer: any): string | null => {
    if (!peer) return null;
    if (peer._ === 'inputPeerUser') return `user:${String(peer.user_id)}`;
    if (peer._ === 'inputPeerChat') return `chat:${String(peer.chat_id)}`;
    if (peer._ === 'inputPeerChannel') return `channel:${String(peer.channel_id)}`;
    return null;
  }, []);

  const fetchAndCacheDialogsForList = useCallback(async (
    cacheKeyToFetch: number,
    isLoadingMore: boolean,
    folderIdForApiCall?: number, 
    customLimit?: number
  ) => {
    const existingCacheEntry = chatDataCache.get(cacheKeyToFetch);
    if (existingCacheEntry?.isLoading) return;

    const currentPagination = isLoadingMore
      ? (existingCacheEntry?.pagination || initialPaginationStateForCache)
      : initialPaginationStateForCache;

    setChatDataCache(prev => new Map(prev).set(cacheKeyToFetch, {
      folders: isLoadingMore ? (existingCacheEntry?.folders || []) : [],
      pagination: currentPagination,
      isLoading: true,
      error: null,
    }));

    const limitToUse = customLimit !== undefined ? customLimit :
                     (isLoadingMore
                        ? (folderIdForApiCall === undefined ? SUBSEQUENT_MASTER_CHATS_LOAD_LIMIT : SUBSEQUENT_SPECIFIC_FOLDER_CHATS_LOAD_LIMIT)
                        : (folderIdForApiCall === undefined ? INITIAL_MASTER_CHATS_LOAD_LIMIT : INITIAL_SPECIFIC_FOLDER_CHATS_LOAD_LIMIT));
    try {
      const response = await telegramService.getTelegramChats(
        limitToUse,
        currentPagination.nextOffsetDate,
        currentPagination.nextOffsetId,
        currentPagination.nextOffsetPeer,
        folderIdForApiCall
      );

      const newFoldersFromServer = response.folders;
      let combinedFolders;
      const currentCachedDataBeforeUpdate = chatDataCache.get(cacheKeyToFetch); 

      if (isLoadingMore) {
        const existingFoldersInCache = currentCachedDataBeforeUpdate?.folders || [];
        const existingIds = new Set(existingFoldersInCache.map(f => f.id));
        const trulyNewFolders = newFoldersFromServer.filter(f => !existingIds.has(f.id));
        combinedFolders = [...existingFoldersInCache, ...trulyNewFolders];
      } else {
        combinedFolders = newFoldersFromServer;
      }

      setChatDataCache(prev => {
        const updatedCache = new Map(prev);
        updatedCache.set(cacheKeyToFetch, {
          folders: combinedFolders,
          pagination: { 
            folders: [], 
            nextOffsetDate: response.nextOffsetDate,
            nextOffsetId: response.nextOffsetId,
            nextOffsetPeer: response.nextOffsetPeer,
            hasMore: response.hasMore,
          },
          isLoading: false,
          error: null,
        });
        return updatedCache;
      });

      if (cacheKeyToFetch === ALL_CHATS_FILTER_ID) { 
        setMasterChatListForFiltering(combinedFolders);
        setMasterChatListPaginationForFiltering({
          folders: [], 
          nextOffsetDate: response.nextOffsetDate,
          nextOffsetId: response.nextOffsetId,
          nextOffsetPeer: response.nextOffsetPeer,
          hasMore: response.hasMore,
        });
      }

    } catch (error: any) {
      let errorMsg = error.message || "Failed to load chats.";
      let errorTypeForCache = 'GENERAL_ERROR';
      const currentFilterTitle = dialogFilters.find(f => f.id === folderIdForApiCall)?.title || (folderIdForApiCall === undefined ? 'All Chats' : `Folder ID ${folderIdForApiCall}`);

      if (error.message?.includes('FOLDER_ID_INVALID') && folderIdForApiCall !== undefined) {
        errorMsg = `Folder "${currentFilterTitle}" (ID: ${folderIdForApiCall}) is invalid. Will attempt to show matching chats from 'All Chats' if applicable.`;
        errorTypeForCache = 'FOLDER_ID_INVALID_FALLBACK';
        toast({ title: `Folder Load Issue for "${currentFilterTitle}"`, description: errorMsg, variant: "default", duration: 7000 });
      } else {
        handleGlobalApiError(error, `Error loading chats for "${currentFilterTitle}"`, errorMsg);
      }

      setChatDataCache(prev => {
        const latestCacheData = prev.get(cacheKeyToFetch);
        return new Map(prev).set(cacheKeyToFetch, {
          folders: isLoadingMore ? (latestCacheData?.folders || []) : [],
          pagination: { ...(isLoadingMore ? (latestCacheData?.pagination || initialPaginationStateForCache) : initialPaginationStateForCache), hasMore: false },
          isLoading: false,
          error: errorTypeForCache,
        });
      });
      if (cacheKeyToFetch === ALL_CHATS_FILTER_ID) {
        setMasterChatListForFiltering(isLoadingMore ? masterChatListForFiltering : []);
        setMasterChatListPaginationForFiltering(prev => ({ ...prev, hasMore: false }));
      }
    }
  }, [chatDataCache, handleGlobalApiError, toast, masterChatListForFiltering, dialogFilters]);


  const fetchDataForActiveFilterWrapper = useCallback((isLoadingMore: boolean) => {
    if (!isConnectedInternal || !activeFilterDetails) {
       return;
    }
    const currentFilterId = activeFilterDetails.id;
    const filterType = activeFilterDetails._;

    if (filterType === 'dialogFilterDefault') {
      fetchAndCacheDialogsForList(ALL_CHATS_FILTER_ID, isLoadingMore);
    } else if (filterType === 'dialogFilter') {
      fetchAndCacheDialogsForList(currentFilterId, isLoadingMore, currentFilterId);
    } else if (filterType === 'dialogFilterChatlist') {
      fetchAndCacheDialogsForList(ALL_CHATS_FILTER_ID, isLoadingMore);
    }
  }, [isConnectedInternal, activeFilterDetails, fetchAndCacheDialogsForList]);

  useEffect(() => {
    if (!isConnectedInternal || !activeFilterDetails) return;

    const filterIdToFetch = activeFilterDetails.id;
    const isNewFilter = lastFetchedFilterIdForChatList !== filterIdToFetch;
    if (isNewFilter) setCurrentErrorMessageForChatList(null);

    const filterType = activeFilterDetails._;
    let isCurrentFilterListEmptyAndNeedsLoad = false;

    const cachedEntryForCurrent = chatDataCache.get(filterIdToFetch);
    const cachedEntryForAllChats = chatDataCache.get(ALL_CHATS_FILTER_ID);

    if (filterType === 'dialogFilterDefault') {
        isCurrentFilterListEmptyAndNeedsLoad = (!cachedEntryForAllChats || cachedEntryForAllChats.folders.length === 0) &&
                                             (!cachedEntryForAllChats || cachedEntryForAllChats.pagination.hasMore) &&
                                             !cachedEntryForAllChats?.isLoading;
    } else if (filterType === 'dialogFilterChatlist' || (filterType === 'dialogFilter' && cachedEntryForCurrent?.error === 'FOLDER_ID_INVALID_FALLBACK')) {
        isCurrentFilterListEmptyAndNeedsLoad = (!cachedEntryForAllChats || cachedEntryForAllChats.folders.length === 0) &&
                                             masterChatListPaginationForFiltering.hasMore && 
                                             !cachedEntryForAllChats?.isLoading;
    } else if (filterType === 'dialogFilter') {
         isCurrentFilterListEmptyAndNeedsLoad = (!cachedEntryForCurrent || cachedEntryForCurrent.folders.length === 0) &&
                                             (!cachedEntryForCurrent || cachedEntryForCurrent.pagination.hasMore) &&
                                             !cachedEntryForCurrent?.isLoading;
    }

    if (isNewFilter || isCurrentFilterListEmptyAndNeedsLoad) {
        if (isNewFilter) {
            setDisplayedChats([]); 
            resetSelectedMedia(); 
            setClipboardItem(null); 
        }
        setLastFetchedFilterIdForChatList(filterIdToFetch);
        fetchDataForActiveFilterWrapper(false); 
    }
  }, [
      isConnectedInternal, activeFilterDetails, lastFetchedFilterIdForChatList,
      chatDataCache, masterChatListPaginationForFiltering.hasMore,
      fetchDataForActiveFilterWrapper, resetSelectedMedia, setClipboardItem
  ]);

  useEffect(() => {
    if (!isConnectedInternal || !activeFilterDetails) {
      setIsLoadingDisplayedChats(false); 
      setDisplayedChats([]);
      return;
    }

    const currentFilterId = activeFilterDetails.id;
    const filterType = activeFilterDetails._;
    const cachedEntryForCurrentFilter = chatDataCache.get(currentFilterId);
    const cachedEntryForAllChats = chatDataCache.get(ALL_CHATS_FILTER_ID);

    if (lastFetchedFilterIdForChatList !== currentFilterId && currentFilterId !== undefined) {
        setCurrentErrorMessageForChatList(null); 
    }

    if (filterType === 'dialogFilterDefault') {
      if (cachedEntryForAllChats) {
        setDisplayedChats(cachedEntryForAllChats.folders);
        setHasMoreDisplayedChats(cachedEntryForAllChats.pagination.hasMore);
        if (cachedEntryForAllChats.error && cachedEntryForAllChats.error !== 'FOLDER_ID_INVALID_FALLBACK') {
          setCurrentErrorMessageForChatList(`Error for "All Chats": ${cachedEntryForAllChats.error}`);
        }
        setIsLoadingDisplayedChats(cachedEntryForAllChats.isLoading);
      } else { 
        setDisplayedChats([]);
        setHasMoreDisplayedChats(initialPaginationStateForCache.hasMore);
        setIsLoadingDisplayedChats(true);
      }
    } else if (filterType === 'dialogFilter') {
      if (cachedEntryForCurrentFilter?.error === 'FOLDER_ID_INVALID_FALLBACK') {
        setCurrentErrorMessageForChatList(`"${activeFilterDetails.title}" couldn't be loaded directly. Showing matching chats from 'All Chats'. Some older chats might not appear until 'All Chats' is loaded further.`);
        const masterCacheIsEmptyOrStale = !cachedEntryForAllChats || (cachedEntryForAllChats.folders.length === 0 && cachedEntryForAllChats.pagination.hasMore);
        const masterCacheIsNotLoading = !cachedEntryForAllChats?.isLoading;

        if (masterCacheIsEmptyOrStale && masterCacheIsNotLoading) {
          fetchAndCacheDialogsForList(ALL_CHATS_FILTER_ID, false); 
          setIsLoadingDisplayedChats(true);
          setDisplayedChats([]);
          return;
        }

        if (cachedEntryForAllChats) {
            const includePeerKeys = new Set((activeFilterDetails.include_peers || []).map(peerToKey).filter(Boolean) as string[]);
            const pinnedPeerKeys = new Set((activeFilterDetails.pinned_peers || []).map(peerToKey).filter(Boolean) as string[]);

            const filtered = (cachedEntryForAllChats.folders || []).filter(chat => {
                const chatKey = peerToKey(chat.inputPeer);
                return chatKey && (includePeerKeys.has(chatKey) || pinnedPeerKeys.has(chatKey));
            });
            const pinned = filtered.filter(chat => { const key = peerToKey(chat.inputPeer); return key && pinnedPeerKeys.has(key); })
                                 .sort((a,b) => (activeFilterDetails.pinned_peers?.findIndex(p => peerToKey(p) === peerToKey(a.inputPeer)) ?? 0) -
                                                 (activeFilterDetails.pinned_peers?.findIndex(p => peerToKey(p) === peerToKey(b.inputPeer)) ?? 0));
            const nonPinned = filtered.filter(chat => { const key = peerToKey(chat.inputPeer); return key && includePeerKeys.has(key) && !pinnedPeerKeys.has(key); });
            setDisplayedChats([...pinned, ...nonPinned]);
            setHasMoreDisplayedChats(cachedEntryForAllChats.pagination.hasMore); 
            setIsLoadingDisplayedChats(cachedEntryForAllChats.isLoading);
        } else {
            setDisplayedChats([]);
            setHasMoreDisplayedChats(initialPaginationStateForCache.hasMore);
            setIsLoadingDisplayedChats(true);
        }
      } else if (cachedEntryForCurrentFilter) { 
        setDisplayedChats(cachedEntryForCurrentFilter.folders);
        setHasMoreDisplayedChats(cachedEntryForCurrentFilter.pagination.hasMore);
        if (cachedEntryForCurrentFilter.error && cachedEntryForCurrentFilter.error !== 'FOLDER_ID_INVALID_FALLBACK') {
          setCurrentErrorMessageForChatList(`Error for "${activeFilterDetails.title}": ${cachedEntryForCurrentFilter.error}`);
        }
        setIsLoadingDisplayedChats(cachedEntryForCurrentFilter.isLoading);
      } else { 
         setDisplayedChats([]);
         setHasMoreDisplayedChats(initialPaginationStateForCache.hasMore);
         setIsLoadingDisplayedChats(true);
      }
    } else if (filterType === 'dialogFilterChatlist') { 
        setCurrentErrorMessageForChatList(null);
        const masterCacheIsEmptyOrStale = !cachedEntryForAllChats || (cachedEntryForAllChats.folders.length === 0 && cachedEntryForAllChats.pagination.hasMore);
        const masterCacheIsNotLoading = !cachedEntryForAllChats?.isLoading;

        if (masterCacheIsEmptyOrStale && masterCacheIsNotLoading) {
          fetchAndCacheDialogsForList(ALL_CHATS_FILTER_ID, false); 
          setIsLoadingDisplayedChats(true);
          setDisplayedChats([]);
          return;
        }

      if (cachedEntryForAllChats) {
          const includePeerKeys = new Set((activeFilterDetails.include_peers || []).map(peerToKey).filter(Boolean) as string[]);
          const pinnedPeerKeys = new Set((activeFilterDetails.pinned_peers || []).map(peerToKey).filter(Boolean) as string[]);
          const filtered = (cachedEntryForAllChats.folders || []).filter(chat => {
              const chatKey = peerToKey(chat.inputPeer);
              return chatKey && (includePeerKeys.has(chatKey) || pinnedPeerKeys.has(chatKey));
          });
          const pinned = filtered.filter(chat => { const key = peerToKey(chat.inputPeer); return key && pinnedPeerKeys.has(key); })
                               .sort((a,b) => (activeFilterDetails.pinned_peers?.findIndex(p => peerToKey(p) === peerToKey(a.inputPeer)) ?? 0) -
                                               (activeFilterDetails.pinned_peers?.findIndex(p => peerToKey(p) === peerToKey(b.inputPeer)) ?? 0));
          const nonPinned = filtered.filter(chat => { const key = peerToKey(chat.inputPeer); return key && includePeerKeys.has(key) && !pinnedPeerKeys.has(key); });
          setDisplayedChats([...pinned, ...nonPinned]);
          setHasMoreDisplayedChats(cachedEntryForAllChats.pagination.hasMore);
          setIsLoadingDisplayedChats(cachedEntryForAllChats.isLoading);
      } else {
          setDisplayedChats([]);
          setHasMoreDisplayedChats(initialPaginationStateForCache.hasMore);
          setIsLoadingDisplayedChats(true);
      }
    }
  }, [
      isConnectedInternal, activeFilterDetails, chatDataCache, peerToKey,
      lastFetchedFilterIdForChatList, fetchAndCacheDialogsForList
  ]);

  const loadMoreDisplayedChatsInManager = useCallback(async () => {
    if (!activeFilterDetails || isLoadingDisplayedChats) return;

    const filterType = activeFilterDetails._;
    const currentFilterId = activeFilterDetails.id;
    const cachedEntry = chatDataCache.get(currentFilterId); 
    const masterCacheEntry = chatDataCache.get(ALL_CHATS_FILTER_ID); 

    if (filterType === 'dialogFilterDefault') {
        if (masterCacheEntry?.pagination.hasMore && !masterCacheEntry.isLoading) {
            fetchDataForActiveFilterWrapper(true); 
        }
    } else if (filterType === 'dialogFilter') {
      if (cachedEntry?.error === 'FOLDER_ID_INVALID_FALLBACK') { 
        if (masterCacheEntry?.pagination.hasMore && !masterCacheEntry.isLoading) {
          fetchAndCacheDialogsForList(ALL_CHATS_FILTER_ID, true);
        }
      } else if (cachedEntry?.pagination.hasMore && !cachedEntry.isLoading) { 
        fetchDataForActiveFilterWrapper(true);
      }
    } else if (filterType === 'dialogFilterChatlist') { 
      if (masterCacheEntry?.pagination.hasMore && !masterCacheEntry.isLoading) {
        fetchAndCacheDialogsForList(ALL_CHATS_FILTER_ID, true);
      }
    }
  }, [activeFilterDetails, isLoadingDisplayedChats, chatDataCache, fetchDataForActiveFilterWrapper, fetchAndCacheDialogsForList]);

  const resetAllChatListData = useCallback(() => {
    setChatDataCache(new Map());
    setMasterChatListForFiltering([]);
    setMasterChatListPaginationForFiltering(initialPaginationStateForCache);
    setDisplayedChats([]);
    setIsLoadingDisplayedChats(false);
    setHasMoreDisplayedChats(true);
    setCurrentErrorMessageForChatList(null);
    setLastFetchedFilterIdForChatList(null);
  }, []);

  const setChatsDataCacheForFilterManager = useCallback((filterId: number, data: { folders: CloudFolder[], pagination: GetChatsPaginatedResponse, isLoading: boolean, error?: string | null }) => {
    setChatDataCache(prev => new Map(prev).set(filterId, data));
  }, []);

  const resetMasterChatListForFilteringInCacheManager = useCallback(() => {
    setMasterChatListForFiltering([]);
    setMasterChatListPaginationForFiltering(initialPaginationStateForCache);
    if (chatDataCache.has(ALL_CHATS_FILTER_ID)) {
        setChatDataCache(prev => {
            const newCache = new Map(prev);
            newCache.set(ALL_CHATS_FILTER_ID, {
                folders: [],
                pagination: initialPaginationStateForCache,
                isLoading: false, 
                error: null,
            });
            return newCache;
        });
    }
  }, [chatDataCache]);

  const updateMasterChatListInCacheManager = useCallback((folders: CloudFolder[], pagination: GetChatsPaginatedResponse) => {
    setMasterChatListForFiltering(folders);
    setMasterChatListPaginationForFiltering(pagination);
  }, []);

  const getChatDataCacheEntryManager = useCallback((cacheKey: number) => {
    return chatDataCache.get(cacheKey);
  }, [chatDataCache]);


  return {
    displayedChats,
    isLoadingDisplayedChats,
    hasMoreDisplayedChats,
    currentErrorMessageForChatList,
    loadMoreDisplayedChatsInManager,
    resetAllChatListData,
    fetchAndCacheDialogsForList,
    setChatsDataCacheForFilter: setChatsDataCacheForFilterManager,
    resetMasterChatListForFilteringInCache: resetMasterChatListForFilteringInCacheManager,
    updateMasterChatListInCache: updateMasterChatListInCacheManager,
    getChatDataCacheEntry: getChatDataCacheEntryManager,
    setLastFetchedFilterIdForChatList, 
    cachedDataForActiveFilterIsLoading: (activeFilter: DialogFilter | null): boolean => {
        if (!activeFilter) return false;
        const filterId = activeFilter.id;
        const filterType = activeFilter._;

        if (filterType === 'dialogFilterDefault') {
            return chatDataCache.get(ALL_CHATS_FILTER_ID)?.isLoading || false;
        }
        const cachedEntry = chatDataCache.get(filterId);
        if (filterType === 'dialogFilter' && cachedEntry?.error === 'FOLDER_ID_INVALID_FALLBACK') {
            return chatDataCache.get(ALL_CHATS_FILTER_ID)?.isLoading || false;
        }
        if (filterType === 'dialogFilterChatlist') {
            return chatDataCache.get(ALL_CHATS_FILTER_ID)?.isLoading || false;
        }
        return cachedEntry?.isLoading || false;
    },
    setIsConnected, // Expose setter
  };
}

    