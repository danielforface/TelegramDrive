
"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { Header } from "@/components/layout/header";
import { TelegramConnect } from "@/components/telegram-connect";
import { MainContentView } from "@/components/main-content-view/main-content-view";
import { FileDetailsPanel } from "@/components/file-details-panel";
import { ImageViewer } from "@/components/image-viewer";
import { VideoPlayer } from "@/components/video-player";
import { DownloadManagerDialog } from "@/components/download-manager-dialog";
import { ChatSelectionDialog } from "@/components/chat-selection-dialog";
import { UploadDialog } from "@/components/upload-dialog";
import type { CloudFolder, CloudFile, DownloadQueueItemType, ExtendedFile, DialogFilter } from "@/types";
import { Button } from "@/components/ui/button";
import { RefreshCw, Loader2, LayoutPanelLeft, MessageSquare, UploadCloud } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import * as telegramService from "@/services/telegramService";

const INITIAL_MASTER_CHATS_LOAD_LIMIT = 30;
const SUBSEQUENT_MASTER_CHATS_LOAD_LIMIT = 20;
const INITIAL_SPECIFIC_FOLDER_CHATS_LOAD_LIMIT = 20;
const SUBSEQUENT_SPECIFIC_FOLDER_CHATS_LOAD_LIMIT = 10;

const INITIAL_MEDIA_LOAD_LIMIT = 20;
const SUBSEQUENT_MEDIA_LOAD_LIMIT = 20;
const DOWNLOAD_CHUNK_SIZE = 512 * 1024; // 512KB
const KB_1 = 1024;
const ONE_MB = 1024 * 1024;
const ALL_CHATS_FILTER_ID = 0;

type AuthStep = 'initial' | 'awaiting_code' | 'awaiting_password';

interface PaginationState {
  offsetDate: number;
  offsetId: number;
  offsetPeer: any;
  hasMore: boolean;
}

const initialPaginationState: PaginationState = {
  offsetDate: 0,
  offsetId: 0,
  offsetPeer: { _: 'inputPeerEmpty' },
  hasMore: true,
};

interface CachedFolderData {
  folders: CloudFolder[];
  pagination: PaginationState;
  isLoading: boolean;
  error?: string | null;
}

export default function Home() {
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);

  const [dialogFilters, setDialogFilters] = useState<DialogFilter[]>([]);
  const [activeDialogFilterId, setActiveDialogFilterId] = useState<number>(ALL_CHATS_FILTER_ID);
  const [activeFilterDetails, setActiveFilterDetails] = useState<DialogFilter | null>(null);
  const [isLoadingDialogFilters, setIsLoadingDialogFilters] = useState(true);
  const [hasFetchedDialogFiltersOnce, setHasFetchedDialogFiltersOnce] = useState(false);
  const [isReorderingFolders, setIsReorderingFolders] = useState(false);
  
  const [chatDataCache, setChatDataCache] = useState<Map<number, CachedFolderData>>(new Map());
  
  // Specific state for the "All Chats" list, used as a base for client-side filtering
  const [masterChatListForFiltering, setMasterChatListForFiltering] = useState<CloudFolder[]>([]);
  const [masterChatListPaginationForFiltering, setMasterChatListPaginationForFiltering] = useState<PaginationState>(initialPaginationState);

  const [displayedChats, setDisplayedChats] = useState<CloudFolder[]>([]);
  const [isLoadingDisplayedChats, setIsLoadingDisplayedChats] = useState(false);
  const [hasMoreDisplayedChats, setHasMoreDisplayedChats] = useState(true);
  const [currentErrorMessage, setCurrentErrorMessage] = useState<string | null>(null);

  const [selectedFolder, setSelectedFolder] = useState<CloudFolder | null>(null);
  const [currentChatMedia, setCurrentChatMedia] = useState<CloudFile[]>([]);
  const [isLoadingChatMedia, setIsLoadingChatMedia] = useState(false);
  const [hasMoreChatMedia, setHasMoreChatMedia] = useState(true);
  const [currentMediaOffsetId, setCurrentMediaOffsetId] = useState<number>(0);

  const [selectedFileForDetails, setSelectedFileForDetails] = useState<CloudFile | null>(null);
  const [isDetailsPanelOpen, setIsDetailsPanelOpen] = useState(false);

  const [isImageViewerOpen, setIsImageViewerOpen] = useState(false);
  const [viewingImageUrl, setViewingImageUrl] = useState<string | null>(null);
  const [viewingImageName, setViewingImageName] = useState<string | undefined>(undefined);

  const [isVideoPlayerOpen, setIsVideoPlayerOpen] = useState(false);
  const [playingVideoUrl, setPlayingVideoUrl] = useState<string | null>(null);
  const [playingVideoName, setPlayingVideoName] = useState<string | undefined>(undefined);
  const [isPreparingVideoStream, setIsPreparingVideoStream] = useState(false);
  const [videoStreamUrl, setVideoStreamUrl] = useState<string | null>(null);
  const [preparingVideoStreamForFileId, setPreparingVideoStreamForFileId] = useState<string | null>(null);
  const videoStreamAbortControllerRef = useRef<AbortController | null>(null);

  const [isDownloadManagerOpen, setIsDownloadManagerOpen] = useState(false);
  const [downloadQueue, setDownloadQueue] = useState<DownloadQueueItemType[]>([]);
  const activeDownloadsRef = useRef<Set<string>>(new Set());
  const downloadQueueRef = useRef<DownloadQueueItemType[]>([]);
  const browserDownloadTriggeredRef = useRef(new Set<string>());

  const [isChatSelectionDialogOpen, setIsChatSelectionDialogOpen] = useState(false);

  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
  const [filesToUpload, setFilesToUpload] = useState<ExtendedFile[]>([]);
  const [isUploadingFiles, setIsUploadingFiles] = useState(false);
  const uploadAbortControllersRef = useRef<Map<string, AbortController>>(new Map());

  const headerRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    downloadQueueRef.current = downloadQueue;
  }, [downloadQueue]);

  const { toast } = useToast();

  const [authStep, setAuthStep] = useState<AuthStep>('initial');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [phoneCode, setPhoneCode] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);


  const peerToKey = useCallback((peer: any): string | null => {
    if (!peer) return null;
    if (peer._ === 'inputPeerUser') return `user:${String(peer.user_id)}`;
    if (peer._ === 'inputPeerChat') return `chat:${String(peer.chat_id)}`;
    if (peer._ === 'inputPeerChannel') return `channel:${String(peer.channel_id)}`;
    return null;
  }, []);


  const handleReset = useCallback(async (performServerLogout = true) => {
    const currentIsConnected = isConnected;

    if (performServerLogout && currentIsConnected) {
        toast({ title: "Disconnecting...", description: "Logging out from Telegram." });
        try {
            await telegramService.signOut();
            toast({ title: "Disconnected", description: "Successfully signed out." });
        } catch (error: any) {
            if(!(error.message && error.message.includes('AUTH_KEY_UNREGISTERED'))){
                 toast({ title: "Disconnection Error", description: error.message || "Could not sign out properly from server.", variant: "destructive" });
            }
        }
    }

    setIsConnected(false);
    setDisplayedChats([]);
    setSelectedFolder(null);
    setCurrentChatMedia([]);
    setIsConnecting(false);
    setAuthStep('initial');
    setPhoneNumber('');
    setPhoneCode('');
    setPassword('');
    setAuthError(null);
    
    setChatDataCache(new Map());
    setMasterChatListForFiltering([]);
    setMasterChatListPaginationForFiltering(initialPaginationState);
    setIsLoadingDisplayedChats(false);
    setHasMoreDisplayedChats(true);
    setCurrentErrorMessage(null);

    setIsLoadingChatMedia(false);
    setHasMoreChatMedia(true);
    setCurrentMediaOffsetId(0);

    const defaultFilters: DialogFilter[] = [{ _:'dialogFilterDefault', id: ALL_CHATS_FILTER_ID, title: "All Chats", flags:0, pinned_peers: [], include_peers: [], exclude_peers: [] }];
    setDialogFilters(defaultFilters);
    setActiveDialogFilterId(ALL_CHATS_FILTER_ID);
    setActiveFilterDetails(defaultFilters[0]);
    setIsLoadingDialogFilters(true); 
    setHasFetchedDialogFiltersOnce(false);


    downloadQueueRef.current.forEach(item => {
      if (item.abortController && !item.abortController.signal.aborted) {
        item.abortController.abort("User reset application state");
      }
    });
    setDownloadQueue([]);
    activeDownloadsRef.current.clear();
    browserDownloadTriggeredRef.current.clear();

    if (videoStreamAbortControllerRef.current && !videoStreamAbortControllerRef.current.signal.aborted) {
        videoStreamAbortControllerRef.current.abort("User reset application state");
    }
    if (videoStreamUrl) {
        URL.revokeObjectURL(videoStreamUrl);
        setVideoStreamUrl(null);
    }
    setPlayingVideoUrl(null);
    setIsPreparingVideoStream(false);
    setPreparingVideoStreamForFileId(null);

    setIsChatSelectionDialogOpen(false);
    setIsUploadDialogOpen(false);
    setFilesToUpload([]);
    uploadAbortControllersRef.current.forEach((controller) => {
      if (!controller.signal.aborted) controller.abort("User reset application state");
    });
    uploadAbortControllersRef.current.clear();
    setIsUploadingFiles(false);
  }, [isConnected, toast, videoStreamUrl]);


  const handleApiError = useCallback((error: any, title: string, defaultMessage: string) => {
    console.error(`${title} (handleApiError):`, error.message, error.originalErrorObject || error);
    let description = error.message || defaultMessage;

    if (error.message && error.message.includes("Invalid hash in mt_dh_gen_ok")) {
      description = "Connection handshake failed. Please check your API ID/Hash in .env.local, ensure it's correct, restart the server, and try clearing your browser's localStorage for this site.";
      setAuthError(description);
      toast({ title: "Connection Handshake Failed", description, variant: "destructive", duration: 10000 });
    } else if (error.message === 'AUTH_RESTART') {
        description = "Authentication process needs to be restarted. Please try entering your phone number again.";
        setAuthError(description);
        toast({ title: "Authentication Restart Needed", description, variant: "destructive" });
        handleReset(false);
    } else {
        setAuthError(description);
        toast({ title, description, variant: "destructive", duration: 5000 });
    }
  }, [toast, handleReset]);


  const fetchDialogFilters = useCallback(async () => {
    if (!isConnected) {
        console.warn("fetchDialogFilters: Skipped, not connected.");
        setIsLoadingDialogFilters(false);
        return;
    }
    console.log("fetchDialogFilters: Called.");
    setIsLoadingDialogFilters(true);
    try {
      const filtersFromServer = await telegramService.getDialogFilters();
      const processedFilters: DialogFilter[] = [];
      let allChatsFilterExists = false;

      if (filtersFromServer && filtersFromServer.length > 0) {
          filtersFromServer.forEach(filter => {
            if (filter._ === 'dialogFilterDefault') {
              processedFilters.push({
                ...filter,
                id: ALL_CHATS_FILTER_ID,
                title: "All Chats",
                pinned_peers: [], include_peers: [], exclude_peers: []
              });
              allChatsFilterExists = true;
            } else if (filter._ === 'dialogFilter' || filter._ === 'dialogFilterChatlist') {
              processedFilters.push({
                ...filter,
                pinned_peers: filter.pinned_peers || [],
                include_peers: filter.include_peers || [],
                exclude_peers: filter.exclude_peers || [],
              });
            }
          });
      }
      if (!allChatsFilterExists && !processedFilters.some(f => f.id === ALL_CHATS_FILTER_ID)) {
        processedFilters.unshift({ _:'dialogFilterDefault', id: ALL_CHATS_FILTER_ID, title: "All Chats", flags:0, pinned_peers: [], include_peers: [], exclude_peers: [] });
      }
      processedFilters.sort((a, b) => a.id === ALL_CHATS_FILTER_ID ? -1 : b.id === ALL_CHATS_FILTER_ID ? 1 : 0);

      setDialogFilters(processedFilters);
      setHasFetchedDialogFiltersOnce(true);
      const currentActiveStillExists = processedFilters.some(f => f.id === activeDialogFilterId);
      if (!currentActiveStillExists) {
        setActiveDialogFilterId(ALL_CHATS_FILTER_ID);
      }
    } catch (error: any) {
      handleApiError(error, "Error Fetching Folders", "Could not load your chat folders.");
      const defaultFiltersOnError: DialogFilter[] = [{ _:'dialogFilterDefault', id: ALL_CHATS_FILTER_ID, title: "All Chats", flags:0, pinned_peers: [], include_peers: [], exclude_peers: [] }];
      setDialogFilters(defaultFiltersOnError);
      setActiveDialogFilterId(ALL_CHATS_FILTER_ID);
    } finally {
      setIsLoadingDialogFilters(false);
    }
  }, [isConnected, handleApiError, activeDialogFilterId]);


  // Effect to set activeFilterDetails when activeDialogFilterId or dialogFilters change
  useEffect(() => {
    const newFilter = dialogFilters.find(f => f.id === activeDialogFilterId) ||
                      dialogFilters.find(f => f.id === ALL_CHATS_FILTER_ID) ||
                      (dialogFilters.length > 0 ? dialogFilters[0] : null);

    if (newFilter) {
      if (activeFilterDetails?.id !== newFilter.id || activeFilterDetails?._ !== newFilter._) {
        console.log(`Setting activeFilterDetails: ID ${newFilter.id}, Title: '${newFilter.title}', Type: ${newFilter._}`);
        setActiveFilterDetails(newFilter);
        setSelectedFolder(null); // Reset selected chat when filter tab changes
        setCurrentChatMedia([]); // Reset media for selected chat
        setCurrentErrorMessage(null); // Clear any errors from previous filter
      }
    } else if (activeFilterDetails !== null) {
      console.log(`Clearing activeFilterDetails, no filter found for ID ${activeDialogFilterId}`);
      setActiveFilterDetails(null);
    }
  }, [activeDialogFilterId, dialogFilters]);


  const fetchAndCacheDialogs = useCallback(async (
    cacheKeyToFetch: number,
    isLoadingMore: boolean,
    folderIdForApiCall?: number // If undefined, fetches all chats (for ALL_CHATS_FILTER_ID)
  ) => {
    const existingCacheEntry = chatDataCache.get(cacheKeyToFetch);
    if (existingCacheEntry?.isLoading) {
      console.log(`fetchAndCacheDialogs: Already loading for cacheKey ${cacheKeyToFetch}. Skipping.`);
      return;
    }

    const currentPagination = isLoadingMore 
      ? (existingCacheEntry?.pagination || initialPaginationState)
      : initialPaginationState;

    setChatDataCache(prev => new Map(prev).set(cacheKeyToFetch, {
      folders: isLoadingMore ? (existingCacheEntry?.folders || []) : [],
      pagination: currentPagination,
      isLoading: true,
      error: null,
    }));

    // If this fetch is for the master list, update its specific loading state for UI responsiveness
    if (cacheKeyToFetch === ALL_CHATS_FILTER_ID) {
        setIsLoadingDisplayedChats(true); 
    } else if (activeFilterDetails?.id === cacheKeyToFetch) {
        setIsLoadingDisplayedChats(true);
    }


    const limit = isLoadingMore 
        ? (folderIdForApiCall === undefined ? SUBSEQUENT_MASTER_CHATS_LOAD_LIMIT : SUBSEQUENT_SPECIFIC_FOLDER_CHATS_LOAD_LIMIT)
        : (folderIdForApiCall === undefined ? INITIAL_MASTER_CHATS_LOAD_LIMIT : INITIAL_SPECIFIC_FOLDER_CHATS_LOAD_LIMIT);

    try {
      const response = await telegramService.getTelegramChats(
        limit,
        currentPagination.offsetDate,
        currentPagination.offsetId,
        currentPagination.offsetPeer,
        folderIdForApiCall 
      );

      setChatDataCache(prev => {
        const updatedCache = new Map(prev);
        const prevEntry = updatedCache.get(cacheKeyToFetch);
        updatedCache.set(cacheKeyToFetch, {
          folders: isLoadingMore ? [...(prevEntry?.folders || []), ...response.folders] : response.folders,
          pagination: {
            offsetDate: response.nextOffsetDate,
            offsetId: response.nextOffsetId,
            offsetPeer: response.nextOffsetPeer,
            hasMore: response.hasMore,
          },
          isLoading: false,
          error: null,
        });
        return updatedCache;
      });

      if (cacheKeyToFetch === ALL_CHATS_FILTER_ID) {
        setMasterChatListForFiltering(prev => isLoadingMore ? [...prev, ...response.folders] : response.folders);
        setMasterChatListPaginationForFiltering({
            offsetDate: response.nextOffsetDate,
            offsetId: response.nextOffsetId,
            offsetPeer: response.nextOffsetPeer,
            hasMore: response.hasMore,
        });
      }
       if (response.folders.length > 0) {
            toast({ title: `${isLoadingMore ? "More" : ""} Chats Loaded!`, description: `Loaded ${response.folders.length} chats for ${activeFilterDetails?.title || 'target folder'}.` });
       } else if (!response.hasMore && !isLoadingMore){
            toast({ title: "No Chats Found", description: `Chat list for "${activeFilterDetails?.title || 'target folder'}" appears to be empty.`, variant: "default" });
       }


    } catch (error: any) {
      let errorMsg = error.message || "Failed to load chats.";
      if (error.message?.includes('FOLDER_ID_INVALID') && folderIdForApiCall !== undefined) {
        errorMsg = `Folder (ID: ${folderIdForApiCall}) is invalid or not directly loadable.`;
      }
      
      setChatDataCache(prev => new Map(prev).set(cacheKeyToFetch, {
        folders: [],
        pagination: { ...initialPaginationState, hasMore: false },
        isLoading: false,
        error: errorMsg,
      }));
      if (cacheKeyToFetch === ALL_CHATS_FILTER_ID) {
        setMasterChatListForFiltering([]);
        setMasterChatListPaginationForFiltering({ ...initialPaginationState, hasMore: false });
      }
      handleApiError(error, `Error loading chats for ${activeFilterDetails?.title || `cache key ${cacheKeyToFetch}`}`, errorMsg);
    }
  }, [chatDataCache, activeFilterDetails, handleApiError, toast, masterChatListForFiltering]); // Added masterChatListForFiltering

  // Orchestrator useEffect: Decides what to display or fetch based on activeFilterDetails and cache
  useEffect(() => {
    if (!isConnected || isLoadingDialogFilters || !activeFilterDetails) {
      if (!isConnected || isLoadingDialogFilters) {
        setDisplayedChats([]);
        setIsLoadingDisplayedChats(isLoadingDialogFilters || isConnecting);
      }
      return;
    }

    const currentFilterId = activeFilterDetails.id;
    const filterType = activeFilterDetails._;
    const cachedEntry = chatDataCache.get(currentFilterId);

    setCurrentErrorMessage(null); 

    if (filterType === 'dialogFilterDefault' || filterType === 'dialogFilter') {
      const apiFolderId = filterType === 'dialogFilterDefault' ? undefined : currentFilterId;
      
      if (cachedEntry && !cachedEntry.isLoading) {
        setDisplayedChats(cachedEntry.folders);
        setHasMoreDisplayedChats(cachedEntry.pagination.hasMore);
        setIsLoadingDisplayedChats(false);
        if (cachedEntry.error) {
          setCurrentErrorMessage(`Error for "${activeFilterDetails.title}": ${cachedEntry.error}`);
          toast({ title: `Error: ${activeFilterDetails.title}`, description: cachedEntry.error, variant: "destructive"});
        }
      } else if (!cachedEntry?.isLoading) {
        setDisplayedChats([]);
        setIsLoadingDisplayedChats(true);
        setHasMoreDisplayedChats(true); // Assume has more until fetch result
        fetchAndCacheDialogs(currentFilterId, false, apiFolderId);
      } else { // Is currently loading
        setIsLoadingDisplayedChats(true);
      }
    } else if (filterType === 'dialogFilterChatlist') {
      const masterCacheEntry = chatDataCache.get(ALL_CHATS_FILTER_ID);
      const masterListCurrentlyLoading = masterCacheEntry?.isLoading || false;
      const masterListNeedsInitialFetch = 
        (!masterCacheEntry || masterChatListForFiltering.length === 0) && 
        masterChatListPaginationForFiltering.hasMore && 
        !masterListCurrentlyLoading;

      if (masterListNeedsInitialFetch) {
        setDisplayedChats([]);
        setIsLoadingDisplayedChats(true);
        setHasMoreDisplayedChats(true); // Assume has more until master list loads
        fetchAndCacheDialogs(ALL_CHATS_FILTER_ID, false);
      } else if (masterChatListForFiltering.length > 0 || (masterCacheEntry && !masterListCurrentlyLoading && !masterChatListPaginationForFiltering.hasMore)) {
        // Master list has data, or has finished loading (even if empty and no more)
        const includePeerKeys = new Set((activeFilterDetails.include_peers || []).map(peerToKey).filter(Boolean));
        const pinnedPeerKeys = new Set((activeFilterDetails.pinned_peers || []).map(peerToKey).filter(Boolean));
        
        const filteredMaster = masterChatListForFiltering.filter(chat => {
            const chatPeerKey = peerToKey(chat.inputPeer);
            return chatPeerKey && (includePeerKeys.has(chatPeerKey) || pinnedPeerKeys.has(chatPeerKey));
        });
        
        const pinnedChats = filteredMaster.filter(chat => {
            const chatPeerKey = peerToKey(chat.inputPeer);
            return chatPeerKey && pinnedPeerKeys.has(chatPeerKey);
        }).sort((a,b) => (activeFilterDetails.pinned_peers?.findIndex(p => peerToKey(p) === peerToKey(a.inputPeer)) ?? 0) - 
                        (activeFilterDetails.pinned_peers?.findIndex(p => peerToKey(p) === peerToKey(b.inputPeer)) ?? 0));

        const nonPinnedChats = filteredMaster.filter(chat => {
            const chatPeerKey = peerToKey(chat.inputPeer);
            return chatPeerKey && includePeerKeys.has(chatPeerKey) && !pinnedPeerKeys.has(chatPeerKey);
        });

        const finalFilteredList = [...pinnedChats, ...nonPinnedChats];
        setDisplayedChats(finalFilteredList);
        setHasMoreDisplayedChats(masterChatListPaginationForFiltering.hasMore);
        setIsLoadingDisplayedChats(masterListCurrentlyLoading);

        if (finalFilteredList.length === 0 && !masterChatListPaginationForFiltering.hasMore && !masterListCurrentlyLoading) {
          toast({ title: `No matching chats for "${activeFilterDetails.title}"`, description: "Ensure 'All Chats' is fully loaded or folder settings are correct.", variant: "default" });
        }
      } else { // Master list is currently loading
        setIsLoadingDisplayedChats(true);
      }
    }
  }, [
    isConnected, 
    isLoadingDialogFilters, 
    activeFilterDetails, 
    chatDataCache, // This is crucial: re-run when any cache entry changes
    masterChatListForFiltering, // Re-run if the master list itself changes
    masterChatListPaginationForFiltering.hasMore, // Re-run if master list's ability to load more changes
    fetchAndCacheDialogs, 
    toast,
    peerToKey,
    isConnecting
  ]);


  const loadMoreDisplayedChats = useCallback(async () => {
    if (!activeFilterDetails || isLoadingDisplayedChats) return;

    const filterType = activeFilterDetails._;
    const currentFilterId = activeFilterDetails.id;

    if (filterType === 'dialogFilterDefault' || filterType === 'dialogFilter') {
      const cachedData = chatDataCache.get(currentFilterId);
      if (cachedData?.pagination.hasMore && !cachedData.isLoading) {
        const apiFolderId = filterType === 'dialogFilterDefault' ? undefined : currentFilterId;
        fetchAndCacheDialogs(currentFilterId, true, apiFolderId);
      }
    } else if (filterType === 'dialogFilterChatlist') {
      if (masterChatListPaginationForFiltering.hasMore && !chatDataCache.get(ALL_CHATS_FILTER_ID)?.isLoading) {
        fetchAndCacheDialogs(ALL_CHATS_FILTER_ID, true);
      }
    }
  }, [activeFilterDetails, isLoadingDisplayedChats, chatDataCache, masterChatListPaginationForFiltering.hasMore, fetchAndCacheDialogs]);


  const checkExistingConnection = useCallback(async () => {
    setIsLoadingDialogFilters(true); 
    try {
      const previouslyConnected = await telegramService.isUserConnected();
      if (previouslyConnected) {
        const storedUser = telegramService.getUserSessionDetails();
        if (storedUser && storedUser.phone) setPhoneNumber(storedUser.phone);
        setIsConnected(true);
        setAuthStep('initial');
        setAuthError(null);
        if (!hasFetchedDialogFiltersOnce) { // Fetch filters only if not done once in this session
            await fetchDialogFilters();
        } else {
             setIsLoadingDialogFilters(false);
        }
      } else {
        setIsConnected(false);
        setPhoneNumber('');
        setAuthStep('initial');
        setAuthError(null);
        handleReset(false);
        setHasFetchedDialogFiltersOnce(false);
        setIsLoadingDialogFilters(false);
      }
    } catch (error: any) {
      const errorMessage = error.message || (error.originalErrorObject?.error_message);
      if (errorMessage?.includes("Invalid hash in mt_dh_gen_ok")) {
        toast({
          title: "Connection Handshake Failed",
          description: "Could not establish a secure connection. Verify API ID/Hash. Try clearing localStorage & restarting server.",
          variant: "destructive", duration: 10000,
        });
        setAuthError("Connection handshake failed. Check API credentials & localStorage.");
      } else if (errorMessage === 'AUTH_RESTART') {
          handleApiError(error, "Authentication Expired", "Your session needs to be re-initiated.");
      } else {
         handleApiError(error, "Connection Check Error", `Failed to verify existing connection. ${errorMessage}`);
      }
      setIsConnected(false);
      const defaultFiltersOnError: DialogFilter[] = [{ _:'dialogFilterDefault', id: ALL_CHATS_FILTER_ID, title: "All Chats", flags:0, pinned_peers: [], include_peers: [], exclude_peers: [] }];
      setDialogFilters(defaultFiltersOnError);
      setActiveDialogFilterId(ALL_CHATS_FILTER_ID);
      setActiveFilterDetails(defaultFiltersOnError[0]);
      setHasFetchedDialogFiltersOnce(false);
      setIsLoadingDialogFilters(false);
    }
  }, [toast, handleApiError, fetchDialogFilters, hasFetchedDialogFiltersOnce, handleReset]);


  useEffect(() => {
    checkExistingConnection();
  }, [checkExistingConnection]);


  useEffect(() => {
    const processQueue = async () => {
      for (let i = 0; i < downloadQueueRef.current.length; i++) {
        const itemInLoop = downloadQueueRef.current[i];
        if (!itemInLoop) continue;

        const currentItemFromState = downloadQueueRef.current.find(q => q.id === itemInLoop.id);

        if (!currentItemFromState) {
            if(activeDownloadsRef.current.has(itemInLoop.id)) {
                activeDownloadsRef.current.delete(itemInLoop.id);
            }
            continue;
        }
        const upToDateItem = currentItemFromState;

        if (upToDateItem.abortController?.signal.aborted && upToDateItem.status !== 'cancelled' && upToDateItem.status !== 'failed' && upToDateItem.status !== 'completed') {
             setDownloadQueue(prevQ => prevQ.map(q => q.id === upToDateItem.id ? { ...q, status: 'cancelled', progress: 0, downloadedBytes: 0, error_message: "Aborted by user or system." } : q));
             if(activeDownloadsRef.current.has(upToDateItem.id)) {
                activeDownloadsRef.current.delete(upToDateItem.id);
             }
             continue;
        }

        if (upToDateItem.status === 'downloading' &&
            upToDateItem.location &&
            upToDateItem.totalSizeInBytes &&
            upToDateItem.downloadedBytes < upToDateItem.totalSizeInBytes &&
            !activeDownloadsRef.current.has(upToDateItem.id)
            ) {

          activeDownloadsRef.current.add(upToDateItem.id);

          try {
            if (upToDateItem.abortController?.signal.aborted) {
                activeDownloadsRef.current.delete(upToDateItem.id);
                if(upToDateItem.status !== 'cancelled') setDownloadQueue(prevQ => prevQ.map(q => q.id === upToDateItem.id ? { ...q, status: 'cancelled', error_message: "Aborted" } : q));
                continue;
            }

            let actualLimitForApi: number;
            let chunkResponse: telegramService.FileChunkResponse;

            if (upToDateItem.cdnFileToken && upToDateItem.cdnDcId && upToDateItem.cdnFileHashes && upToDateItem.cdnEncryptionKey && upToDateItem.cdnEncryptionIv) {
                const currentHashBlockIndex = upToDateItem.cdnCurrentFileHashIndex || 0;
                if (currentHashBlockIndex >= upToDateItem.cdnFileHashes.length) {
                    if (upToDateItem.downloadedBytes >= upToDateItem.totalSizeInBytes) {
                        if (!browserDownloadTriggeredRef.current.has(upToDateItem.id) && upToDateItem.chunks && upToDateItem.chunks.length > 0) {
                            browserDownloadTriggeredRef.current.add(upToDateItem.id);
                            const fullFileBlob = new Blob(upToDateItem.chunks, { type: upToDateItem.telegramMessage?.mime_type || 'application/octet-stream' });
                            const url = URL.createObjectURL(fullFileBlob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = upToDateItem.name;
                            document.body.appendChild(a);
                            a.click();
                            document.body.removeChild(a);
                            URL.revokeObjectURL(url);
                        }
                        setDownloadQueue(prevQ => prevQ.map(q => q.id === upToDateItem.id ? { ...q, status: 'completed', progress: 100, downloadedBytes: upToDateItem.totalSizeInBytes!, chunks: [] } : q));
                    } else {
                        setDownloadQueue(prevQ => prevQ.map(q => q.id === upToDateItem.id ? { ...q, status: 'failed', error_message: 'CDN blocks exhausted before completion' } : q));
                    }
                    activeDownloadsRef.current.delete(upToDateItem.id);
                    continue;
                }
                const cdnBlock = upToDateItem.cdnFileHashes[currentHashBlockIndex];
                actualLimitForApi = cdnBlock.limit;

                chunkResponse = await telegramService.downloadCdnFileChunk(
                    {
                        dc_id: upToDateItem.cdnDcId,
                        file_token: upToDateItem.cdnFileToken,
                        encryption_key: upToDateItem.cdnEncryptionKey,
                        encryption_iv: upToDateItem.cdnEncryptionIv,
                        file_hashes: upToDateItem.cdnFileHashes,
                    },
                    cdnBlock.offset,
                    actualLimitForApi,
                    upToDateItem.abortController?.signal
                );

                if (chunkResponse?.bytes && upToDateItem.cdnFileHashes) {
                    const downloadedHash = await telegramService.calculateSHA256(chunkResponse.bytes);
                    if (!telegramService.areUint8ArraysEqual(downloadedHash, cdnBlock.hash)) {
                        console.error(`CDN Hash Mismatch for ${upToDateItem.name}, block index ${currentHashBlockIndex}. Expected:`, cdnBlock.hash, "Got:", downloadedHash);
                        setDownloadQueue(prevQ => prevQ.map(q => q.id === upToDateItem.id ? { ...q, status: 'failed', error_message: 'CDN Hash Mismatch' } : q));
                        activeDownloadsRef.current.delete(upToDateItem.id);
                        continue;
                    }
                }

            } else {
                const bytesNeededForFileDirect = upToDateItem.totalSizeInBytes - upToDateItem.downloadedBytes;
                const offsetWithinCurrentBlockDirect = upToDateItem.currentOffset % ONE_MB;
                const bytesLeftInCurrentBlockDirect = ONE_MB - offsetWithinCurrentBlockDirect;

                let idealRequestSizeDirect = Math.min(bytesLeftInCurrentBlockDirect, DOWNLOAD_CHUNK_SIZE, bytesNeededForFileDirect);

                if (bytesNeededForFileDirect <= 0) {
                    actualLimitForApi = 0;
                } else if (idealRequestSizeDirect <= 0) {
                    actualLimitForApi = bytesNeededForFileDirect > 0 ? KB_1 : 0;
                } else if (idealRequestSizeDirect < KB_1) {
                    actualLimitForApi = KB_1;
                } else {
                    actualLimitForApi = Math.floor(idealRequestSizeDirect / KB_1) * KB_1;
                }

                if (actualLimitForApi === 0 && bytesNeededForFileDirect > 0 && idealRequestSizeDirect > 0) {
                    actualLimitForApi = KB_1;
                }

                if (actualLimitForApi <= 0) {
                   if (upToDateItem.downloadedBytes >= upToDateItem.totalSizeInBytes) {
                        if (!browserDownloadTriggeredRef.current.has(upToDateItem.id) && upToDateItem.chunks && upToDateItem.chunks.length > 0) {
                            browserDownloadTriggeredRef.current.add(upToDateItem.id);
                            const fullFileBlob = new Blob(upToDateItem.chunks, { type: upToDateItem.telegramMessage?.mime_type || 'application/octet-stream' });
                            const url = URL.createObjectURL(fullFileBlob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = upToDateItem.name;
                            document.body.appendChild(a);
                            a.click();
                            document.body.removeChild(a);
                            URL.revokeObjectURL(url);
                        }
                       setDownloadQueue(prevQ => prevQ.map(q => q.id === upToDateItem.id ? { ...q, status: 'completed', progress: 100, downloadedBytes: upToDateItem.totalSizeInBytes!, currentOffset: upToDateItem.totalSizeInBytes!, chunks: [] } : q));
                   } else if (bytesNeededForFileDirect > 0) {
                        console.error(`Logic error: actualLimitForApi is ${actualLimitForApi}, but ${bytesNeededForFileDirect} bytes still needed for ${upToDateItem.name}. Ideal: ${idealRequestSizeDirect}`);
                        setDownloadQueue(prevQ => prevQ.map(q => q.id === upToDateItem.id ? { ...q, status: 'failed', error_message: 'Internal limit calculation error' } : q));
                   }
                   activeDownloadsRef.current.delete(upToDateItem.id);
                   continue;
                }

                chunkResponse = await telegramService.downloadFileChunk(
                    upToDateItem.location!,
                    upToDateItem.currentOffset,
                    actualLimitForApi,
                    upToDateItem.abortController?.signal
                );
            }

            if (upToDateItem.abortController?.signal.aborted) {
              activeDownloadsRef.current.delete(upToDateItem.id);
              if(upToDateItem.status !== 'cancelled') setDownloadQueue(prevQ => prevQ.map(q_item => q_item.id === upToDateItem.id ? { ...q_item, status: 'cancelled', error_message: "Aborted" } : q_item));
              continue;
            }

            if (chunkResponse?.isCdnRedirect && chunkResponse.cdnRedirectData) {
                setDownloadQueue(prevQ => prevQ.map(q_item => q_item.id === upToDateItem.id ? {
                    ...q_item,
                    status: 'downloading',
                    cdnDcId: chunkResponse.cdnRedirectData!.dc_id,
                    cdnFileToken: chunkResponse.cdnRedirectData!.file_token,
                    cdnEncryptionKey: chunkResponse.cdnRedirectData!.encryption_key,
                    cdnEncryptionIv: chunkResponse.cdnRedirectData!.encryption_iv,
                    cdnFileHashes: chunkResponse.cdnRedirectData!.file_hashes.map(fh_raw => ({
                        offset: Number(fh_raw.offset),
                        limit: fh_raw.limit,
                        hash: fh_raw.hash,
                    })),
                    cdnCurrentFileHashIndex: 0,
                    currentOffset: 0,
                    downloadedBytes: 0,
                    progress: 0,
                    chunks: [],
                } : q_item));
            } else if (chunkResponse?.errorType === 'FILE_REFERENCE_EXPIRED') {
                setDownloadQueue(prevQ => prevQ.map(q_item => q_item.id === upToDateItem.id ? { ...q_item, status: 'refreshing_reference' } : q_item));

            } else if (chunkResponse?.bytes) {
              const chunkSize = chunkResponse.bytes.length;
              setDownloadQueue(prevQ =>
                prevQ.map(q_item => {
                  if (q_item.id === upToDateItem.id) {
                    const newDownloadedBytes = q_item.downloadedBytes + chunkSize;
                    const newProgress = Math.min(100, Math.floor((newDownloadedBytes / q_item.totalSizeInBytes!) * 100));
                    const newChunks = [...(q_item.chunks || []), chunkResponse.bytes!];

                    let nextReqOffset = q_item.currentOffset;
                    let nextCdnProcessingIndex = q_item.cdnCurrentFileHashIndex;

                    if(q_item.cdnFileToken && q_item.cdnFileHashes) {
                      nextCdnProcessingIndex = (q_item.cdnCurrentFileHashIndex || 0) + 1;
                      nextReqOffset = newDownloadedBytes; // For CDN, offset is effectively total downloaded
                    } else {
                      nextReqOffset = q_item.currentOffset + chunkSize;
                    }

                    if (newDownloadedBytes >= q_item.totalSizeInBytes!) {
                      if (q_item.status !== 'completed' && !browserDownloadTriggeredRef.current.has(q_item.id)) {
                        browserDownloadTriggeredRef.current.add(q_item.id);
                        const fullFileBlob = new Blob(newChunks, { type: q_item.telegramMessage?.mime_type || 'application/octet-stream' });
                        const url = URL.createObjectURL(fullFileBlob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = q_item.name;
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        URL.revokeObjectURL(url);
                      }
                      return {
                        ...q_item,
                        status: 'completed',
                        progress: 100,
                        downloadedBytes: q_item.totalSizeInBytes!,
                        chunks: [],
                        cdnCurrentFileHashIndex: undefined,
                        currentOffset: q_item.totalSizeInBytes!
                      };
                    }
                    return {
                      ...q_item,
                      downloadedBytes: newDownloadedBytes,
                      progress: newProgress,
                      currentOffset: nextReqOffset,
                      chunks: newChunks,
                      cdnCurrentFileHashIndex: q_item.cdnFileToken ? nextCdnProcessingIndex : undefined,
                      status: 'downloading',
                    };
                  }
                  return q_item;
                })
              );
            } else {
              const errorMessage = chunkResponse?.errorType || (chunkResponse && Object.keys(chunkResponse).length === 0 ? 'Empty response object from service' : 'Unknown error or no data returned from service');
              console.error(`Failed to download chunk for ${upToDateItem.name} or no data returned. Response:`, chunkResponse, "Error Message:", errorMessage);
              setDownloadQueue(prevQ => prevQ.map(q_item => q_item.id === upToDateItem.id ? { ...q_item, status: 'failed', error_message: `Download error: ${errorMessage}` } : q_item));
            }
          } catch (error: any) {
             if (error.name === 'AbortError' || (error.message && error.message.toLowerCase().includes('aborted'))) {
                if(upToDateItem.status !== 'cancelled' && upToDateItem.status !== 'failed' && upToDateItem.status !== 'completed' ) {
                    setDownloadQueue(prevQ => prevQ.map(q_item => q_item.id === upToDateItem.id ? { ...q_item, status: 'cancelled', error_message: "Aborted by user or system." } : q_item));
                }
             } else {
                console.error(`Error processing download for ${upToDateItem.name}:`, error);
                setDownloadQueue(prevQ => prevQ.map(q_item => q_item.id === upToDateItem.id ? { ...q_item, status: 'failed', error_message: error.message || 'Processing error during chunk download' } : q_item));
             }
          } finally {
             activeDownloadsRef.current.delete(upToDateItem.id);
          }
        } else if (upToDateItem.status === 'refreshing_reference' && !activeDownloadsRef.current.has(upToDateItem.id)) {
            activeDownloadsRef.current.add(upToDateItem.id);
            try {
                if (upToDateItem.abortController?.signal.aborted) {
                    activeDownloadsRef.current.delete(upToDateItem.id);
                     if(upToDateItem.status !== 'cancelled') setDownloadQueue(prevQ => prevQ.map(q => q.id === upToDateItem.id ? { ...q, status: 'cancelled', error_message: "Aborted" } : q));
                    continue;
                }

                const updatedMediaObject = await telegramService.refreshFileReference(upToDateItem);
                if (updatedMediaObject && updatedMediaObject.file_reference) {
                    let newLocation;
                    if (updatedMediaObject._ === 'photo' && updatedMediaObject.id && updatedMediaObject.access_hash && updatedMediaObject.file_reference) {
                        const largestSize = updatedMediaObject.sizes?.find((s: any) => s.type === 'y') || updatedMediaObject.sizes?.sort((a: any, b: any) => (b.w * b.h) - (a.w * a.h))[0];
                        newLocation = {
                            _: 'inputPhotoFileLocation',
                            id: updatedMediaObject.id,
                            access_hash: updatedMediaObject.access_hash,
                            file_reference: updatedMediaObject.file_reference,
                            thumb_size: largestSize?.type || '',
                        };
                    } else if (updatedMediaObject._ === 'document' && updatedMediaObject.id && updatedMediaObject.access_hash && updatedMediaObject.file_reference) {
                         newLocation = {
                            _: 'inputDocumentFileLocation',
                            id: updatedMediaObject.id,
                            access_hash: updatedMediaObject.access_hash,
                            file_reference: updatedMediaObject.file_reference,
                            thumb_size: '',
                        };
                    }

                    if (newLocation) {
                        setDownloadQueue(prevQ => prevQ.map(q_item => q_item.id === upToDateItem.id ? {
                            ...q_item,
                            status: 'downloading',
                            location: newLocation,
                            telegramMessage: { ...(q_item.telegramMessage || {}), ...updatedMediaObject }
                        } : q_item));
                    } else {
                         console.error("Failed to construct new location after refreshing reference for", upToDateItem.name, "Updated Media:", updatedMediaObject);
                         setDownloadQueue(prevQ => prevQ.map(q_item => q_item.id === upToDateItem.id ? { ...q_item, status: 'failed', error_message: 'Refresh failed (new location construction error)' } : q_item));
                    }
                } else {
                    console.warn("File reference refresh failed for", upToDateItem.name, "No new reference or media object returned.");
                    setDownloadQueue(prevQ => prevQ.map(q_item => q_item.id === upToDateItem.id ? { ...q_item, status: 'failed', error_message: 'Refresh failed (no new file_reference)' } : q_item));
                }
            } catch (refreshError: any) {
                 console.error(`Error refreshing file reference for ${upToDateItem.name}:`, refreshError);
                setDownloadQueue(prevQ => prevQ.map(q_item => q_item.id === upToDateItem.id ? { ...q_item, status: 'failed', error_message: refreshError.message || 'File reference refresh error' } : q_item));
            } finally {
                activeDownloadsRef.current.delete(upToDateItem.id);
            }
        } else if (['paused', 'completed', 'failed', 'cancelled'].includes(upToDateItem.status) ) {
            if(activeDownloadsRef.current.has(upToDateItem.id)){
                activeDownloadsRef.current.delete(upToDateItem.id);
            }
        }
      }
    };

    const intervalId = setInterval(processQueue, 750);

    return () => {
        clearInterval(intervalId);
        downloadQueueRef.current.forEach(item => {
            if (item.abortController && !item.abortController.signal.aborted &&
                (item.status === 'downloading' || item.status === 'refreshing_reference' || item.status === 'queued' || item.status === 'paused')) {
                item.abortController.abort("Component cleanup or effect re-run");
            }
        });
        activeDownloadsRef.current.clear();
    };
  }, []);


  const observerChats = useRef<IntersectionObserver | null>(null);
  const lastChatElementRef = useCallback((node: HTMLLIElement | null) => {
    if (isLoadingDisplayedChats || !hasMoreDisplayedChats) return;
    if (observerChats.current) observerChats.current.disconnect();
    observerChats.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMoreDisplayedChats && !isLoadingDisplayedChats) {
        loadMoreDisplayedChats();
      }
    });
    if (node) observerChats.current.observe(node);
  }, [hasMoreDisplayedChats, loadMoreDisplayedChats, isLoadingDisplayedChats]);


  const fetchInitialChatMedia = useCallback(async (folder: CloudFolder) => {
    if (!folder.inputPeer) {
      toast({ title: "Error", description: "Cannot load media: InputPeer data is missing for this chat.", variant: "destructive" });
      return;
    }
    setIsLoadingChatMedia(true);
    setCurrentChatMedia([]);
    setHasMoreChatMedia(true);
    setCurrentMediaOffsetId(0);
    toast({ title: `Loading Media for ${folder.name}`, description: "Fetching initial media items..." });

    try {
      const response = await telegramService.getChatMediaHistory(folder.inputPeer, INITIAL_MEDIA_LOAD_LIMIT, 0);
      setCurrentChatMedia(response.files);
      setCurrentMediaOffsetId(response.nextOffsetId || 0);
      setHasMoreChatMedia(response.hasMore);
      if (response.files.length === 0 && !response.hasMore) {
          toast({ title: "No Media Found", description: `No media items in ${folder.name}.`});
      } else if (response.files.length > 0) {
           toast({ title: "Media Loaded", description: `Loaded ${response.files.length} initial media items for ${folder.name}.`});
      }
    } catch (error: any) {
      handleApiError(error, `Error Fetching Media for ${folder.name}`, `Could not load media items. ${error.message}`);
      setHasMoreChatMedia(false);
    } finally {
      setIsLoadingChatMedia(false);
    }
  },[toast, handleApiError]);

  const loadMoreChatMediaCallback = useCallback(async () => {
    if (isLoadingChatMedia || !hasMoreChatMedia || !selectedFolder?.inputPeer) return;
    setIsLoadingChatMedia(true);
    toast({ title: `Loading More Media for ${selectedFolder.name}`, description: "Fetching next batch..." });
    try {
      const response = await telegramService.getChatMediaHistory(selectedFolder.inputPeer, SUBSEQUENT_MEDIA_LOAD_LIMIT, currentMediaOffsetId);
      setCurrentChatMedia(prev => [...prev, ...response.files]);
      setCurrentMediaOffsetId(response.nextOffsetId || 0);
      setHasMoreChatMedia(response.hasMore);
       if (response.files.length > 0) {
           toast({ title: "More Media Loaded", description: `Loaded ${response.files.length} additional media items.`});
      } else if (!response.hasMore) {
           toast({ title: "All Media Loaded", description: `No more media to load for ${selectedFolder.name}.`});
      }
    } catch (error: any) {
      handleApiError(error, "Error Loading More Media", `Could not load more media items. ${error.message}`);
      setHasMoreChatMedia(false);
    } finally {
      setIsLoadingChatMedia(false);
    }
  }, [isLoadingChatMedia, hasMoreChatMedia, selectedFolder, currentMediaOffsetId, toast, handleApiError]);

  const observerMedia = useRef<IntersectionObserver | null>(null);
  const lastMediaItemRef = useCallback((node: HTMLDivElement | null) => {
    if (isLoadingChatMedia) return;
    if (observerMedia.current) observerMedia.current.disconnect();
    observerMedia.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMoreChatMedia && !isLoadingChatMedia) {
        loadMoreChatMediaCallback();
      }
    });
    if (node) observerMedia.current.observe(node);
  }, [hasMoreChatMedia, loadMoreChatMediaCallback, isLoadingChatMedia]);

  const handleSelectFolder = (folderId: string) => {
    const folder = displayedChats.find(f => f.id === folderId);
    if (folder) {
      setSelectedFolder(folder);
      fetchInitialChatMedia(folder);
      setIsChatSelectionDialogOpen(false);
    } else {
      console.warn(`Folder with ID ${folderId} not found in current displayedChats for selection.`);
      setSelectedFolder(null);
      setCurrentChatMedia([]);
    }
  };

  const handleSendCode = async (fullPhoneNumberFromConnect: string) => {
    if (!fullPhoneNumberFromConnect || !fullPhoneNumberFromConnect.startsWith('+') || fullPhoneNumberFromConnect.length < 5) {
      setAuthError("Phone number is required and must be valid (e.g. +1234567890).");
      toast({ title: "Invalid Phone Number", description: "Please select a country and enter a valid number.", variant: "destructive" });
      return;
    }
    setIsConnecting(true);
    setAuthError(null);
    setPhoneNumber(fullPhoneNumberFromConnect);
    toast({ title: "Sending Code...", description: `Requesting verification code for ${fullPhoneNumberFromConnect}.` });

    try {
      await telegramService.sendCode(fullPhoneNumberFromConnect);
      setAuthStep('awaiting_code');
      toast({ title: "Code Sent!", description: "Please check Telegram for your verification code." });
    } catch (error: any) {
        if ((error as Error).message === 'AUTH_RESTART') {
             handleApiError(error, "Authentication Restart Needed", "Please try entering your phone number again.");
        } else if (error.message?.includes("Invalid hash in mt_dh_gen_ok")) {
             handleApiError(error, "Connection Handshake Failed", "Could not establish a secure connection.");
        } else {
            handleApiError(error, "Error Sending Code", `Could not send verification code. ${error.message}`);
        }
    } finally {
      setIsConnecting(false);
    }
  };

  const handleSignIn = async (currentPhoneCode: string) => {
    if (!currentPhoneCode) {
      setAuthError("Verification code is required.");
      toast({ title: "Verification Code Required", description: "Please enter the code sent to you.", variant: "destructive" });
      return;
    }
    setIsConnecting(true);
    setAuthError(null);
    setPhoneCode(currentPhoneCode);
    toast({ title: "Verifying Code...", description: "Checking your verification code with Telegram." });
    try {
      const result = await telegramService.signIn(phoneNumber, currentPhoneCode);
      if (result.user) {
        setIsConnected(true);
        setAuthStep('initial');
        setPhoneCode('');
        setPassword('');
        toast({ title: "Sign In Successful!", description: "Connected to Telegram." });
        if (!hasFetchedDialogFiltersOnce) {
            await fetchDialogFilters(); // Fetch filters after successful sign-in
        }
      } else {
        setAuthError("Sign in failed. Unexpected response from server.");
        toast({ title: "Sign In Failed", description: "Unexpected response from server.", variant: "destructive" });
      }
    } catch (error: any) {
      if (error.message === '2FA_REQUIRED' && (error as any).srp_id) {
        setAuthStep('awaiting_password');
        setAuthError(null);
        toast({ title: "2FA Required", description: "Please enter your two-factor authentication password." });
      } else {
        handleApiError(error, "Sign In Failed", `Could not sign in. ${error.message}`);
      }
    } finally {
      setIsConnecting(false);
    }
  };

  const handleCheckPassword = async (currentPassword: string) => {
    if (!currentPassword) {
      setAuthError("Password is required.");
      toast({ title: "Password Required", description: "Please enter your 2FA password.", variant: "destructive" });
      return;
    }
    setIsConnecting(true);
    setAuthError(null);
    setPassword(currentPassword);
    toast({ title: "Verifying Password...", description: "Checking your 2FA password." });
    try {
      const user = await telegramService.checkPassword(currentPassword);
      if (user) {
        setIsConnected(true);
        setAuthStep('initial');
        setPhoneCode('');
        setPassword('');
        toast({ title: "2FA Successful!", description: "Connected to Telegram." });
         if (!hasFetchedDialogFiltersOnce) {
            await fetchDialogFilters(); // Fetch filters after successful 2FA
        }
      } else {
        setAuthError("2FA failed. Unexpected response from server.");
        toast({ title: "2FA Failed", description: "Unexpected response from server.", variant: "destructive" });
      }
    } catch (error: any) {
      handleApiError(error, "2FA Failed", `Could not verify password. ${error.message}`);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleOpenFileDetails = useCallback((file: CloudFile) => {
    setSelectedFileForDetails(file);
    setIsDetailsPanelOpen(true);
  }, []);

  const handleCloseFileDetails = () => {
    setIsDetailsPanelOpen(false);
    setTimeout(() => setSelectedFileForDetails(null), 300);
  };

  const handleQueueDownload = useCallback(async (file: CloudFile) => {
    const existingItem = downloadQueueRef.current.find(item => item.id === file.id);
    if (existingItem && ['downloading', 'queued', 'paused', 'refreshing_reference'].includes(existingItem.status)) {
      toast({ title: "Already in Queue", description: `${file.name} is already being processed or queued.` });
      setIsDownloadManagerOpen(true);
      return;
    }
    if (existingItem && existingItem.status === 'completed') {
        toast({ title: "Already Downloaded", description: `${file.name} has already been downloaded. If you want to download again, clear it from the list or retry.`});
        setIsDownloadManagerOpen(true);
        return;
    }

    if (existingItem && ['failed', 'cancelled'].includes(existingItem.status)) {
        browserDownloadTriggeredRef.current.delete(file.id);
        setDownloadQueue(prevQ => prevQ.filter(q => q.id !== file.id));
        await new Promise(resolve => setTimeout(resolve, 50)); // Allow state to update
    }

    toast({ title: "Preparing Download...", description: `Getting details for ${file.name}.` });
    const downloadInfo = await telegramService.prepareFileDownloadInfo(file);

    if (downloadInfo && downloadInfo.location && downloadInfo.totalSize > 0 && file.totalSizeInBytes) {
      const controller = new AbortController();
      const newItem: DownloadQueueItemType = {
        ...file,
        status: 'downloading', // Start as downloading to trigger processing
        progress: 0,
        downloadedBytes: 0,
        currentOffset: 0,
        chunks: [],
        location: downloadInfo.location,
        totalSizeInBytes: file.totalSizeInBytes, // Use the reliable size from CloudFile
        abortController: controller,
        error_message: undefined,
      };
      setDownloadQueue(prevQueue => {
        const filteredQueue = prevQueue.filter(item => item.id !== file.id);
        return [...filteredQueue, newItem];
      });
      setIsDownloadManagerOpen(true);
      toast({ title: "Download Started", description: `${file.name} added to queue and started.` });
    } else {
      toast({ title: "Download Failed", description: `Could not prepare ${file.name} for download. File info missing or invalid. Size: ${file.totalSizeInBytes}, downloadInfo: ${JSON.stringify(downloadInfo)}`, variant: "destructive" });
    }
  }, [toast]);


  const handleCancelDownload = useCallback((itemId: string) => {
    setDownloadQueue(prevQueue =>
      prevQueue.map(item => {
        if (item.id === itemId && item.abortController && !item.abortController.signal.aborted && (item.status === 'downloading' || item.status === 'queued' || item.status === 'paused' || item.status === 'refreshing_reference')) {
          item.abortController.abort("User cancelled download");
          return { ...item, status: 'cancelled', progress: 0, downloadedBytes: 0, error_message: "Cancelled by user." };
        }
        return item;
      })
    );
    toast({ title: "Download Cancelled", description: `Download for item has been cancelled.`});
  }, [toast]);


  const handlePauseDownload = useCallback((itemId: string) => {
    setDownloadQueue(prevQueue =>
        prevQueue.map(item =>
            item.id === itemId && item.status === 'downloading' ?
            {...item, status: 'paused'} : item
        )
    );
    toast({ title: "Download Paused", description: `Download for item has been paused.`});
  }, [toast]);

  const handleResumeDownload = useCallback((itemId: string) => {
    const itemToResume = downloadQueueRef.current.find(item => item.id === itemId);

    if (itemToResume && (itemToResume.status === 'failed' || itemToResume.status === 'cancelled')) {
        browserDownloadTriggeredRef.current.delete(itemId); // Allow browser download again
        // Create a fresh CloudFile object from the item to pass to handleQueueDownload
        const originalFileProps: CloudFile = {
            id: itemToResume.id,
            name: itemToResume.name,
            type: itemToResume.type,
            size: itemToResume.size, // Original formatted size
            timestamp: itemToResume.timestamp,
            url: itemToResume.url, // May be undefined
            dataAiHint: itemToResume.dataAiHint,
            messageId: itemToResume.messageId,
            telegramMessage: itemToResume.telegramMessage, // Full original message object
            totalSizeInBytes: itemToResume.totalSizeInBytes,
            inputPeer: itemToResume.inputPeer,
        };
        // Remove the old failed/cancelled item from queue before re-adding
        setDownloadQueue(prevQ => prevQ.filter(q => q.id !== itemId));
        // Use a timeout to ensure state update before calling handleQueueDownload
        setTimeout(() => {
            handleQueueDownload(originalFileProps);
        }, 50); 
        toast({ title: "Retrying Download", description: `Retrying download for ${itemToResume.name}.`});
        return;
    }

    setDownloadQueue(prevQueue =>
        prevQueue.map(item =>
            item.id === itemId && item.status === 'paused' ?
            {...item, status: 'downloading', error_message: undefined } : item // Clear error on resume
        )
    );
    toast({ title: "Download Resumed", description: `Download for item has been resumed.`});
  }, [toast, handleQueueDownload]);


  const handleViewImage = useCallback((file: CloudFile) => {
    if (file.type === 'image' && file.url) {
      setViewingImageUrl(file.url);
      setViewingImageName(file.name);
      setIsImageViewerOpen(true);
    } else if (file.type === 'image' && !file.url) {
      // If no direct URL (e.g. for freshly listed items), attempt to get one or download
      // For now, prompt for download as robust preview generation isn't implemented.
      toast({ title: "Preview Not Available", description: "Image URL not available for preview. Try downloading first.", variant: "default"});
    } else if (file.type !== 'image') {
      toast({ title: "Not an Image", description: "This file is not an image and cannot be viewed here.", variant: "default"});
    }
  }, [toast]);

 const fetchVideoAndCreateStreamUrl = useCallback(async (file: CloudFile, signal: AbortSignal) => {
    toast({ title: "Preparing Video...", description: `Fetching ${file.name} for playback.` });
    try {
      const downloadInfo = await telegramService.prepareFileDownloadInfo(file);
      if (!downloadInfo || !downloadInfo.location || !downloadInfo.totalSize || downloadInfo.totalSize <= 0) {
        throw new Error("Could not get valid download information for video.");
      }

      let downloadedBytes = 0;
      let currentOffset = 0;
      const chunks: Uint8Array[] = [];
      const totalSize = downloadInfo.totalSize;

      while (downloadedBytes < totalSize) {
        if (signal.aborted) throw new Error("Video preparation aborted by user.");

        const bytesNeededForVideo = totalSize - downloadedBytes;
        const offsetWithinCurrentMBBlockVideo = currentOffset % ONE_MB;
        const bytesLeftInCurrentMBBlockVideo = ONE_MB - offsetWithinCurrentMBBlockVideo;
        let idealBytesToRequestVideo = Math.min(bytesLeftInCurrentMBBlockVideo, DOWNLOAD_CHUNK_SIZE, bytesNeededForVideo);
        let limitForApiCallVideo: number;

        if (bytesNeededForVideo <= 0) {
            limitForApiCallVideo = 0;
        } else if (idealBytesToRequestVideo <= 0) {
             limitForApiCallVideo = bytesNeededForVideo > 0 ? KB_1 : 0;
        } else if (idealBytesToRequestVideo < KB_1) {
            limitForApiCallVideo = KB_1;
        } else {
            limitForApiCallVideo = Math.floor(idealBytesToRequestVideo / KB_1) * KB_1;
        }
        if (limitForApiCallVideo === 0 && bytesNeededForVideo > 0 && idealBytesToRequestVideo > 0) {
            limitForApiCallVideo = KB_1;
        }

        if (limitForApiCallVideo <= 0) break; // All bytes fetched or error

        const chunkResponse = await telegramService.downloadFileChunk(downloadInfo.location, currentOffset, limitForApiCallVideo, signal);

        if (signal.aborted) throw new Error("Video preparation aborted during chunk download.");

        if (chunkResponse?.bytes && chunkResponse.bytes.length > 0) {
          chunks.push(chunkResponse.bytes);
          downloadedBytes += chunkResponse.bytes.length;
          currentOffset += chunkResponse.bytes.length;
        } else if (chunkResponse?.errorType) {
          // Handle file reference expiry or other errors during streaming
          console.error("Error during video chunk download:", chunkResponse.errorType);
          throw new Error(`Failed to download video chunk: ${chunkResponse.errorType}`);
        } else if (chunkResponse?.isCdnRedirect){
            console.warn("CDN Redirect encountered during video stream prep. This path is not fully handled for video streaming yet. Try regular download.");
            throw new Error("CDN Redirect not fully handled during video stream preparation. Try regular download.");
        } else {
          // If no bytes and no specific error, assume end or unexpected issue
          if (downloadedBytes < totalSize) { // Log if unexpected end
            console.warn(`Video chunk download for ${file.name} returned empty/unexpected bytes before completion. Downloaded: ${downloadedBytes}/${totalSize}. Resp:`, chunkResponse);
          }
          break; 
        }
      }

      if (signal.aborted) throw new Error("Video preparation aborted after download loop.");

      // Ensure all bytes were fetched if no error occurred
      // if (downloadedBytes < totalSize) {
      //   throw new Error(`Video stream incomplete. Fetched ${downloadedBytes}/${totalSize} bytes.`);
      // }

      const mimeType = file.telegramMessage?.mime_type || 'video/mp4';
      const videoBlob = new Blob(chunks, { type: mimeType });
      const objectURL = URL.createObjectURL(videoBlob);

      // Ensure these are set only on success
      setVideoStreamUrl(objectURL);
      setPlayingVideoUrl(objectURL); // Set this so the player can use it
      toast({ title: "Video Ready", description: `${file.name} is ready for playback.` });

    } catch (error: any) {
      if (error.message?.includes("aborted")) {
        toast({ title: "Video Preparation Cancelled", description: `Preparation for ${file.name} was cancelled.`, variant: "default" });
      } else {
        toast({ title: "Video Preparation Failed", description: `Could not prepare ${file.name}: ${error.message}`, variant: "destructive" });
      }
      setPlayingVideoUrl(null); // Clear on error
      setIsVideoPlayerOpen(false); // Close player on error
    }
  }, [toast]);


  // Orchestrator for preparing and playing video stream
  const prepareAndPlayVideoStream = useCallback(async (file: CloudFile) => {
    if (isPreparingVideoStream && preparingVideoStreamForFileId === file.id) {
      toast({ title: "Already Preparing", description: `Still preparing ${file.name}. Please wait.`, variant: "default" });
      setIsVideoPlayerOpen(true); // Ensure player is open if already preparing this file
      return;
    }

    // Abort previous stream preparation if any
    if (videoStreamAbortControllerRef.current && !videoStreamAbortControllerRef.current.signal.aborted) {
      videoStreamAbortControllerRef.current.abort("New video stream preparation requested");
    }
    // Revoke old object URL if it exists
    if (videoStreamUrl) {
      URL.revokeObjectURL(videoStreamUrl);
      setVideoStreamUrl(null);
    }

    setPlayingVideoUrl(null); // Clear current playing URL immediately
    setPlayingVideoName(file.name);
    setIsPreparingVideoStream(true);
    setPreparingVideoStreamForFileId(file.id);
    setIsVideoPlayerOpen(true); // Open player to show loading state

    const newController = new AbortController();
    videoStreamAbortControllerRef.current = newController;

    try {
        // fetchVideoAndCreateStreamUrl will set videoStreamUrl and playingVideoUrl on success
        await fetchVideoAndCreateStreamUrl(file, newController.signal);
    } catch (error) { // Catch errors not handled within fetchVideoAndCreateStreamUrl, though most should be
         if (!newController.signal.aborted) { // Only log if not aborted by a new request
            console.error("Unexpected error during video stream preparation orchestrator:", error);
        }
    } finally {
        // Clean up only if this controller is still the active one
        if (videoStreamAbortControllerRef.current === newController) {
            setIsPreparingVideoStream(false);
            setPreparingVideoStreamForFileId(null);
            // Do NOT clear videoStreamUrl or playingVideoUrl here if successfully set by fetchVideo...
        }
    }
  }, [isPreparingVideoStream, preparingVideoStreamForFileId, videoStreamUrl, fetchVideoAndCreateStreamUrl, toast]);


  const handlePlayVideo = useCallback((file: CloudFile) => {
     if (file.type === 'video') {
        // If file.url exists and is a direct playable URL (e.g., already downloaded or public)
        if (file.url) { // This path is less common for Telegram files unless pre-processed
            setPlayingVideoUrl(file.url);
            setPlayingVideoName(file.name);
            setIsPreparingVideoStream(false); // Not preparing if direct URL
            setPreparingVideoStreamForFileId(null);
            setIsVideoPlayerOpen(true);
        } else if (file.totalSizeInBytes && file.totalSizeInBytes > 0) {
            // No direct URL, so prepare stream
            prepareAndPlayVideoStream(file);
        } else {
            toast({ title: "Playback Not Possible", description: "Video data or size is missing, cannot play.", variant: "default"});
        }
    } else {
      toast({ title: "Not a Video", description: "This file is not a video and cannot be played here.", variant: "default"});
    }
  }, [prepareAndPlayVideoStream, toast]);

  const handleCloseVideoPlayer = useCallback(() => {
    setIsVideoPlayerOpen(false);
    // Abort ongoing preparation if player is closed
    if (isPreparingVideoStream && videoStreamAbortControllerRef.current && !videoStreamAbortControllerRef.current.signal.aborted) {
        videoStreamAbortControllerRef.current.abort("Video player closed during preparation");
    }
    setIsPreparingVideoStream(false); // Reset preparation state
    setPreparingVideoStreamForFileId(null);

    // Revoke object URL when player is closed
    if (videoStreamUrl) {
        URL.revokeObjectURL(videoStreamUrl);
        setVideoStreamUrl(null);
    }
    setPlayingVideoUrl(null); // Clear the URL for the player
  }, [isPreparingVideoStream, videoStreamUrl]);

  // Cleanup effect for videoStreamUrl when component unmounts
  useEffect(() => {
    return () => {
        if (videoStreamUrl) {
            URL.revokeObjectURL(videoStreamUrl);
        }
        // Abort any ongoing preparation if component unmounts
        if (videoStreamAbortControllerRef.current && !videoStreamAbortControllerRef.current.signal.aborted) {
            videoStreamAbortControllerRef.current.abort("Component unmounting");
        }
    };
  }, [videoStreamUrl]);


  const handleOpenDownloadManager = () => setIsDownloadManagerOpen(true);
  const handleCloseDownloadManager = () => setIsDownloadManagerOpen(false);
  const handleOpenChatSelectionDialog = () => setIsChatSelectionDialogOpen(true);

  const handleOpenUploadDialog = () => {
    if (!selectedFolder) {
      toast({ title: "No Chat Selected", description: "Please select a chat first to upload files to.", variant: "default" });
      return;
    }
    setIsUploadDialogOpen(true);
  };
  const handleCloseUploadDialog = () => {
     if (isUploadingFiles) {
      toast({ title: "Upload in Progress", description: "Please wait for uploads to complete or cancel them before closing.", variant: "default" });
      return;
    }
    setIsUploadDialogOpen(false);
    setFilesToUpload([]); // Clear selected files
    // Abort any ongoing uploads related to this dialog instance
    uploadAbortControllersRef.current.forEach((controller, id) => {
      if (!controller.signal.aborted) {
        console.log(`Upload dialog closed, aborting upload for file ID: ${id}`);
        controller.abort("Upload dialog closed by user");
      }
    });
    uploadAbortControllersRef.current.clear(); // Clear all controllers
  };

  const handleFilesSelectedForUpload = (selectedNativeFiles: FileList | null) => {
    if (selectedNativeFiles) {
      const newExtendedFiles: ExtendedFile[] = Array.from(selectedNativeFiles).map((file, index) => ({
        id: `${file.name}-${file.lastModified}-${Date.now()}-${index}`, // More unique ID
        originalFile: file,
        name: file.name,
        size: file.size,
        type: file.type,
        lastModified: file.lastModified,
        uploadProgress: 0, // Initialize progress
        uploadStatus: 'pending', // Initialize status
      }));
      setFilesToUpload(prevFiles => [...prevFiles, ...newExtendedFiles]);
      if(newExtendedFiles.length > 0) {
        toast({ title: "Files Ready", description: `${newExtendedFiles.length} file(s) added to upload list.`});
      }
    }
  };

const handleStartUpload = async () => {
  const filesToAttemptUpload = filesToUpload.filter(f => f.uploadStatus === 'pending' || f.uploadStatus === 'failed' || f.uploadStatus === 'cancelled');

  if (filesToAttemptUpload.length === 0) {
    toast({ title: "No New Files", description: "No new files or files marked for retry to upload.", variant: "default" });
    return;
  }
  if (!selectedFolder || !selectedFolder.inputPeer) {
    toast({ title: "Upload Target Missing", description: "No target chat selected or inputPeer is missing.", variant: "destructive" });
    return;
  }

  setIsUploadingFiles(true); // Set master loading flag

  for (const fileToUpload of filesToAttemptUpload) {
    // Skip if already completed, or somehow still in a processing state from a previous attempt (though this shouldn't happen with filtering above)
    if (fileToUpload.uploadStatus === 'completed' || fileToUpload.uploadStatus === 'uploading' || fileToUpload.uploadStatus === 'processing') {
        console.log(`Skipping upload for ${fileToUpload.name}, status: ${fileToUpload.uploadStatus}`);
        continue;
    }

    const controller = new AbortController();
    uploadAbortControllersRef.current.set(fileToUpload.id, controller);

    // Helper to update UI for a specific file
    const updateUiForFile = (fileId: string, progress: number, status: ExtendedFile['uploadStatus']) => {
      setFilesToUpload(prev =>
        prev.map(f =>
          f.id === fileId
            ? { ...f, uploadProgress: progress, uploadStatus: status }
            : f
        )
      );
    };

    updateUiForFile(fileToUpload.id, 0, 'uploading'); // Set status to uploading for this specific file

    try {
      toast({ title: `Starting Upload: ${fileToUpload.name}`, description: `Size: ${telegramService.formatFileSize(fileToUpload.size)}` });
      await telegramService.uploadFile(
        selectedFolder.inputPeer,
        fileToUpload.originalFile,
        (percent) => { // Progress callback from service
          const currentStatus = percent === 100 ? 'processing' : 'uploading'; // 'processing' after 100% upload before server confirms
          updateUiForFile(fileToUpload.id, percent, currentStatus);
        },
        controller.signal // Pass abort signal to service
      );
      updateUiForFile(fileToUpload.id, 100, 'completed'); // Mark as completed
      toast({ title: "Upload Successful!", description: `${fileToUpload.name} uploaded to ${selectedFolder.name}.` });

      // Refresh media for the current folder if the upload was to the currently selected folder
      if (selectedFolder && selectedFolder.id === selectedFolder?.id) { // Check if still the selected folder
         fetchInitialChatMedia(selectedFolder); // Re-fetch media for this chat
      }
    } catch (error: any) {
      if (controller.signal.aborted || error.name === 'AbortError' || error.message?.includes('aborted')) {
        updateUiForFile(fileToUpload.id, fileToUpload.uploadProgress || 0, 'cancelled'); // Mark as cancelled
        toast({ title: "Upload Cancelled", description: `${fileToUpload.name} upload was cancelled.`, variant: "default" });
      } else {
        updateUiForFile(fileToUpload.id, fileToUpload.uploadProgress || 0, 'failed'); // Mark as failed
        toast({ title: "Upload Failed", description: `Could not upload ${fileToUpload.name}: ${error.message}`, variant: "destructive" });
        console.error(`Upload failed for ${fileToUpload.name}:`, error);
      }
    } finally {
      uploadAbortControllersRef.current.delete(fileToUpload.id); // Clean up controller for this file
    }
  }
  setIsUploadingFiles(false); // Reset master loading flag after all attempts
};

  const handleSelectDialogFilter = (filterId: number) => {
    if (activeDialogFilterId === filterId && !isReorderingFolders) return;
    setActiveDialogFilterId(filterId);
  };

  const handleToggleReorderFolders = async () => {
    if (isReorderingFolders) {
      // Save the new order
      const newOrder = dialogFilters
        .filter(f => f.id !== ALL_CHATS_FILTER_ID) // Exclude "All Chats" from reordering persistence
        .map(f => f.id);

      console.log("Attempting to save new folder order:", newOrder);
      try {
        await telegramService.updateDialogFiltersOrder(newOrder);
        toast({ title: "Folder Order Saved", description: "The new folder order has been saved to Telegram." });
      } catch (error: any) {
        handleApiError(error, "Error Saving Order", "Could not save the folder order.");
        // Optionally re-fetch filters to revert to server state on error
        setHasFetchedDialogFiltersOnce(false); // Allow re-fetch
        await fetchDialogFilters();
      }
    }
    setIsReorderingFolders(prev => !prev);
  };

  const handleMoveFilter = (dragIndex: number, hoverIndex: number) => {
    // Prevent moving "All Chats" or moving an item before "All Chats" if it's the first item
    const draggedFilter = dialogFilters[dragIndex];
    if (draggedFilter.id === ALL_CHATS_FILTER_ID || (dialogFilters[hoverIndex] && dialogFilters[hoverIndex].id === ALL_CHATS_FILTER_ID && hoverIndex === 0)) {
        return; // Do not allow "All Chats" to be moved, or any item to be placed before "All Chats" if it's at index 0
    }
    // Also ensure we don't drag an item to become the first item if "All Chats" is currently first
    if (dialogFilters[0].id === ALL_CHATS_FILTER_ID && hoverIndex === 0) {
        return;
    }

    setDialogFilters(prevFilters => {
      const updatedFilters = [...prevFilters];
      const [movedItem] = updatedFilters.splice(dragIndex, 1);
      updatedFilters.splice(hoverIndex, 0, movedItem);
      return updatedFilters;
    });
  };

  const handleShareFilter = async (filterId: number) => {
    if (filterId === ALL_CHATS_FILTER_ID) {
      toast({ title: "Cannot Share", description: "The 'All Chats' view cannot be shared." });
      return;
    }

    // Optimistically update UI (optional, or use a specific isLoading state in DialogFilter type)
    setDialogFilters(prev => prev.map(f => f.id === filterId ? { ...f, isLoading: true, inviteLink: undefined } : f));
    try {
      const result = await telegramService.exportChatlistInvite(filterId);
      if (result && result.link) {
        setDialogFilters(prev => prev.map(f => f.id === filterId ? { ...f, isLoading: false, inviteLink: result.link } : f));
        toast({
          title: "Folder Invite Link Created",
          description: `Link: ${result.link} (Copied to console)`,
        });
        console.log(`Invite link for folder ID ${filterId}: ${result.link}`); // For easy copy-paste
      } else {
        throw new Error("No link returned from server.");
      }
    } catch (error: any) {
      handleApiError(error, "Error Sharing Folder", "Could not create an invite link for this folder.");
      setDialogFilters(prev => prev.map(f => f.id === filterId ? { ...f, isLoading: false } : f)); // Reset loading state on error
    }
  };

  const handleAddFilterPlaceholder = () => {
    // This would ideally open a new dialog/form to create a DialogFilter
    toast({ title: "Add New Folder", description: "This feature (adding a new folder) is not yet implemented." });
  };

  const handleRefreshCurrentFilter = () => {
    if (activeFilterDetails) {
      const cacheKeyToRefresh = activeFilterDetails.id;
      const apiFolderId = activeFilterDetails._ === 'dialogFilterDefault' ? undefined : activeFilterDetails.id;
      
      toast({ title: `Refreshing "${activeFilterDetails.title}"...`});
      // Clear the specific cache entry to force a re-fetch
      setChatDataCache(prev => {
        const newCache = new Map(prev);
        if (newCache.has(cacheKeyToRefresh)) {
            // Reset parts of the cache entry to trigger re-load by orchestrator effect
            const entry = newCache.get(cacheKeyToRefresh)!;
            newCache.set(cacheKeyToRefresh, {
                ...entry,
                folders: [], // Clear folders
                pagination: initialPaginationState, // Reset pagination
                isLoading: false, // Ensure it's not stuck in loading
                error: null
            });
        } else {
            // If not in cache, it will be fetched by orchestrator anyway due to logic,
            // but we can prime it as non-loading and needing fetch.
             newCache.set(cacheKeyToRefresh, {
                folders: [], 
                pagination: initialPaginationState,
                isLoading: false,
                error: null
            });
        }
        return newCache;
      });

      if (activeFilterDetails._ === 'dialogFilterChatlist' || activeFilterDetails._ === 'dialogFilterDefault') {
        // If refreshing "All Chats" or a chatlist (which depends on "All Chats")
        setMasterChatListForFiltering([]);
        setMasterChatListPaginationForFiltering(initialPaginationState);
         // Force re-fetch of master list if it's All Chats or a dependency
        if (chatDataCache.has(ALL_CHATS_FILTER_ID)) {
            setChatDataCache(prev => {
                const newCache = new Map(prev);
                newCache.set(ALL_CHATS_FILTER_ID, { folders: [], pagination: initialPaginationState, isLoading: false, error: null});
                return newCache;
            });
        }
      }
      // The orchestrator useEffect will pick up the cleared cache/master list and re-fetch.
    }
  };


  if (!isConnected && !isConnecting && authStep === 'initial') {
    return (
      <>
        <Header ref={headerRef} isConnected={false} />
        <main className="flex-grow container mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col items-center justify-center">
          <TelegramConnect
            authStep={authStep}
            onSendCode={handleSendCode}
            onSignIn={handleSignIn}
            onCheckPassword={handleCheckPassword}
            isLoading={isConnecting}
            error={authError}
            phoneNumber={phoneNumber}
            setPhoneNumber={setPhoneNumber} // Not directly used by connect inputs, but for page's state
            phoneCode={phoneCode}
            setPhoneCode={setPhoneCode}
            password={password}
            setPassword={setPassword}
            onReset={() => handleReset(authStep !== 'initial')} // Only server logout if not already at initial step
          />
        </main>
        <footer ref={footerRef} className="py-4 px-4 sm:px-6 lg:px-8 text-center border-t">
          <p className="text-sm text-muted-foreground">
            Telegram Cloudifier &copy; {new Date().getFullYear()}
          </p>
        </footer>
      </>
    );
  }
  
  if (isConnecting || (isConnected && isLoadingDialogFilters && !activeFilterDetails && !hasFetchedDialogFiltersOnce) ) {
     return (
      <div className="min-h-screen flex flex-col">
        <Header ref={headerRef} isConnected={isConnected} />
        <main className="flex-grow flex items-center justify-center text-center">
          <div>
            <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
            <p className="text-lg text-muted-foreground">
              {isConnecting ? "Connecting to Telegram..." : "Loading your folders..."}
            </p>
          </div>
        </main>
         <footer ref={footerRef} className="py-3 px-4 sm:px-6 lg:px-8 text-center border-t text-xs">
            <p className="text-muted-foreground">
            Telegram Cloudifier &copy; {new Date().getFullYear()}
            </p>
        </footer>
      </div>
    );
  }


  return (
    <div className="min-h-screen flex flex-col">
      <Header
        ref={headerRef}
        isConnected={isConnected}
        onDisconnect={() => handleReset(true)}
        onOpenDownloadManager={handleOpenDownloadManager}
        onOpenChatSelectionDialog={handleOpenChatSelectionDialog}
      />
      <div className="flex-1 flex overflow-hidden min-h-0"> {/* Ensure this flex container allows children to scroll */}
        <main className="flex-1 overflow-y-auto bg-background"> {/* Main content area scrolls */}
           <div className="container mx-auto h-full px-4 sm:px-6 lg:px-8 py-4 md:py-6 lg:py-8">
            {selectedFolder ? (
                <MainContentView
                folderName={selectedFolder.name}
                files={currentChatMedia}
                isLoading={isLoadingChatMedia && currentChatMedia.length === 0}
                hasMore={hasMoreChatMedia}
                lastItemRef={lastMediaItemRef}
                onFileDetailsClick={handleOpenFileDetails}
                onQueueDownloadClick={handleQueueDownload}
                onFileViewImageClick={handleViewImage}
                onFilePlayVideoClick={handlePlayVideo}
                onOpenUploadDialog={handleOpenUploadDialog}
                isPreparingStream={isPreparingVideoStream}
                preparingStreamForFileId={preparingVideoStreamForFileId}
                />
            ) : (
                <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
                  <LayoutPanelLeft className="w-16 h-16 mb-4 opacity-50" />
                  <p className="text-lg mb-2">No chat selected.</p>
                  <p className="text-sm mb-4">Select a folder tab in the chat selection dialog, then choose a chat.</p>
                  <Button onClick={handleOpenChatSelectionDialog}>
                    <MessageSquare className="mr-2 h-5 w-5" /> Select a Chat
                  </Button>
                  {isLoadingDisplayedChats && displayedChats.length === 0 && (
                    <div className="mt-4 flex items-center">
                      <Loader2 className="animate-spin h-5 w-5 text-primary mr-2" />
                      <span>Loading initial chat list for "{activeFilterDetails?.title || 'current folder'}"...</span>
                    </div>
                  )}
                   { !isLoadingDisplayedChats && displayedChats.length === 0 && !currentErrorMessage && isConnected && activeFilterDetails && (
                     <div className="mt-4 flex items-center text-sm">
                        <MessageSquare className="mr-2 h-5 w-5 text-muted-foreground" />
                        <span>Chat list for "{activeFilterDetails.title}" appears to be empty.</span>
                    </div>
                    )}
                    {currentErrorMessage && (
                        <div className="mt-4 p-3 bg-destructive/10 text-destructive rounded-md text-sm">
                            <p>{currentErrorMessage}</p>
                        </div>
                    )}
                </div>
            )}
          </div>
        </main>
      </div>
      <footer ref={footerRef} className="py-3 px-4 sm:px-6 lg:px-8 text-center border-t text-xs">
        <p className="text-muted-foreground">
          Telegram Cloudifier &copy; {new Date().getFullYear()}
        </p>
      </footer>

      <ChatSelectionDialog
        isOpen={isChatSelectionDialogOpen}
        onOpenChange={setIsChatSelectionDialogOpen}
        dialogFilters={dialogFilters}
        activeDialogFilterId={activeDialogFilterId}
        onSelectDialogFilter={handleSelectDialogFilter}
        isLoadingDialogFilters={isLoadingDialogFilters && dialogFilters.length <=1 && !hasFetchedDialogFiltersOnce}
        isReorderingFolders={isReorderingFolders}
        onToggleReorderFolders={handleToggleReorderFolders}
        onMoveFilter={handleMoveFilter}
        onShareFilter={handleShareFilter}
        onAddFilterPlaceholder={handleAddFilterPlaceholder}
        folders={displayedChats}
        selectedFolderId={selectedFolder?.id || null}
        onSelectFolder={handleSelectFolder}
        lastItemRef={lastChatElementRef}
        isLoading={isLoadingDisplayedChats && displayedChats.length === 0}
        isLoadingMore={isLoadingDisplayedChats && displayedChats.length > 0}
        hasMore={hasMoreDisplayedChats}
        onLoadMore={loadMoreDisplayedChats}
        onRefresh={handleRefreshCurrentFilter}
        currentErrorMessage={currentErrorMessage}
      />

      <FileDetailsPanel
        file={selectedFileForDetails}
        isOpen={isDetailsPanelOpen}
        onClose={handleCloseFileDetails}
        onQueueDownload={handleQueueDownload}
      />
      <ImageViewer
        isOpen={isImageViewerOpen}
        onClose={() => setIsImageViewerOpen(false)}
        imageUrl={viewingImageUrl}
        imageName={viewingImageName}
      />
      <VideoPlayer
        isOpen={isVideoPlayerOpen}
        onClose={handleCloseVideoPlayer}
        videoUrl={playingVideoUrl}
        videoName={playingVideoName}
        isLoading={isPreparingVideoStream && playingVideoUrl === null}
      />
      <DownloadManagerDialog
        isOpen={isDownloadManagerOpen}
        onClose={handleCloseDownloadManager}
        queue={downloadQueue}
        onCancel={handleCancelDownload}
        onPause={handlePauseDownload}
        onResume={handleResumeDownload}
      />
      <UploadDialog
        isOpen={isUploadDialogOpen}
        onClose={handleCloseUploadDialog}
        onFilesSelected={handleFilesSelectedForUpload}
        onUpload={handleStartUpload}
        selectedFiles={filesToUpload}
        isLoading={isUploadingFiles}
      />
    </div>
  );
}
    
