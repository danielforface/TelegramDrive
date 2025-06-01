
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
import { CreateCloudChannelDialog } from "@/components/create-cloud-channel-dialog";
import type { CloudFolder, CloudFile, DownloadQueueItemType, ExtendedFile, DialogFilter, CloudChannelType } from "@/types";
import { Button } from "@/components/ui/button";
import { RefreshCw, Loader2, LayoutPanelLeft, MessageSquare, Cloud, UploadCloud } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import * as telegramService from "@/services/telegramService";
import { ALL_CHATS_FILTER_ID } from "@/services/telegramService";


const INITIAL_MASTER_CHATS_LOAD_LIMIT = 100;
const SUBSEQUENT_MASTER_CHATS_LOAD_LIMIT = 50;
const INITIAL_SPECIFIC_FOLDER_CHATS_LOAD_LIMIT = 20;
const SUBSEQUENT_SPECIFIC_FOLDER_CHATS_LOAD_LIMIT = 20;

const INITIAL_MEDIA_LOAD_LIMIT = 20;
const SUBSEQUENT_MEDIA_LOAD_LIMIT = 20;
const DOWNLOAD_CHUNK_SIZE = 512 * 1024;
const KB_1 = 1024;
const ONE_MB = 1024 * 1024;


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
  // --- State Declarations ---
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);

  const [dialogFilters, setDialogFilters] = useState<DialogFilter[]>([]);
  const [activeDialogFilterId, setActiveDialogFilterId] = useState<number>(ALL_CHATS_FILTER_ID);
  const [activeFilterDetails, setActiveFilterDetails] = useState<DialogFilter | null>(null);
  const [isLoadingDialogFilters, setIsLoadingDialogFilters] = useState(true); 
  const [hasFetchedDialogFiltersOnce, setHasFetchedDialogFiltersOnce] = useState(false);
  const [isReorderingFolders, setIsReorderingFolders] = useState(false);

  const [chatDataCache, setChatDataCache] = useState<Map<number, CachedFolderData>>(new Map());

  const [masterChatListForFiltering, setMasterChatListForFiltering] = useState<CloudFolder[]>([]); // Not directly used for display, but ALL_CHATS_FILTER_ID cache is
  const [masterChatListPaginationForFiltering, setMasterChatListPaginationForFiltering] = useState<PaginationState>(initialPaginationState); // Tracks pagination for ALL_CHATS_FILTER_ID

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

  const [isDownloadManagerOpen, setIsDownloadManagerOpen] = useState(false);
  const [downloadQueue, setDownloadQueue] = useState<DownloadQueueItemType[]>([]);

  const [isChatSelectionDialogOpen, setIsChatSelectionDialogOpen] = useState(false);
  const [isCloudStorageSelectorOpen, setIsCloudStorageSelectorOpen] = useState(false);

  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
  const [filesToUpload, setFilesToUpload] = useState<ExtendedFile[]>([]);
  const [isUploadingFiles, setIsUploadingFiles] = useState(false);

  const [authStep, setAuthStep] = useState<AuthStep>('initial');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [phoneCode, setPhoneCode] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [lastFetchedFilterId, setLastFetchedFilterId] = useState<number | null>(null);

  const [isCreateCloudChannelDialogOpen, setIsCreateCloudChannelDialogOpen] = useState(false);
  const [isCreatingCloudChannel, setIsCreatingCloudChannel] = useState(false);

  const [appManagedCloudFolders, setAppManagedCloudFolders] = useState<CloudFolder[]>([]);
  const [isLoadingAppManagedCloudFolders, setIsLoadingAppManagedCloudFolders] = useState(true); 


  // --- Ref Declarations ---
  const activeDownloadsRef = useRef<Set<string>>(new Set());
  const downloadQueueRef = useRef<DownloadQueueItemType[]>([]);
  const browserDownloadTriggeredRef = useRef(new Set<string>());
  const videoStreamAbortControllerRef = useRef<AbortController | null>(null);
  const uploadAbortControllersRef = useRef<Map<string, AbortController>>(new Map());
  const headerRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLDivElement>(null);

  // --- Hook Instantiations ---
  const { toast } = useToast();

  // --- useCallback Declarations (Reordered for initialization safety) ---

  const handleApiError = useCallback((error: any, title: string, defaultMessage: string) => {
    // console.error(`[handleApiError] Title: ${title}, Error Message: ${error.message}, Original Error:`, error.originalErrorObject || error);
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
  }, [toast]); // handleReset removed from deps to avoid cyclic dependency


  const handleReset = useCallback(async (performServerLogout = true) => {
    // console.log("[handleReset] Called. Perform server logout:", performServerLogout);
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
    setActiveFilterDetails(defaultFilters[0]); // Ensure activeFilterDetails is also reset or set to a default
    setIsLoadingDialogFilters(true); 
    setHasFetchedDialogFiltersOnce(false);
    setLastFetchedFilterId(null);

    setAppManagedCloudFolders([]);
    setIsLoadingAppManagedCloudFolders(true); 

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
    setIsCloudStorageSelectorOpen(false); 
    setIsUploadDialogOpen(false);
    setFilesToUpload([]);
    uploadAbortControllersRef.current.forEach((controller) => {
      if (!controller.signal.aborted) controller.abort("User reset application state");
    });
    uploadAbortControllersRef.current.clear();
    setIsUploadingFiles(false);
    setIsCreateCloudChannelDialogOpen(false);
    setIsCreatingCloudChannel(false);
    // console.log("[handleReset] Completed.");
  }, [isConnected, toast, videoStreamUrl]); // handleApiError removed from here


  const fetchAppManagedCloudChannels = useCallback(async (forceRefresh = false) => {
    // console.log(`[fetchAppManagedCloudChannels] Called. Force refresh: ${forceRefresh}, IsConnected: ${isConnected}, IsLoading: ${isLoadingAppManagedCloudFolders}`);
    if (!isConnected) {
        // console.log("[fetchAppManagedCloudChannels] Skipped: Not connected.");
        setIsLoadingAppManagedCloudFolders(false);
        return;
    }
    if (!forceRefresh && appManagedCloudFolders.length > 0 && !isLoadingAppManagedCloudFolders) {
        // console.log("[fetchAppManagedCloudChannels] Skipped: Already have data and not forcing refresh.");
        return;
    }
    setIsLoadingAppManagedCloudFolders(true);
    try {
      const channels = await telegramService.fetchAndVerifyManagedCloudChannels();
      // console.log("[fetchAppManagedCloudChannels] Service returned channels:", channels);
      setAppManagedCloudFolders(channels);
      if (channels.length === 0 && forceRefresh) {
        toast({ title: "No Cloud Storage Found", description: "No app-managed cloud storage channels found. You can create one from the Cloud Storage dialog." });
      } else if (channels.length > 0 && forceRefresh) {
        toast({ title: "Cloud Storage Refreshed", description: `Found ${channels.length} app-managed cloud channels.` });
      }
    } catch (error: any) {
      handleApiError(error, "Error Fetching Cloud Channels", "Could not load app-managed cloud channels.");
      setAppManagedCloudFolders([]);
    } finally {
      setIsLoadingAppManagedCloudFolders(false);
      // console.log("[fetchAppManagedCloudChannels] Finished.");
    }
  }, [isConnected, handleApiError, appManagedCloudFolders.length, isLoadingAppManagedCloudFolders, toast]);

  const fetchAndCacheDialogs = useCallback(async (
    cacheKeyToFetch: number,
    isLoadingMore: boolean,
    folderIdForApiCall?: number,
    customLimit?: number
  ) => {
    // console.log(`[fetchAndCacheDialogs] Called for cacheKey ${cacheKeyToFetch}. IsLoadingMore: ${isLoadingMore}, FolderIdForApiCall: ${folderIdForApiCall}, CustomLimit: ${customLimit}`);
    const existingCacheEntry = chatDataCache.get(cacheKeyToFetch);
    if (existingCacheEntry?.isLoading) {
      // console.log(`[fetchAndCacheDialogs] Skipped: Already loading for cacheKey ${cacheKeyToFetch}.`);
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

    const limitToUse = customLimit !== undefined ? customLimit :
                     (isLoadingMore
                        ? (folderIdForApiCall === undefined ? SUBSEQUENT_MASTER_CHATS_LOAD_LIMIT : SUBSEQUENT_SPECIFIC_FOLDER_CHATS_LOAD_LIMIT)
                        : (folderIdForApiCall === undefined ? INITIAL_MASTER_CHATS_LOAD_LIMIT : INITIAL_SPECIFIC_FOLDER_CHATS_LOAD_LIMIT));
    // console.log(`[fetchAndCacheDialogs] Limit set to: ${limitToUse} for cacheKey ${cacheKeyToFetch}`);
    try {
      const response = await telegramService.getTelegramChats(
        limitToUse,
        currentPagination.offsetDate,
        currentPagination.offsetId,
        currentPagination.offsetPeer,
        folderIdForApiCall
      );
      // console.log(`[fetchAndCacheDialogs] Response for cacheKey ${cacheKeyToFetch}:`, response);

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
      // console.log(`[fetchAndCacheDialogs] Combined folders count for cacheKey ${cacheKeyToFetch}: ${combinedFolders.length}`);

      setChatDataCache(prev => {
        const updatedCache = new Map(prev);
        updatedCache.set(cacheKeyToFetch, {
          folders: combinedFolders,
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
        // Update masterChatListForFiltering and its pagination if ALL_CHATS_FILTER_ID was fetched
        setMasterChatListForFiltering(combinedFolders); // Though primarily derived from cache, good to keep this state if used elsewhere directly
        setMasterChatListPaginationForFiltering({
            offsetDate: response.nextOffsetDate,
            offsetId: response.nextOffsetId,
            offsetPeer: response.nextOffsetPeer,
            hasMore: response.hasMore,
        });
        //  console.log(`[fetchAndCacheDialogs] Updated masterChatList state for ALL_CHATS_FILTER_ID. Count: ${combinedFolders.length}, HasMore: ${response.hasMore}`);
      }
      const currentFilterTitle = dialogFilters.find(f => f.id === folderIdForApiCall)?.title || (folderIdForApiCall === undefined ? 'All Chats' : `Folder ID ${folderIdForApiCall}`);
      if (response.folders.length > 0) {
           if (!isLoadingMore) toast({ title: `Chats Loaded!`, description: `Loaded ${response.folders.length} chats for "${currentFilterTitle}".` });
      } else if (!response.hasMore && !isLoadingMore){
           toast({ title: "No Chats Found", description: `Chat list for "${currentFilterTitle}" appears to be empty.`, variant: "default" });
      }

    } catch (error: any) {
      let errorMsg = error.message || "Failed to load chats.";
      let errorTypeForCache = 'GENERAL_ERROR';
      const currentFilterTitle = dialogFilters.find(f => f.id === folderIdForApiCall)?.title || (folderIdForApiCall === undefined ? 'All Chats' : `Folder ID ${folderIdForApiCall}`);
      // console.error(`[fetchAndCacheDialogs] Error for cacheKey ${cacheKeyToFetch}:`, errorMsg, error.originalErrorObject || error);

      if (error.message?.includes('FOLDER_ID_INVALID') && folderIdForApiCall !== undefined) {
        errorMsg = `Folder "${currentFilterTitle}" (ID: ${folderIdForApiCall}) is invalid. Will attempt to show matching chats from 'All Chats' if applicable.`;
        errorTypeForCache = 'FOLDER_ID_INVALID_FALLBACK';
        toast({ title: `Folder Load Issue for "${currentFilterTitle}"`, description: errorMsg, variant: "default", duration: 7000 });
      } else {
        handleApiError(error, `Error loading chats for "${currentFilterTitle}"`, errorMsg);
      }

      setChatDataCache(prev => { // Use latest from cache to avoid overwriting good data
        const latestCacheData = prev.get(cacheKeyToFetch);
        return new Map(prev).set(cacheKeyToFetch, {
          folders: isLoadingMore ? (latestCacheData?.folders || []) : [],
          pagination: { ...(isLoadingMore ? (latestCacheData?.pagination || initialPaginationState) : initialPaginationState), hasMore: false },
          isLoading: false,
          error: errorTypeForCache,
        });
      });

      if (cacheKeyToFetch === ALL_CHATS_FILTER_ID) {
        setMasterChatListForFiltering(isLoadingMore ? masterChatListForFiltering : []);
        setMasterChatListPaginationForFiltering(prev => ({ ...prev, hasMore: false }));
      }
    } finally {
      //  console.log(`[fetchAndCacheDialogs] Finished for cacheKey ${cacheKeyToFetch}.`);
    }
  }, [chatDataCache, handleApiError, toast, masterChatListForFiltering, dialogFilters]);


  const fetchDialogFilters = useCallback(async () => {
    // console.log(`[fetchDialogFilters] Called. IsConnected: ${isConnected}, HasFetchedOnce: ${hasFetchedDialogFiltersOnce}, Current filters length: ${dialogFilters.length}`);
    if (!isConnected) {
        // console.warn("[fetchDialogFilters] Skipped, not connected.");
        setIsLoadingDialogFilters(false);
        return;
    }
    if (hasFetchedDialogFiltersOnce && dialogFilters.length > 1) { 
      // console.log("[fetchDialogFilters] Skipped, already fetched and populated sufficiently.");
      setIsLoadingDialogFilters(false);
      return;
    }
    setIsLoadingDialogFilters(true);
    try {
      const filtersFromServer = await telegramService.getDialogFilters();
      // console.log("[fetchDialogFilters] Filters from server:", filtersFromServer);
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
            
      processedFilters.sort((a, b) => {
        if (a.id === ALL_CHATS_FILTER_ID) return -1;
        if (b.id === ALL_CHATS_FILTER_ID) return 1;
        const originalFilters = filtersFromServer || [];
        return (originalFilters.findIndex(df => df.id === a.id)) - (originalFilters.findIndex(df => df.id === b.id));
      });
      
      // console.log("[fetchDialogFilters] Processed and sorted filters:", processedFilters);
      setDialogFilters(processedFilters);
      setHasFetchedDialogFiltersOnce(true);
      
      const currentActiveStillExists = processedFilters.some(f => f.id === activeDialogFilterId);
      if (!currentActiveStillExists && processedFilters.length > 0) {
        // console.log("[fetchDialogFilters] Current active filter no longer exists or default needed, setting to ALL_CHATS_FILTER_ID.");
        setActiveDialogFilterId(ALL_CHATS_FILTER_ID); // This will trigger useEffect to set activeFilterDetails
      } else if (processedFilters.length === 0) {
        // console.warn("[fetchDialogFilters] No filters processed, setting active to ALL_CHATS_FILTER_ID with default.")
        setActiveDialogFilterId(ALL_CHATS_FILTER_ID);
        setDialogFilters([{ _:'dialogFilterDefault', id: ALL_CHATS_FILTER_ID, title: "All Chats", flags:0, pinned_peers: [], include_peers: [], exclude_peers: [] }])
      }

      // Pre-load chats for "All Chats" and specific folders
      if (processedFilters.length > 0) {
        // console.log("[fetchDialogFilters] Pre-loading initial chats after processing filters.");
        await fetchAndCacheDialogs(ALL_CHATS_FILTER_ID, false, undefined, INITIAL_MASTER_CHATS_LOAD_LIMIT);
        
        for (const filter of processedFilters) {
          if (filter._ === 'dialogFilter' && filter.id !== ALL_CHATS_FILTER_ID) {
            await fetchAndCacheDialogs(filter.id, false, filter.id, INITIAL_SPECIFIC_FOLDER_CHATS_LOAD_LIMIT);
          }
        }
      }

    } catch (error: any) {
      handleApiError(error, "Error Fetching Folders", "Could not load your chat folders.");
      const defaultFiltersOnError: DialogFilter[] = [{ _:'dialogFilterDefault', id: ALL_CHATS_FILTER_ID, title: "All Chats", flags:0, pinned_peers: [], include_peers: [], exclude_peers: [] }];
      setDialogFilters(defaultFiltersOnError);
      setActiveDialogFilterId(ALL_CHATS_FILTER_ID);
      setHasFetchedDialogFiltersOnce(false); 
    } finally {
      setIsLoadingDialogFilters(false);
      // console.log("[fetchDialogFilters] Finished.");
    }
  }, [isConnected, handleApiError, activeDialogFilterId, hasFetchedDialogFiltersOnce, dialogFilters.length, fetchAndCacheDialogs]);


  const fetchDataForActiveFilter = useCallback((isLoadingMore: boolean) => {
    // console.log(`[fetchDataForActiveFilter] Called. IsConnected: ${isConnected}, ActiveFilterDetails:`, activeFilterDetails, `IsLoadingMore: ${isLoadingMore}`);
    if (!isConnected || !activeFilterDetails) {
      //  console.log(`[fetchDataForActiveFilter] Bailing: isConnected=${isConnected}, activeFilterDetails is null or undefined.`);
       return;
    }

    const currentFilterId = activeFilterDetails.id;
    const filterType = activeFilterDetails._;
    const cachedEntry = chatDataCache.get(currentFilterId);
    
    if (filterType === 'dialogFilterDefault') { // "All Chats"
      fetchAndCacheDialogs(currentFilterId, isLoadingMore);
    } else if (filterType === 'dialogFilter') { // Specific folder
      if (cachedEntry?.error === 'FOLDER_ID_INVALID_FALLBACK') {
        // If specific folder fetch failed and we are in fallback mode, fetch more from 'All Chats'
        if (masterChatListPaginationForFiltering.hasMore && !chatDataCache.get(ALL_CHATS_FILTER_ID)?.isLoading) {
          fetchAndCacheDialogs(ALL_CHATS_FILTER_ID, isLoadingMore);
        }
      } else {
        // Regular fetch for this specific folder
        fetchAndCacheDialogs(currentFilterId, isLoadingMore, currentFilterId);
      }
    } else if (filterType === 'dialogFilterChatlist') { // Chatlist (relies on 'All Chats')
      if (masterChatListPaginationForFiltering.hasMore && !chatDataCache.get(ALL_CHATS_FILTER_ID)?.isLoading) {
         fetchAndCacheDialogs(ALL_CHATS_FILTER_ID, isLoadingMore);
      }
    }
  }, [isConnected, activeFilterDetails, fetchAndCacheDialogs, masterChatListPaginationForFiltering, chatDataCache]);


  const loadMoreDisplayedChats = useCallback(async () => {
    // console.log(`[loadMoreDisplayedChats] Called. ActiveFilterDetails:`, activeFilterDetails, `IsLoadingDisplayedChats: ${isLoadingDisplayedChats}`);
    if (!activeFilterDetails || isLoadingDisplayedChats) return;

    const filterType = activeFilterDetails._;
    const currentFilterId = activeFilterDetails.id;
    const cachedEntry = chatDataCache.get(currentFilterId);
    const masterCacheEntry = chatDataCache.get(ALL_CHATS_FILTER_ID);

    if (filterType === 'dialogFilterDefault') { // "All Chats"
        if (masterCacheEntry?.pagination.hasMore && !masterCacheEntry.isLoading) {
            fetchDataForActiveFilter(true);
        }
    } else if (filterType === 'dialogFilter') { // Specific folder
      if (cachedEntry?.error === 'FOLDER_ID_INVALID_FALLBACK') {
        // Fallback uses master list pagination
        if (masterCacheEntry?.pagination.hasMore && !masterCacheEntry.isLoading) {
          fetchDataForActiveFilter(true);
        }
      } else if (cachedEntry?.pagination.hasMore && !cachedEntry.isLoading) {
        // Direct load from specific folder's cache
        fetchDataForActiveFilter(true);
      }
    } else if (filterType === 'dialogFilterChatlist') { // Chatlist (uses master)
      if (masterCacheEntry?.pagination.hasMore && !masterCacheEntry.isLoading) {
        fetchDataForActiveFilter(true);
      }
    }
  }, [activeFilterDetails, isLoadingDisplayedChats, chatDataCache, fetchDataForActiveFilter]);


  const checkExistingConnection = useCallback(async () => {
    // console.log("[checkExistingConnection] Called.");
    setIsLoadingDialogFilters(true);
    setIsLoadingAppManagedCloudFolders(true);
    try {
      const previouslyConnected = await telegramService.isUserConnected();
      // console.log("[checkExistingConnection] Previously connected status from service:", previouslyConnected);
      if (previouslyConnected) {
        const storedUser = telegramService.getUserSessionDetails();
        if (storedUser && storedUser.phone) setPhoneNumber(storedUser.phone);
        
        setIsConnected(true); // Set connected state true
        setAuthStep('initial');
        setAuthError(null);
        
        // console.log("[checkExistingConnection] isConnected set to true. Fetching app managed cloud channels...");
        await fetchAppManagedCloudChannels(); 
        // console.log("[checkExistingConnection] Done fetching cloud channels. Now checking/fetching dialog filters.");
        
        if (!hasFetchedDialogFiltersOnce || dialogFilters.length <= 1) {
            await fetchDialogFilters(); 
        } else {
            //  console.log("[checkExistingConnection] Dialog filters already fetched and populated, skipping re-fetch.");
             setIsLoadingDialogFilters(false);
        }
      } else {
        // console.log("[checkExistingConnection] Not previously connected or session invalid.");
        setIsConnected(false);
        setPhoneNumber('');
        setAuthStep('initial');
        setAuthError(null);
        handleReset(false); // Perform reset without server logout
        setHasFetchedDialogFiltersOnce(false);
        setIsLoadingDialogFilters(false);
      }
    } catch (error: any) {
      const errorMessage = error.message || (error.originalErrorObject?.error_message);
      // console.error("[checkExistingConnection] Error:", errorMessage, error);
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
    } finally {
        setIsLoadingAppManagedCloudFolders(false); 
        // console.log("[checkExistingConnection] Finished.");
    }
  }, [toast, handleApiError, fetchDialogFilters, hasFetchedDialogFiltersOnce, dialogFilters.length, handleReset, fetchAppManagedCloudChannels]);


  const fetchInitialChatMedia = useCallback(async (folder: CloudFolder) => {
    // console.log(`[fetchInitialChatMedia] Called for folder: ${folder.name}, isCloud: ${folder.isAppManagedCloud}`);
    if (!folder.inputPeer && !folder.isAppManagedCloud) {
      toast({ title: "Error", description: "Cannot load media: InputPeer data is missing for this chat.", variant: "destructive" });
      return;
    }
    if (folder.isAppManagedCloud) {
        toast({ title: "Cloud Storage Selected", description: `Browsing content for "${folder.name}" will be implemented soon.` });
        setCurrentChatMedia([]);
        setIsLoadingChatMedia(false);
        setHasMoreChatMedia(false);
        return;
    }

    setIsLoadingChatMedia(true);
    setCurrentChatMedia([]);
    setHasMoreChatMedia(true);
    setCurrentMediaOffsetId(0);
    toast({ title: `Loading Media for ${folder.name}`, description: "Fetching initial media items..." });

    try {
      const response = await telegramService.getChatMediaHistory(folder.inputPeer!, INITIAL_MEDIA_LOAD_LIMIT, 0);
      // console.log(`[fetchInitialChatMedia] Media response for ${folder.name}:`, response);
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
      // console.log(`[fetchInitialChatMedia] Finished for ${folder.name}.`);
    }
  },[toast, handleApiError]);


  const loadMoreChatMediaCallback = useCallback(async () => {
    // console.log(`[loadMoreChatMediaCallback] Called. isLoading: ${isLoadingChatMedia}, hasMore: ${hasMoreChatMedia}, selectedFolder:`, selectedFolder);
    if (isLoadingChatMedia || !hasMoreChatMedia || !selectedFolder?.inputPeer || selectedFolder?.isAppManagedCloud) return;

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

  const peerToKey = useCallback((peer: any): string | null => {
    if (!peer) return null;
    if (peer._ === 'inputPeerUser') return `user:${String(peer.user_id)}`;
    if (peer._ === 'inputPeerChat') return `chat:${String(peer.chat_id)}`;
    if (peer._ === 'inputPeerChannel') return `channel:${String(peer.channel_id)}`;
    return null;
  }, []);

  const handleSelectFolder = (folderId: string) => {
    // console.log(`[handleSelectFolder] Regular chat folder selected: ${folderId}`);
    const folder = displayedChats.find(f => f.id === folderId);
    if (folder) {
      setSelectedFolder(folder);
      fetchInitialChatMedia(folder);
      setIsChatSelectionDialogOpen(false);
    } else {
      // console.warn(`[handleSelectFolder] Folder with ID ${folderId} not found in displayedChats.`);
      setSelectedFolder(null);
      setCurrentChatMedia([]);
    }
  };

  const handleSelectCloudChannel = (channelId: string) => {
    // console.log(`[handleSelectCloudChannel] Cloud channel selected: ${channelId}`);
    const channel = appManagedCloudFolders.find(c => c.id === channelId);
    if (channel) {
      setSelectedFolder(channel);
      fetchInitialChatMedia(channel); 
      setIsCloudStorageSelectorOpen(false);
    } else {
      // console.warn(`[handleSelectCloudChannel] Cloud channel with ID ${channelId} not found.`);
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
        
        // console.log("[handleSignIn] Sign-in successful. Fetching app managed cloud channels...");
        await fetchAppManagedCloudChannels(); 
        // console.log("[handleSignIn] Done fetching cloud channels. Now checking/fetching dialog filters.");
        if (!hasFetchedDialogFiltersOnce || dialogFilters.length <= 1) { 
            await fetchDialogFilters(); 
        } else {
            // console.log("[handleSignIn] Dialog filters already fetched, skipping re-fetch.");
            setIsLoadingDialogFilters(false); // Ensure loader is off if skipping
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
        
        // console.log("[handleCheckPassword] 2FA successful. Fetching app managed cloud channels...");
        await fetchAppManagedCloudChannels(); 
        // console.log("[handleCheckPassword] Done fetching cloud channels. Now checking/fetching dialog filters.");
         if (!hasFetchedDialogFiltersOnce || dialogFilters.length <= 1) { 
            await fetchDialogFilters(); 
        } else {
            // console.log("[handleCheckPassword] Dialog filters already fetched, skipping re-fetch.");
            setIsLoadingDialogFilters(false); // Ensure loader is off
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
    if (selectedFolder?.isAppManagedCloud) {
        toast({title: "Download Not Supported Yet", description: "Downloading from Cloud Storage channels will be implemented later."});
        return;
    }
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
        await new Promise(resolve => setTimeout(resolve, 50)); 
    }

    toast({ title: "Preparing Download...", description: `Getting details for ${file.name}.` });
    const downloadInfo = await telegramService.prepareFileDownloadInfo(file);

    if (downloadInfo && downloadInfo.location && downloadInfo.totalSize > 0 && file.totalSizeInBytes) {
      const controller = new AbortController();
      const newItem: DownloadQueueItemType = {
        ...file,
        status: 'queued', 
        progress: 0,
        downloadedBytes: 0,
        currentOffset: 0,
        chunks: [],
        location: downloadInfo.location,
        totalSizeInBytes: file.totalSizeInBytes,
        abortController: controller,
        error_message: undefined,
      };
      setDownloadQueue(prevQueue => {
        const filteredQueue = prevQueue.filter(item => item.id !== file.id);
        return [...filteredQueue, newItem];
      });
      setIsDownloadManagerOpen(true);
      toast({ title: "Download Queued", description: `${file.name} added to queue.` });
    } else {
      toast({ title: "Download Failed", description: `Could not prepare ${file.name} for download. File info missing or invalid. Size: ${file.totalSizeInBytes}, downloadInfo: ${JSON.stringify(downloadInfo)}`, variant: "destructive" });
    }
  }, [toast, selectedFolder]);

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
        browserDownloadTriggeredRef.current.delete(itemId);
        const originalFileProps: CloudFile = {
            id: itemToResume.id,
            name: itemToResume.name,
            type: itemToResume.type,
            size: itemToResume.size,
            timestamp: itemToResume.timestamp,
            url: itemToResume.url,
            dataAiHint: itemToResume.dataAiHint,
            messageId: itemToResume.messageId,
            telegramMessage: itemToResume.telegramMessage,
            totalSizeInBytes: itemToResume.totalSizeInBytes,
            inputPeer: itemToResume.inputPeer,
        };
        setDownloadQueue(prevQ => prevQ.filter(q => q.id !== itemId));
        setTimeout(() => { 
            handleQueueDownload(originalFileProps);
        }, 50);
        toast({ title: "Retrying Download", description: `Retrying download for ${itemToResume.name}.`});
        return;
    }

    setDownloadQueue(prevQueue =>
        prevQueue.map(item =>
            item.id === itemId && item.status === 'paused' ?
            {...item, status: 'downloading', error_message: undefined } 
            : item
        )
    );
    toast({ title: "Download Resumed", description: `Download for item has been resumed.`});
  }, [toast, handleQueueDownload]);

  const handleViewImage = useCallback((file: CloudFile) => {
    if (selectedFolder?.isAppManagedCloud) {
        toast({title: "View Not Supported Yet", description: "Viewing images from Cloud Storage channels will be implemented later."});
        return;
    }
    if (file.type === 'image' && file.url) {
      setViewingImageUrl(file.url);
      setViewingImageName(file.name);
      setIsImageViewerOpen(true);
    } else if (file.type === 'image' && !file.url) {
      toast({ title: "Preview Not Available", description: "Image URL not available for preview. Try downloading first.", variant: "default"});
    } else if (file.type !== 'image') {
      toast({ title: "Not an Image", description: "This file is not an image and cannot be viewed here.", variant: "default"});
    }
  }, [toast, selectedFolder]);

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

        if (limitForApiCallVideo <= 0) break; 

        const chunkResponse = await telegramService.downloadFileChunk(downloadInfo.location, currentOffset, limitForApiCallVideo, signal);

        if (signal.aborted) throw new Error("Video preparation aborted during chunk download.");

        if (chunkResponse?.bytes && chunkResponse.bytes.length > 0) {
          chunks.push(chunkResponse.bytes);
          downloadedBytes += chunkResponse.bytes.length;
          currentOffset += chunkResponse.bytes.length;
        } else if (chunkResponse?.errorType) {
          // console.error("Error during video chunk download:", chunkResponse.errorType);
          throw new Error(`Failed to download video chunk: ${chunkResponse.errorType}`);
        } else if (chunkResponse?.isCdnRedirect){
            // console.warn("CDN Redirect encountered during video stream prep. This path is not fully handled for video streaming yet. Try regular download.");
            throw new Error("CDN Redirect not fully handled during video stream preparation. Try regular download.");
        } else {
          if (downloadedBytes < totalSize) { 
            // console.warn(`Video chunk download for ${file.name} returned empty/unexpected bytes before completion. Downloaded: ${downloadedBytes}/${totalSize}. Resp:`, chunkResponse);
          }
          break; 
        }
      }

      if (signal.aborted) throw new Error("Video preparation aborted after download loop.");
      const mimeType = file.telegramMessage?.mime_type || 'video/mp4';
      const videoBlob = new Blob(chunks, { type: mimeType });
      const objectURL = URL.createObjectURL(videoBlob);

      setVideoStreamUrl(objectURL); 
      setPlayingVideoUrl(objectURL); 
      toast({ title: "Video Ready", description: `${file.name} is ready for playback.` });

    } catch (error: any) {
      if (error.message?.includes("aborted")) {
        toast({ title: "Video Preparation Cancelled", description: `Preparation for ${file.name} was cancelled.`, variant: "default" });
      } else {
        toast({ title: "Video Preparation Failed", description: `Could not prepare ${file.name}: ${error.message}`, variant: "destructive" });
      }
      setPlayingVideoUrl(null); 
      setIsVideoPlayerOpen(false); 
    }
  }, [toast]);

  const prepareAndPlayVideoStream = useCallback(async (file: CloudFile) => {
    if (isPreparingVideoStream && preparingVideoStreamForFileId === file.id) {
      toast({ title: "Already Preparing", description: `Still preparing ${file.name}. Please wait.`, variant: "default" });
      setIsVideoPlayerOpen(true); 
      return;
    }

    if (videoStreamAbortControllerRef.current && !videoStreamAbortControllerRef.current.signal.aborted) {
      videoStreamAbortControllerRef.current.abort("New video stream preparation requested");
    }
    if (videoStreamUrl) {
      URL.revokeObjectURL(videoStreamUrl);
      setVideoStreamUrl(null);
    }

    setPlayingVideoUrl(null); 
    setPlayingVideoName(file.name);
    setIsPreparingVideoStream(true);
    setPreparingVideoStreamForFileId(file.id);
    setIsVideoPlayerOpen(true); 

    const newController = new AbortController();
    videoStreamAbortControllerRef.current = newController;

    try {
        await fetchVideoAndCreateStreamUrl(file, newController.signal);
    } catch (error) {
        //  if (!newController.signal.aborted) { 
            // console.error("Unexpected error during video stream preparation orchestrator:", error);
        // }
    } finally {
        if (videoStreamAbortControllerRef.current === newController) {
            setIsPreparingVideoStream(false);
            setPreparingVideoStreamForFileId(null);
        }
    }
  }, [isPreparingVideoStream, preparingVideoStreamForFileId, videoStreamUrl, fetchVideoAndCreateStreamUrl, toast]);

  const handlePlayVideo = useCallback((file: CloudFile) => {
     if (selectedFolder?.isAppManagedCloud) {
        toast({title: "Playback Not Supported Yet", description: "Playing videos from Cloud Storage channels will be implemented later."});
        return;
    }
     if (file.type === 'video') {
        if (file.url) { 
            setPlayingVideoUrl(file.url);
            setPlayingVideoName(file.name);
            setIsPreparingVideoStream(false); 
            setPreparingVideoStreamForFileId(null);
            setIsVideoPlayerOpen(true);
        } else if (file.totalSizeInBytes && file.totalSizeInBytes > 0) { 
            prepareAndPlayVideoStream(file);
        } else {
            toast({ title: "Playback Not Possible", description: "Video data or size is missing, cannot play.", variant: "default"});
        }
    } else {
      toast({ title: "Not a Video", description: "This file is not a video and cannot be played here.", variant: "default"});
    }
  }, [prepareAndPlayVideoStream, toast, selectedFolder]);

  const handleCloseVideoPlayer = useCallback(() => {
    setIsVideoPlayerOpen(false);
    if (isPreparingVideoStream && videoStreamAbortControllerRef.current && !videoStreamAbortControllerRef.current.signal.aborted) {
        videoStreamAbortControllerRef.current.abort("Video player closed during preparation");
    }
    setIsPreparingVideoStream(false);
    setPreparingVideoStreamForFileId(null);

    if (videoStreamUrl) {
        URL.revokeObjectURL(videoStreamUrl);
        setVideoStreamUrl(null);
    }
    setPlayingVideoUrl(null); 
  }, [isPreparingVideoStream, videoStreamUrl]);

  const handleOpenDownloadManager = () => setIsDownloadManagerOpen(true);
  const handleCloseDownloadManager = () => setIsDownloadManagerOpen(false);
  
  const handleOpenChatSelectionDialog = () => setIsChatSelectionDialogOpen(true);
  const handleOpenCloudStorageSelector = () => {
    // console.log("[handleOpenCloudStorageSelector] Called.");
    fetchAppManagedCloudChannels(true); 
    setIsCloudStorageSelectorOpen(true);
  };


  const handleOpenUploadDialog = () => {
    if (!selectedFolder) {
      toast({ title: "No Chat Selected", description: "Please select a chat first to upload files to.", variant: "default" });
      return;
    }
    if (selectedFolder.isAppManagedCloud) {
        toast({ title: "Upload to Cloud Storage Not Yet Implemented", description: "Uploading files to app-managed cloud storage will be added soon.", variant: "default" });
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
    setFilesToUpload([]); 
    uploadAbortControllersRef.current.forEach((controller, id) => {
      if (!controller.signal.aborted) {
        // console.log(`Upload dialog closed, aborting upload for file ID: ${id}`);
        controller.abort("Upload dialog closed by user");
      }
    });
    uploadAbortControllersRef.current.clear();
  };

  const handleFilesSelectedForUpload = (selectedNativeFiles: FileList | null) => {
    if (selectedNativeFiles) {
      const newExtendedFiles: ExtendedFile[] = Array.from(selectedNativeFiles).map((file, index) => ({
        id: `${file.name}-${file.lastModified}-${Date.now()}-${index}`, 
        originalFile: file,
        name: file.name,
        size: file.size,
        type: file.type,
        lastModified: file.lastModified,
        uploadProgress: 0,
        uploadStatus: 'pending',
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
    if (selectedFolder.isAppManagedCloud) {
        toast({ title: "Cannot Upload Here Yet", description: "Uploading to Cloud Storage channels is not yet supported."});
        return;
    }

    setIsUploadingFiles(true);

    for (const fileToUpload of filesToAttemptUpload) {
      if (fileToUpload.uploadStatus === 'completed' || fileToUpload.uploadStatus === 'uploading' || fileToUpload.uploadStatus === 'processing') {
          // console.log(`Skipping upload for ${fileToUpload.name}, status: ${fileToUpload.uploadStatus}`);
          continue; 
      }

      const controller = new AbortController();
      uploadAbortControllersRef.current.set(fileToUpload.id, controller);

      const updateUiForFile = (fileId: string, progress: number, status: ExtendedFile['uploadStatus']) => {
        setFilesToUpload(prev =>
          prev.map(f =>
            f.id === fileId
              ? { ...f, uploadProgress: progress, uploadStatus: status }
              : f
          )
        );
      };

      updateUiForFile(fileToUpload.id, 0, 'uploading'); 

      try {
        toast({ title: `Starting Upload: ${fileToUpload.name}`, description: `Size: ${telegramService.formatFileSize(fileToUpload.size)}` });
        await telegramService.uploadFile(
          selectedFolder.inputPeer,
          fileToUpload.originalFile,
          (percent) => {
            const currentStatus = percent === 100 ? 'processing' : 'uploading';
            updateUiForFile(fileToUpload.id, percent, currentStatus);
          },
          controller.signal
        );
        updateUiForFile(fileToUpload.id, 100, 'completed');
        toast({ title: "Upload Successful!", description: `${fileToUpload.name} uploaded to ${selectedFolder.name}.` });

        if (selectedFolder && selectedFolder.id === selectedFolder?.id) { 
           fetchInitialChatMedia(selectedFolder); 
        }
      } catch (error: any) {
        if (controller.signal.aborted || error.name === 'AbortError' || error.message?.includes('aborted')) {
          updateUiForFile(fileToUpload.id, fileToUpload.uploadProgress || 0, 'cancelled');
          toast({ title: "Upload Cancelled", description: `${fileToUpload.name} upload was cancelled.`, variant: "default" });
        } else {
          updateUiForFile(fileToUpload.id, fileToUpload.uploadProgress || 0, 'failed');
          toast({ title: "Upload Failed", description: `Could not upload ${fileToUpload.name}: ${error.message}`, variant: "destructive" });
          // console.error(`Upload failed for ${fileToUpload.name}:`, error);
        }
      } finally {
        uploadAbortControllersRef.current.delete(fileToUpload.id);
      }
    }
    setIsUploadingFiles(false); 
  };

  const handleSelectDialogFilter = (filterId: number) => {
    // console.log(`[handleSelectDialogFilter] Selected filter ID: ${filterId}`);
    if (activeDialogFilterId === filterId && !isReorderingFolders) return; 
    setActiveDialogFilterId(filterId);
  };

  const handleToggleReorderFolders = async () => {
    if (isReorderingFolders) {
      const newOrder = dialogFilters
        .filter(f => f.id !== ALL_CHATS_FILTER_ID) 
        .map(f => f.id);

      // console.log("[handleToggleReorderFolders] Attempting to save new folder order:", newOrder);
      try {
        await telegramService.updateDialogFiltersOrder(newOrder);
        toast({ title: "Folder Order Saved", description: "The new folder order has been saved to Telegram." });
      } catch (error: any) {
        handleApiError(error, "Error Saving Order", "Could not save the folder order.");
        setHasFetchedDialogFiltersOnce(false); 
        await fetchDialogFilters(); 
      }
    }
    setIsReorderingFolders(prev => !prev);
  };

  const handleMoveFilter = (dragIndex: number, hoverIndex: number) => {
    const draggedFilter = dialogFilters[dragIndex];
    if (draggedFilter.id === ALL_CHATS_FILTER_ID ||
        (dialogFilters[hoverIndex] && dialogFilters[hoverIndex].id === ALL_CHATS_FILTER_ID)) {
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
      toast({ title: "Cannot Share", description: "This view cannot be shared." });
      return;
    }
    setDialogFilters(prev => prev.map(f => f.id === filterId ? { ...f, isLoading: true, inviteLink: undefined } : f));
    try {
      const result = await telegramService.exportChatlistInvite(filterId);
      if (result && result.link) {
        setDialogFilters(prev => prev.map(f => f.id === filterId ? { ...f, isLoading: false, inviteLink: result.link } : f));
        toast({
          title: "Folder Invite Link Created",
          description: `Link: ${result.link} (Copied to console)`,
        });
        // console.log(`Invite link for folder ID ${filterId}: ${result.link}`);
      } else {
        throw new Error("No link returned from server.");
      }
    } catch (error: any) {
      handleApiError(error, "Error Sharing Folder", "Could not create an invite link for this folder.");
      setDialogFilters(prev => prev.map(f => f.id === filterId ? { ...f, isLoading: false } : f));
    }
  };


  const handleOpenCreateCloudChannelDialog = () => {
    setIsCreateCloudChannelDialogOpen(true);
  };

  const handleCreateCloudChannel = async (name: string, type: CloudChannelType) => {
    setIsCreatingCloudChannel(true);
    try {
      const result = await telegramService.createManagedCloudChannel(name, type);
      if (result && result.channelInfo) {
        toast({
          title: "Cloud Storage Created!",
          description: `Channel "${result.channelInfo.title}" (ID: ${result.channelInfo.id}) created and configured.`,
        });
        setIsCreateCloudChannelDialogOpen(false);
        await fetchAppManagedCloudChannels(true); 
      } else {
        throw new Error("Channel creation did not return expected info.");
      }
    } catch (error: any) {
      handleApiError(error, "Error Creating Cloud Storage", `Could not create new cloud storage: ${error.message}`);
    } finally {
      setIsCreatingCloudChannel(false);
    }
  };


  const handleRefreshCurrentFilter = () => { 
    if (activeFilterDetails) {
        // console.log(`[handleRefreshCurrentFilter] Refreshing filter: "${activeFilterDetails.title}" (ID: ${activeFilterDetails.id})`);
        toast({ title: `Refreshing "${activeFilterDetails.title}"...`});
        
        const cacheKeyToReset = activeFilterDetails.id;
        const filterType = activeFilterDetails._;

        // Reset the specific cache entry or master list to allow re-fetch from scratch
        if (filterType === 'dialogFilterDefault') { // "All Chats"
            setChatDataCache(prev => new Map(prev).set(ALL_CHATS_FILTER_ID, { folders: [], pagination: initialPaginationState, isLoading: false, error: null}));
            setMasterChatListForFiltering([]);
            setMasterChatListPaginationForFiltering(initialPaginationState);
        } else if (filterType === 'dialogFilter' || filterType === 'dialogFilterChatlist') {
            if (chatDataCache.has(cacheKeyToReset)) {
                 setChatDataCache(prev => new Map(prev).set(cacheKeyToReset, { folders: [], pagination: initialPaginationState, isLoading: false, error: null}));
            }
            if (filterType === 'dialogFilterChatlist' || (filterType === 'dialogFilter' && chatDataCache.get(cacheKeyToReset)?.error === 'FOLDER_ID_INVALID_FALLBACK')) {
                 setChatDataCache(prev => new Map(prev).set(ALL_CHATS_FILTER_ID, { folders: [], pagination: initialPaginationState, isLoading: false, error: null}));
                 setMasterChatListForFiltering([]);
                 setMasterChatListPaginationForFiltering(initialPaginationState);
            }
        }
        setLastFetchedFilterId(null); // This forces the dataFetchOrchestrator useEffect to re-evaluate
    }
  };

  const handleRefreshCloudStorage = () => {
    // console.log("[handleRefreshCloudStorage] Called.");
    toast({ title: "Refreshing Cloud Storage List..."});
    fetchAppManagedCloudChannels(true); 
  };


  // --- useEffect Hooks ---

  useEffect(() => {
    downloadQueueRef.current = downloadQueue;
  }, [downloadQueue]);

  useEffect(() => {
    // console.log("[useEffect] Initial connection check effect running.");
    checkExistingConnection();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  useEffect(() => {
    // console.log(`[useEffect activeDialogFilterId/dialogFilters] Triggered. activeDialogFilterId: ${activeDialogFilterId}, dialogFilters count: ${dialogFilters.length}, isLoadingDialogFilters: ${isLoadingDialogFilters}, current activeFilterDetails ID: ${activeFilterDetails?.id}`);
    if (isLoadingDialogFilters) {
        // console.log("[useEffect activeDialogFilterId/dialogFilters] Bailing: isLoadingDialogFilters is true.");
        return;
    }

    let newFilter: DialogFilter | null = dialogFilters.find(f => f.id === activeDialogFilterId) || null;
    
    if (!newFilter && dialogFilters.length > 0) {
        // console.log(`[useEffect activeDialogFilterId/dialogFilters] Active filter ID ${activeDialogFilterId} not found. Defaulting to ALL_CHATS_FILTER_ID or first available.`);
        newFilter = dialogFilters.find(f => f.id === ALL_CHATS_FILTER_ID) || dialogFilters[0];
        if (newFilter && newFilter.id !== activeDialogFilterId) { 
          // console.log(`[useEffect activeDialogFilterId/dialogFilters] Setting activeDialogFilterId to ${newFilter.id} due to missing current or default needed.`);
          setActiveDialogFilterId(newFilter.id); 
          return; 
        }
    }

    if (newFilter) {
      if (activeFilterDetails?.id !== newFilter.id || activeFilterDetails?._ !== newFilter._ || activeFilterDetails?.title !== newFilter.title) {
        // console.log(`[useEffect activeDialogFilterId/dialogFilters] Setting activeFilterDetails to: ID ${newFilter.id}, Title: '${newFilter.title}', Type: ${newFilter._}`);
        setActiveFilterDetails(newFilter);
      } else {
        //  console.log(`[useEffect activeDialogFilterId/dialogFilters] New filter is same as current activeFilterDetails. No update needed.`);
      }
    } else if (dialogFilters.length === 0 && !isLoadingDialogFilters && activeFilterDetails !== null) {
      // console.log("[useEffect activeDialogFilterId/dialogFilters] No dialog filters and not loading, clearing activeFilterDetails.");
      setActiveFilterDetails(null);
    } else {
      //  console.log("[useEffect activeDialogFilterId/dialogFilters] No new filter identified or dialogFilters still empty. ActiveFilterDetails not changed.");
    }
  }, [activeDialogFilterId, dialogFilters, isLoadingDialogFilters, activeFilterDetails]);


  useEffect(() => {
    // console.log(`[useEffect dataFetchOrchestrator] Triggered. isConnected: ${isConnected}, activeFilterDetails ID: ${activeFilterDetails?.id}, isLoadingDialogFilters: ${isLoadingDialogFilters}, lastFetchedFilterId: ${lastFetchedFilterId}`);
    
    if (!isConnected || !activeFilterDetails || isLoadingDialogFilters) {
      // console.log(`[useEffect dataFetchOrchestrator] Bailing. Conditions: isConnected=${isConnected}, activeFilterDetailsIsPresent=${!!activeFilterDetails}, isLoadingDialogFilters=${isLoadingDialogFilters}`);
      return;
    }

    const filterIdToFetch = activeFilterDetails.id;
    const filterType = activeFilterDetails._;
    const isNewFilter = lastFetchedFilterId !== filterIdToFetch;
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
    // console.log(`[useEffect dataFetchOrchestrator] Filter to evaluate: ID ${filterIdToFetch}, Title: '${activeFilterDetails.title}', Type: ${filterType}. isNewFilter: ${isNewFilter}, isCurrentFilterListEmptyAndNeedsLoad: ${isCurrentFilterListEmptyAndNeedsLoad}`);
    

    if (isNewFilter || isCurrentFilterListEmptyAndNeedsLoad) {
        // console.log(`[useEffect dataFetchOrchestrator] Fetch conditions MET for filter ID ${filterIdToFetch}. Calling fetchDataForActiveFilter(false).`);
        setLastFetchedFilterId(filterIdToFetch);

        if (isNewFilter) {
            setSelectedFolder(null);
            setCurrentChatMedia([]);
            setDisplayedChats([]); 
            setCurrentErrorMessage(null);
        }
        fetchDataForActiveFilter(false); 
    } else {
        // console.log(`[useEffect dataFetchOrchestrator] Fetch conditions NOT met for filter ID ${filterIdToFetch}.`);
    }
  }, [
      isConnected, activeFilterDetails, isLoadingDialogFilters, lastFetchedFilterId,
      chatDataCache, masterChatListPaginationForFiltering.hasMore, fetchDataForActiveFilter 
  ]);


  useEffect(() => {
    // console.log(`[useEffect displayedChatsUpdater] Triggered. isConnected: ${isConnected}, activeFilterDetails ID: ${activeFilterDetails?.id}, chatDataCache size: ${chatDataCache.size}`);
    if (!isConnected || !activeFilterDetails) {
      setIsLoadingDisplayedChats(isConnecting || isLoadingDialogFilters);
      setDisplayedChats([]);
      // console.log(`[useEffect displayedChatsUpdater] Bailing or clearing. isConnected=${isConnected}, activeFilterDetailsIsPresent=${!!activeFilterDetails}. Setting isLoadingDisplayedChats to: ${isConnecting || isLoadingDialogFilters}`);
      return;
    }

    const currentFilterId = activeFilterDetails.id;
    const filterType = activeFilterDetails._;
    const cachedEntryForCurrentFilter = chatDataCache.get(currentFilterId);
    const cachedEntryForAllChats = chatDataCache.get(ALL_CHATS_FILTER_ID);
    // console.log(`[useEffect displayedChatsUpdater] Processing for filter ID: ${currentFilterId}, Type: ${filterType}, Title: '${activeFilterDetails.title}'`);
    // console.log(`[useEffect displayedChatsUpdater] Cache for current (${currentFilterId}):`, cachedEntryForCurrentFilter ? {isLoading: cachedEntryForCurrentFilter.isLoading, hasMore: cachedEntryForCurrentFilter.pagination.hasMore, count: cachedEntryForCurrentFilter.folders.length, error: cachedEntryForCurrentFilter.error} : "N/A");
    // console.log(`[useEffect displayedChatsUpdater] Cache for ALL_CHATS (${ALL_CHATS_FILTER_ID}):`, cachedEntryForAllChats ? {isLoading: cachedEntryForAllChats.isLoading, hasMore: cachedEntryForAllChats.pagination.hasMore, count: cachedEntryForAllChats.folders.length, error: cachedEntryForAllChats.error} : "N/A");

    setCurrentErrorMessage(null); 
    
    if (filterType === 'dialogFilterDefault') { 
      if (cachedEntryForAllChats) {
        setDisplayedChats(cachedEntryForAllChats.folders);
        setHasMoreDisplayedChats(cachedEntryForAllChats.pagination.hasMore);
        if (cachedEntryForAllChats.error && cachedEntryForAllChats.error !== 'FOLDER_ID_INVALID_FALLBACK') setCurrentErrorMessage(`Error for "All Chats": ${cachedEntryForAllChats.error}`);
        setIsLoadingDisplayedChats(cachedEntryForAllChats.isLoading);
        // console.log(`[useEffect displayedChatsUpdater] Set displayedChats from ALL_CHATS. Count: ${cachedEntryForAllChats.folders.length}, HasMore: ${cachedEntryForAllChats.pagination.hasMore}, IsLoading: ${cachedEntryForAllChats.isLoading}`);
      } else {
        setDisplayedChats([]); 
        setHasMoreDisplayedChats(initialPaginationState.hasMore); 
        setIsLoadingDisplayedChats(true); // Default to loading if no cache
        // console.log(`[useEffect displayedChatsUpdater] No cache for ALL_CHATS. Displayed empty, isLoading=true.`);
      }
    } else if (filterType === 'dialogFilter') { 
      if (cachedEntryForCurrentFilter?.error === 'FOLDER_ID_INVALID_FALLBACK') {
        setCurrentErrorMessage(`"${activeFilterDetails.title}" couldn't be loaded directly. Showing matching chats from 'All Chats'. Some older chats might not appear until 'All Chats' is loaded further.`);
        // console.log(`[useEffect displayedChatsUpdater] FALLBACK for '${activeFilterDetails.title}'. Using ALL_CHATS.`);
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
            // console.log(`[useEffect displayedChatsUpdater] FALLBACK: Set displayedChats from filtered ALL_CHATS. Count: ${[...pinned, ...nonPinned].length}, HasMore: ${cachedEntryForAllChats.pagination.hasMore}, IsLoading: ${cachedEntryForAllChats.isLoading}`);
        } else {
            setDisplayedChats([]);
            setHasMoreDisplayedChats(initialPaginationState.hasMore);
            setIsLoadingDisplayedChats(true); // Default to loading if no master cache
            // console.log(`[useEffect displayedChatsUpdater] FALLBACK: No cache for ALL_CHATS. Displayed empty, isLoading=true.`);
        }
      } else if (cachedEntryForCurrentFilter) { 
        setDisplayedChats(cachedEntryForCurrentFilter.folders);
        setHasMoreDisplayedChats(cachedEntryForCurrentFilter.pagination.hasMore);
        if (cachedEntryForCurrentFilter.error && cachedEntryForCurrentFilter.error !== 'FOLDER_ID_INVALID_FALLBACK') setCurrentErrorMessage(`Error for "${activeFilterDetails.title}": ${cachedEntryForCurrentFilter.error}`);
        setIsLoadingDisplayedChats(cachedEntryForCurrentFilter.isLoading);
        // console.log(`[useEffect displayedChatsUpdater] DIRECT: Set displayedChats from its own cache. Count: ${cachedEntryForCurrentFilter.folders.length}, HasMore: ${cachedEntryForCurrentFilter.pagination.hasMore}, IsLoading: ${cachedEntryForCurrentFilter.isLoading}`);
      } else {
         setDisplayedChats([]);
         setHasMoreDisplayedChats(initialPaginationState.hasMore);
         setIsLoadingDisplayedChats(true); // Default to loading if no cache for specific folder
         // console.log(`[useEffect displayedChatsUpdater] DIRECT: No cache for current filter. Displayed empty, isLoading=true.`);
      }
    } else if (filterType === 'dialogFilterChatlist') { 
      // console.log(`[useEffect displayedChatsUpdater] CHATLIST for '${activeFilterDetails.title}'. Using ALL_CHATS.`);
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
          // console.log(`[useEffect displayedChatsUpdater] CHATLIST: Set displayedChats from filtered ALL_CHATS. Count: ${[...pinned, ...nonPinned].length}, HasMore: ${cachedEntryForAllChats.pagination.hasMore}, IsLoading: ${cachedEntryForAllChats.isLoading}`);
      } else {
          setDisplayedChats([]);
          setHasMoreDisplayedChats(initialPaginationState.hasMore);
          setIsLoadingDisplayedChats(true);
          // console.log(`[useEffect displayedChatsUpdater] CHATLIST: No cache for ALL_CHATS. Displayed empty, isLoading=true.`);
      }
    }
  }, [
      isConnected, activeFilterDetails, chatDataCache, peerToKey, isConnecting, isLoadingDialogFilters
  ]);


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
                        // console.error(`CDN Hash Mismatch for ${upToDateItem.name}, block index ${currentHashBlockIndex}. Expected:`, cdnBlock.hash, "Got:", downloadedHash);
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
                        // console.error(`Logic error: actualLimitForApi is ${actualLimitForApi}, but ${bytesNeededForFileDirect} bytes still needed for ${upToDateItem.name}. Ideal: ${idealRequestSizeDirect}`);
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
                      nextReqOffset = newDownloadedBytes; 
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
              // console.error(`Failed to download chunk for ${upToDateItem.name} or no data returned. Response:`, chunkResponse, "Error Message:", errorMessage);
              setDownloadQueue(prevQ => prevQ.map(q_item => q_item.id === upToDateItem.id ? { ...q_item, status: 'failed', error_message: `Download error: ${errorMessage}` } : q_item));
            }
          } catch (error: any) {
             if (error.name === 'AbortError' || (error.message && error.message.toLowerCase().includes('aborted'))) {
                if(upToDateItem.status !== 'cancelled' && upToDateItem.status !== 'failed' && upToDateItem.status !== 'completed' ) { 
                    setDownloadQueue(prevQ => prevQ.map(q_item => q_item.id === upToDateItem.id ? { ...q_item, status: 'cancelled', error_message: "Aborted by user or system." } : q_item));
                }
             } else {
                // console.error(`Error processing download for ${upToDateItem.name}:`, error);
                setDownloadQueue(prevQ => prevQ.map(q_item => q_item.id === upToDateItem.id ? { ...q_item, status: 'failed', error_message: error.message || 'Processing error during chunk download' } : q_item));
             }
          } finally {
             activeDownloadsRef.current.delete(upToDateItem.id); 
          }
        } else if (upToDateItem.status === 'queued' && !activeDownloadsRef.current.has(upToDateItem.id)) {
            setDownloadQueue(prevQ => prevQ.map(q => q.id === upToDateItem.id ? { ...q, status: 'downloading' } : q));
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
                        //  console.error("Failed to construct new location after refreshing reference for", upToDateItem.name, "Updated Media:", updatedMediaObject);
                         setDownloadQueue(prevQ => prevQ.map(q_item => q_item.id === upToDateItem.id ? { ...q_item, status: 'failed', error_message: 'Refresh failed (new location construction error)' } : q_item));
                    }
                } else {
                    // console.warn("File reference refresh failed for", upToDateItem.name, "No new reference or media object returned.");
                    setDownloadQueue(prevQ => prevQ.map(q_item => q_item.id === upToDateItem.id ? { ...q_item, status: 'failed', error_message: 'Refresh failed (no new file_reference)' } : q_item));
                }
            } catch (refreshError: any) {
                //  console.error(`Error refreshing file reference for ${upToDateItem.name}:`, refreshError);
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


  useEffect(() => {
    return () => {
        if (videoStreamUrl) {
            URL.revokeObjectURL(videoStreamUrl);
        }
        if (videoStreamAbortControllerRef.current && !videoStreamAbortControllerRef.current.signal.aborted) {
            videoStreamAbortControllerRef.current.abort("Component unmounting");
        }
    };
  }, [videoStreamUrl]);


  // --- Return JSX ---
  if (isConnecting || (isConnected && isLoadingDialogFilters && !activeFilterDetails && !hasFetchedDialogFiltersOnce) ) {
     return (
      <div className="min-h-screen flex flex-col">
        <Header ref={headerRef} isConnected={isConnected} />
        <main className="flex-grow flex items-center justify-center text-center">
          <div>
            <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
            <p className="text-lg text-muted-foreground">
              {isConnecting ? "Connecting to Telegram..." :
               isLoadingDialogFilters && !hasFetchedDialogFiltersOnce ? "Loading your folders..." :
               "Initializing..."}
            </p>
             {/* <p className="text-sm text-muted-foreground mt-2">
                (isConnected: {String(isConnected)}, isLoadingDialogFilters: {String(isLoadingDialogFilters)}, activeFilterDetails: {String(!!activeFilterDetails)}, hasFetchedDialogFiltersOnce: {String(hasFetchedDialogFiltersOnce)})
            </p> */}
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
            setPhoneNumber={setPhoneNumber} 
            phoneCode={phoneCode}
            setPhoneCode={setPhoneCode}
            password={password}
            setPassword={setPassword}
            onReset={() => handleReset(authStep !== 'initial')} 
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


  return (
    <div className="min-h-screen flex flex-col">
      <Header
        ref={headerRef}
        isConnected={isConnected}
        onDisconnect={() => handleReset(true)}
        onOpenDownloadManager={handleOpenDownloadManager}
        onOpenChatSelectionDialog={handleOpenChatSelectionDialog}
        onOpenCloudStorageSelector={handleOpenCloudStorageSelector}
      />
      <div className="flex-1 flex overflow-hidden min-h-0"> 
        <main className="flex-1 overflow-y-auto bg-background"> 
           <div className="container mx-auto h-full px-4 sm:px-6 lg:px-8 py-4 md:py-6 lg:py-8">
            {selectedFolder ? (
                 selectedFolder.isAppManagedCloud ? (
                    <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
                        <Cloud className="w-16 h-16 mb-4 opacity-50" />
                        <p className="text-lg mb-2">Cloud Storage: {selectedFolder.name}</p>
                        <p className="text-sm mb-4">Virtual file system browsing will be implemented here.</p>
                        <Button onClick={handleOpenUploadDialog} variant="outline">
                            <UploadCloud className="mr-2 h-4 w-4" /> Upload to Cloud: {selectedFolder.name}
                        </Button>
                    </div>
                 ) : (
                    <MainContentView
                    folderName={selectedFolder.name}
                    files={currentChatMedia}
                    isLoading={isLoadingChatMedia && currentChatMedia.length === 0}
                    isLoadingMoreMedia={isLoadingChatMedia && currentChatMedia.length > 0}
                    hasMore={hasMoreChatMedia}
                    onFileDetailsClick={handleOpenFileDetails}
                    onQueueDownloadClick={handleQueueDownload}
                    onFileViewImageClick={handleViewImage}
                    onFilePlayVideoClick={handlePlayVideo}
                    onOpenUploadDialog={handleOpenUploadDialog}
                    isPreparingStream={isPreparingStream}
                    preparingStreamForFileId={preparingVideoStreamForFileId}
                    onLoadMoreMedia={loadMoreChatMediaCallback}
                    />
                 )
            ) : (
                <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
                  <LayoutPanelLeft className="w-16 h-16 mb-4 opacity-50" />
                  <p className="text-lg mb-2">No chat selected.</p>
                  <p className="text-sm mb-4">Select a chat folder or a cloud storage channel.</p>
                  <div className="flex gap-4">
                    <Button onClick={handleOpenChatSelectionDialog}>
                        <MessageSquare className="mr-2 h-5 w-5" /> Select Chat Folder
                    </Button>
                    <Button onClick={handleOpenCloudStorageSelector} variant="outline">
                        <Cloud className="mr-2 h-5 w-5" /> Select Cloud Storage
                    </Button>
                  </div>
                  {isLoadingDisplayedChats && displayedChats.length === 0 && activeFilterDetails && (
                    <div className="mt-4 flex items-center">
                      <Loader2 className="animate-spin h-5 w-5 text-primary mr-2" />
                      <span>Loading initial chat list for "{activeFilterDetails?.title || 'current folder'}"...</span>
                    </div>
                  )}
                   { !isLoadingDisplayedChats && displayedChats.length === 0 && !currentErrorMessage && isConnected && activeFilterDetails && !cachedDataForActiveFilterIsLoading(activeFilterDetails, chatDataCache) && (
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
        viewMode="default" 
        dialogFilters={dialogFilters}
        activeDialogFilterId={activeDialogFilterId}
        onSelectDialogFilter={handleSelectDialogFilter}
        isLoadingDialogFilters={isLoadingDialogFilters}
        isReorderingFolders={isReorderingFolders}
        onToggleReorderFolders={handleToggleReorderFolders}
        onMoveFilter={handleMoveFilter}
        onShareFilter={handleShareFilter}
        folders={displayedChats} 
        isLoading={isLoadingDisplayedChats && displayedChats.length === 0}
        isLoadingMore={isLoadingDisplayedChats && displayedChats.length > 0}
        hasMore={hasMoreDisplayedChats}
        selectedFolderId={selectedFolder?.id || null}
        onSelectFolder={handleSelectFolder} 
        onLoadMore={loadMoreDisplayedChats}
        onRefresh={handleRefreshCurrentFilter}
        currentErrorMessage={currentErrorMessage}
      />

      <ChatSelectionDialog
        isOpen={isCloudStorageSelectorOpen}
        onOpenChange={setIsCloudStorageSelectorOpen}
        viewMode="cloudStorage" 
        folders={appManagedCloudFolders} 
        isLoading={isLoadingAppManagedCloudFolders && appManagedCloudFolders.length === 0}
        isLoadingMore={false} 
        hasMore={false} 
        selectedFolderId={selectedFolder?.isAppManagedCloud ? selectedFolder.id : null}
        onSelectFolder={handleSelectCloudChannel} 
        onLoadMore={() => {}} 
        onRefresh={handleRefreshCloudStorage} 
        onOpenCreateCloudChannelDialog={handleOpenCreateCloudChannelDialog} 
      />

      <CreateCloudChannelDialog
        isOpen={isCreateCloudChannelDialogOpen}
        onClose={() => setIsCreateCloudChannelDialogOpen(false)}
        onCreate={handleCreateCloudChannel}
        isLoading={isCreatingCloudChannel}
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

function cachedDataForActiveFilterIsLoading(activeFilterDetails: DialogFilter | null, chatDataCache: Map<number, CachedFolderData>): boolean {
    if (!activeFilterDetails) return false;
    const filterId = activeFilterDetails.id;
    const filterType = activeFilterDetails._;
    
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
}
    
