

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
import { CreateVirtualFolderDialog } from "@/components/create-virtual-folder-dialog";
import { DeleteItemConfirmationDialog } from "@/components/delete-item-confirmation-dialog"; // New
import type { CloudFolder, CloudFile, DownloadQueueItemType, ExtendedFile, DialogFilter, CloudChannelType, CloudChannelConfigV1, InputPeer } from "@/types";
import { Button } from "@/components/ui/button";
import { RefreshCw, Loader2, LayoutPanelLeft, MessageSquare, Cloud } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import * as telegramService from "@/services/telegramService";
import { ALL_CHATS_FILTER_ID } from "@/services/telegramService";
import { normalizePath, getParentPath } from "@/lib/vfsUtils";


const INITIAL_MASTER_CHATS_LOAD_LIMIT = 100;
const SUBSEQUENT_MASTER_CHATS_LOAD_LIMIT = 50;
const INITIAL_SPECIFIC_FOLDER_CHATS_LOAD_LIMIT = 20;
const SUBSEQUENT_SPECIFIC_FOLDER_CHATS_LOAD_LIMIT = 20;

const INITIAL_MEDIA_LOAD_LIMIT = 20;
const CLOUD_CHANNEL_INITIAL_MESSAGES_LOAD_LIMIT = 100;
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

const defaultAllChatsFilter: DialogFilter = {
  _: 'dialogFilterDefault',
  id: ALL_CHATS_FILTER_ID,
  title: "All Chats",
  flags: 0,
  pinned_peers: [],
  include_peers: [],
  exclude_peers: []
};

export type ItemToDeleteType =
  | { type: 'file'; file: CloudFile; parentInputPeer?: InputPeer | null }
  | { type: 'virtualFolder'; path: string; name: string; parentInputPeer?: InputPeer | null };


export default function Home() {
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);

  const [dialogFilters, setDialogFilters] = useState<DialogFilter[]>([defaultAllChatsFilter]);
  const [activeDialogFilterId, setActiveDialogFilterId] = useState<number>(ALL_CHATS_FILTER_ID);
  const [activeFilterDetails, setActiveFilterDetails] = useState<DialogFilter | null>(defaultAllChatsFilter);
  const [isLoadingDialogFilters, setIsLoadingDialogFilters] = useState(true);
  const [hasFetchedDialogFiltersOnce, setHasFetchedDialogFiltersOnce] = useState(false);
  const [isReorderingFolders, setIsReorderingFolders] = useState(false);

  const [chatDataCache, setChatDataCache] = useState<Map<number, CachedFolderData>>(new Map());

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

  const [currentVirtualPath, setCurrentVirtualPath] = useState<string>("/");
  const [isCreateVirtualFolderDialogOpen, setIsCreateVirtualFolderDialogOpen] = useState(false);
  const [virtualFolderParentPath, setVirtualFolderParentPath] = useState<string>("/");
  const [isProcessingVirtualFolder, setIsProcessingVirtualFolder] = useState(false);

  const [itemToDelete, setItemToDelete] = useState<ItemToDeleteType | null>(null);
  const [isDeleteItemDialogOpen, setIsDeleteItemDialogOpen] = useState(false);
  const [isProcessingDeletion, setIsProcessingDeletion] = useState(false);


  const activeDownloadsRef = useRef<Set<string>>(new Set());
  const downloadQueueRef = useRef<DownloadQueueItemType[]>([]);
  const browserDownloadTriggeredRef = useRef(new Set<string>());
  const videoStreamAbortControllerRef = useRef<AbortController | null>(null);
  const uploadAbortControllersRef = useRef<Map<string, AbortController>>(new Map());
  const headerRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLDivElement>(null);
  const telegramUpdateListenerInitializedRef = useRef(false);

  const { toast } = useToast();

  const handleApiError = useCallback((error: any, title: string, defaultMessage: string) => {
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
  }, [toast]);


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

    setDialogFilters([defaultAllChatsFilter]);
    setActiveDialogFilterId(ALL_CHATS_FILTER_ID);
    setActiveFilterDetails(defaultAllChatsFilter);
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
    setCurrentVirtualPath("/");
    setIsCreateVirtualFolderDialogOpen(false);
    telegramUpdateListenerInitializedRef.current = false;
    setItemToDelete(null);
    setIsDeleteItemDialogOpen(false);
    setIsProcessingDeletion(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected, toast, videoStreamUrl]);

  const handleNewCloudChannelDiscovered = useCallback((newlyVerifiedFolder: CloudFolder, source: 'update' | 'initialScan') => {
    setAppManagedCloudFolders(prevFolders => {
        const exists = prevFolders.some(f => f.id === newlyVerifiedFolder.id);
        if (!exists) {
            if (source === 'update') {
                toast({
                    title: "New Cloud Storage Detected",
                    description: `"${newlyVerifiedFolder.name}" is now available and has been organized.`,
                });
            }
            return [...prevFolders, newlyVerifiedFolder].sort((a,b) => a.name.localeCompare(b.name));
        } else {
            return prevFolders.map(f => f.id === newlyVerifiedFolder.id ? newlyVerifiedFolder : f)
                              .sort((a,b) => a.name.localeCompare(b.name));
        }
    });
    if (source === 'update') {
        fetchDialogFilters(true);
    }
  }, [toast, fetchDialogFilters]);


  const fetchAppManagedCloudChannels = useCallback(async (forceRefresh = false) => {
    if (!isConnected && !forceRefresh) {
        setIsLoadingAppManagedCloudFolders(false);
        return;
    }
     if (!forceRefresh && appManagedCloudFolders.length > 0 && !isLoadingAppManagedCloudFolders) {
        return;
    }
    setIsLoadingAppManagedCloudFolders(true);
    try {
      const channels = await telegramService.fetchAndVerifyManagedCloudChannels();
      setAppManagedCloudFolders(channels.sort((a,b) => a.name.localeCompare(b.name)));
    } catch (error: any) {
      handleApiError(error, "Error Fetching Cloud Channels", "Could not load app-managed cloud channels.");
      setAppManagedCloudFolders([]);
    } finally {
      setIsLoadingAppManagedCloudFolders(false);
    }
  }, [isConnected, handleApiError, appManagedCloudFolders.length, isLoadingAppManagedCloudFolders]);

  const fetchAndCacheDialogs = useCallback(async (
    cacheKeyToFetch: number,
    isLoadingMore: boolean,
    folderIdForApiCall?: number,
    customLimit?: number
  ) => {
    const existingCacheEntry = chatDataCache.get(cacheKeyToFetch);
    if (existingCacheEntry?.isLoading) {
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
    try {
      const response = await telegramService.getTelegramChats(
        limitToUse,
        currentPagination.offsetDate,
        currentPagination.offsetId,
        currentPagination.offsetPeer,
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
        setMasterChatListForFiltering(combinedFolders);
        setMasterChatListPaginationForFiltering({
            offsetDate: response.nextOffsetDate,
            offsetId: response.nextOffsetId,
            offsetPeer: response.nextOffsetPeer,
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
        handleApiError(error, `Error loading chats for "${currentFilterTitle}"`, errorMsg);
      }

      setChatDataCache(prev => {
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
    }
  }, [chatDataCache, handleApiError, toast, masterChatListForFiltering, dialogFilters]);


  const fetchDialogFilters = useCallback(async (forceRefresh = false) => {
    if (!isConnected) {
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
        processedFilters.unshift({ ...defaultAllChatsFilter });
      }


      processedFilters.sort((a, b) => {
        if (a.id === ALL_CHATS_FILTER_ID) return -1;
        if (b.id === ALL_CHATS_FILTER_ID) return 1;
        const originalFilters = filtersFromServer || [];
        return (originalFilters.findIndex(df => df.id === a.id)) - (originalFilters.findIndex(df => df.id === b.id));
      });

      setDialogFilters(processedFilters.length > 0 ? processedFilters : [defaultAllChatsFilter]);
      setHasFetchedDialogFiltersOnce(true);

      const currentActiveStillExists = (processedFilters.length > 0 ? processedFilters : [defaultAllChatsFilter]).some(f => f.id === activeDialogFilterId);
      if (!currentActiveStillExists && processedFilters.length > 0) {
        setActiveDialogFilterId(ALL_CHATS_FILTER_ID);
      } else if (processedFilters.length === 0) {
        setActiveDialogFilterId(ALL_CHATS_FILTER_ID);
      }


      if ((forceRefresh || processedFilters.length > 0 || (processedFilters.length === 0 && dialogFilters.some(df => df.id === ALL_CHATS_FILTER_ID)))) {
        await fetchAndCacheDialogs(ALL_CHATS_FILTER_ID, false, undefined, INITIAL_MASTER_CHATS_LOAD_LIMIT);
        const filtersToIterate = processedFilters.length > 0 ? processedFilters : dialogFilters;
        for (const filter of filtersToIterate) {
          if (filter._ === 'dialogFilter' && filter.id !== ALL_CHATS_FILTER_ID) {
            await fetchAndCacheDialogs(filter.id, false, filter.id, INITIAL_SPECIFIC_FOLDER_CHATS_LOAD_LIMIT);
          }
        }
      }
    } catch (error: any) {
      handleApiError(error, "Error Fetching Folders", "Could not load your chat folders.");
      setDialogFilters([defaultAllChatsFilter]);
      setActiveDialogFilterId(ALL_CHATS_FILTER_ID);
      setHasFetchedDialogFiltersOnce(false);
    } finally {
      setIsLoadingDialogFilters(false);
    }
  }, [isConnected, handleApiError, activeDialogFilterId, hasFetchedDialogFiltersOnce, dialogFilters, fetchAndCacheDialogs, isReorderingFolders]);


  const fetchDataForActiveFilter = useCallback((isLoadingMore: boolean) => {
    if (!isConnected || !activeFilterDetails) {
       return;
    }

    const currentFilterId = activeFilterDetails.id;
    const filterType = activeFilterDetails._;

    if (filterType === 'dialogFilterDefault') {
      fetchAndCacheDialogs(ALL_CHATS_FILTER_ID, isLoadingMore);
    } else if (filterType === 'dialogFilter') {
      fetchAndCacheDialogs(currentFilterId, isLoadingMore, currentFilterId);
    } else if (filterType === 'dialogFilterChatlist') {
      fetchAndCacheDialogs(ALL_CHATS_FILTER_ID, isLoadingMore);
    }
  }, [isConnected, activeFilterDetails, fetchAndCacheDialogs]);


  const loadMoreDisplayedChats = useCallback(async () => {
    if (!activeFilterDetails || isLoadingDisplayedChats) return;

    const filterType = activeFilterDetails._;
    const currentFilterId = activeFilterDetails.id;
    const cachedEntry = chatDataCache.get(currentFilterId);
    const masterCacheEntry = chatDataCache.get(ALL_CHATS_FILTER_ID);

    if (filterType === 'dialogFilterDefault') {
        if (masterCacheEntry?.pagination.hasMore && !masterCacheEntry.isLoading) {
            fetchDataForActiveFilter(true);
        }
    } else if (filterType === 'dialogFilter') {
      if (cachedEntry?.error === 'FOLDER_ID_INVALID_FALLBACK') {
        if (masterCacheEntry?.pagination.hasMore && !masterCacheEntry.isLoading) {
          fetchAndCacheDialogs(ALL_CHATS_FILTER_ID, true);
        }
      } else if (cachedEntry?.pagination.hasMore && !cachedEntry.isLoading) {
        fetchDataForActiveFilter(true);
      }
    } else if (filterType === 'dialogFilterChatlist') {
      if (masterCacheEntry?.pagination.hasMore && !masterCacheEntry.isLoading) {
        fetchAndCacheDialogs(ALL_CHATS_FILTER_ID, true);
      }
    }
  }, [activeFilterDetails, isLoadingDisplayedChats, chatDataCache, fetchDataForActiveFilter]);


  const checkExistingConnection = useCallback(async () => {
    setIsLoadingDialogFilters(true);
    setIsLoadingAppManagedCloudFolders(true);
    try {
      const previouslyConnected = await telegramService.isUserConnected();
      if (previouslyConnected) {
        const storedUser = telegramService.getUserSessionDetails();
        if (storedUser && storedUser.phone) setPhoneNumber(storedUser.phone);

        setIsConnected(true);
        setAuthStep('initial');
        setAuthError(null);

        await Promise.all([
            fetchAppManagedCloudChannels(true),
            fetchDialogFilters(true)
        ]);

        if (!telegramUpdateListenerInitializedRef.current) {
            telegramService.initializeTelegramUpdateListener(handleNewCloudChannelDiscovered);
            telegramUpdateListenerInitializedRef.current = true;
        }

      } else {
        setIsConnected(false);
        setPhoneNumber('');
        setAuthStep('initial');
        setAuthError(null);
        handleReset(false);
        setHasFetchedDialogFiltersOnce(false);
        setIsLoadingDialogFilters(false);
        setIsLoadingAppManagedCloudFolders(false);
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
      setDialogFilters([defaultAllChatsFilter]);
      setActiveDialogFilterId(ALL_CHATS_FILTER_ID);
      setActiveFilterDetails(defaultAllChatsFilter);
      setHasFetchedDialogFiltersOnce(false);
      setIsLoadingDialogFilters(false);
      setIsLoadingAppManagedCloudFolders(false);
    }
  }, [toast, handleApiError, fetchDialogFilters, fetchAppManagedCloudChannels, handleReset, handleNewCloudChannelDiscovered]);


  const fetchInitialChatMedia = useCallback(async (folder: CloudFolder) => {
    if (!folder.inputPeer && !folder.isAppManagedCloud) {
      toast({ title: "Error", description: "Cannot load media: InputPeer data is missing for this chat.", variant: "destructive" });
      return;
    }

    setIsLoadingChatMedia(true);
    setCurrentChatMedia([]);
    setHasMoreChatMedia(true);
    setCurrentMediaOffsetId(0);
    setCurrentVirtualPath("/");

    const isCloud = folder.isAppManagedCloud || false;
    const mediaLimit = isCloud ? CLOUD_CHANNEL_INITIAL_MESSAGES_LOAD_LIMIT : INITIAL_MEDIA_LOAD_LIMIT;

    toast({ title: `Loading ${isCloud ? 'Content' : 'Media'} for ${folder.name}`, description: "Fetching initial items..." });

    try {
      const response = await telegramService.getChatMediaHistory(
          folder.inputPeer!,
          mediaLimit,
          0,
          isCloud
      );
      setCurrentChatMedia(response.files);
      setCurrentMediaOffsetId(response.nextOffsetId || 0);
      setHasMoreChatMedia(response.hasMore);
      if (response.files.length === 0 && !response.hasMore) {
          toast({ title: `No ${isCloud ? 'Content' : 'Media'} Found`, description: `No items in ${folder.name}.`});
      } else if (response.files.length > 0) {
           toast({ title: `${isCloud ? 'Content' : 'Media'} Loaded`, description: `Loaded ${response.files.length} initial items for ${folder.name}.`});
      }
    } catch (error: any) {
      handleApiError(error, `Error Fetching ${isCloud ? 'Content' : 'Media'} for ${folder.name}`, `Could not load items. ${error.message}`);
      setHasMoreChatMedia(false);
    } finally {
      setIsLoadingChatMedia(false);
    }
  },[toast, handleApiError]);


  const loadMoreChatMediaCallback = useCallback(async () => {
    if (isLoadingChatMedia || !hasMoreChatMedia || !selectedFolder?.inputPeer) return;

    setIsLoadingChatMedia(true);
    const isCloud = selectedFolder.isAppManagedCloud || false;
    toast({ title: `Loading More ${isCloud ? 'Content' : 'Media'} for ${selectedFolder.name}`, description: "Fetching next batch..." });
    try {
      const response = await telegramService.getChatMediaHistory(
          selectedFolder.inputPeer,
          SUBSEQUENT_MEDIA_LOAD_LIMIT,
          currentMediaOffsetId,
          isCloud
      );
      setCurrentChatMedia(prev => [...prev, ...response.files]);
      setCurrentMediaOffsetId(response.nextOffsetId || 0);
      setHasMoreChatMedia(response.hasMore);
       if (response.files.length > 0) {
           toast({ title: `More ${isCloud ? 'Content' : 'Media'} Loaded`, description: `Loaded ${response.files.length} additional items.`});
      } else if (!response.hasMore) {
           toast({ title: `All ${isCloud ? 'Content' : 'Media'} Loaded`, description: `No more items to load for ${selectedFolder.name}.`});
      }
    } catch (error: any) {
      handleApiError(error, `Error Loading More ${isCloud ? 'Content' : 'Media'}`, `Could not load more items. ${error.message}`);
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
    const folder = displayedChats.find(f => f.id === folderId);
    if (folder) {
      setSelectedFolder(folder);
      setCurrentVirtualPath("/");
      fetchInitialChatMedia(folder);
      setIsChatSelectionDialogOpen(false);
    } else {
      setSelectedFolder(null);
      setCurrentChatMedia([]);
    }
  };

  const handleSelectCloudChannel = (channelId: string) => {
    const channel = appManagedCloudFolders.find(c => c.id === channelId);
    if (channel) {
      setSelectedFolder(channel);
      setCurrentVirtualPath("/");
      fetchInitialChatMedia(channel);
      setIsCloudStorageSelectorOpen(false);
    } else {
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

        await Promise.all([
            fetchAppManagedCloudChannels(true),
            fetchDialogFilters(true)
        ]);

        if (!telegramUpdateListenerInitializedRef.current) {
            telegramService.initializeTelegramUpdateListener(handleNewCloudChannelDiscovered);
            telegramUpdateListenerInitializedRef.current = true;
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

        await Promise.all([
            fetchAppManagedCloudChannels(true),
            fetchDialogFilters(true)
        ]);

        if (!telegramUpdateListenerInitializedRef.current) {
            telegramService.initializeTelegramUpdateListener(handleNewCloudChannelDiscovered);
            telegramUpdateListenerInitializedRef.current = true;
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
        await new Promise(resolve => setTimeout(resolve, 50));
    }

    toast({ title: "Preparing Download...", description: `Getting details for ${file.name}.` });
    const downloadInfo = await telegramService.prepareFileDownloadInfo(file);

    if (downloadInfo && downloadInfo.location && downloadInfo.totalSize > 0 && (file.totalSizeInBytes || downloadInfo.totalSize > 0) ) {
      const controller = new AbortController();
      const newItem: DownloadQueueItemType = {
        ...file,
        status: 'queued',
        progress: 0,
        downloadedBytes: 0,
        currentOffset: 0,
        chunks: [],
        location: downloadInfo.location,
        totalSizeInBytes: file.totalSizeInBytes || downloadInfo.totalSize,
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
            caption: itemToResume.caption,
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
    if (file.type === 'image' && file.url) {
      setViewingImageUrl(file.url);
      setViewingImageName(file.name);
      setIsImageViewerOpen(true);
    } else if (file.type === 'image' && !file.url) {
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

        if (limitForApiCallVideo <= 0) break;

        const chunkResponse = await telegramService.downloadFileChunk(downloadInfo.location, currentOffset, limitForApiCallVideo, signal);

        if (signal.aborted) throw new Error("Video preparation aborted during chunk download.");

        if (chunkResponse?.bytes && chunkResponse.bytes.length > 0) {
          chunks.push(chunkResponse.bytes);
          downloadedBytes += chunkResponse.bytes.length;
          currentOffset += chunkResponse.bytes.length;
        } else if (chunkResponse?.errorType) {
          throw new Error(`Failed to download video chunk: ${chunkResponse.errorType}`);
        } else if (chunkResponse?.isCdnRedirect){
            throw new Error("CDN Redirect not fully handled during video stream preparation. Try regular download.");
        } else {
          break;
        }
      }

      if (signal.aborted) throw new Error("Video preparation aborted after download loop.");
      const mimeType = file.telegramMessage?.mime_type || file.telegramMessage?.document?.mime_type || 'video/mp4';
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
    } finally {
        if (videoStreamAbortControllerRef.current === newController) {
            setIsPreparingVideoStream(false);
            setPreparingVideoStreamForFileId(null);
        }
    }
  }, [isPreparingVideoStream, preparingVideoStreamForFileId, videoStreamUrl, fetchVideoAndCreateStreamUrl, toast]);

  const handlePlayVideo = useCallback((file: CloudFile) => {
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
  }, [prepareAndPlayVideoStream, toast]);

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
    setIsCloudStorageSelectorOpen(true);
  };


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
    setFilesToUpload([]);
    uploadAbortControllersRef.current.forEach((controller, id) => {
      if (!controller.signal.aborted) {
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

    setIsUploadingFiles(true);

    for (const fileToUpload of filesToAttemptUpload) {
      if (fileToUpload.uploadStatus === 'completed' || fileToUpload.uploadStatus === 'uploading' || fileToUpload.uploadStatus === 'processing') {
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

      let captionForUpload: string | undefined = undefined;
      if (selectedFolder.isAppManagedCloud) {
        captionForUpload = JSON.stringify({ path: normalizePath(currentVirtualPath) });
      }


      try {
        toast({ title: `Starting Upload: ${fileToUpload.name}`, description: `Size: ${telegramService.formatFileSize(fileToUpload.size)}` });
        await telegramService.uploadFile(
          selectedFolder.inputPeer,
          fileToUpload.originalFile,
          (percent) => {
            const currentStatus = percent === 100 ? 'processing' : 'uploading';
            updateUiForFile(fileToUpload.id, percent, currentStatus);
          },
          controller.signal,
          captionForUpload
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
        }
      } finally {
        uploadAbortControllersRef.current.delete(fileToUpload.id);
      }
    }
    setIsUploadingFiles(false);
  };

  const handleSelectDialogFilter = (filterId: number) => {
    if (activeDialogFilterId === filterId && !isReorderingFolders) return;
    setActiveDialogFilterId(filterId);
  };

  const handleToggleReorderFolders = async () => {
    if (isReorderingFolders) {
      const newOrder = dialogFilters
        .filter(f => f.id !== ALL_CHATS_FILTER_ID)
        .map(f => f.id);

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
        if (result && result.channelInfo && result.initialConfig) {
            toast({
                title: "Cloud Storage Created!",
                description: `Channel "${result.channelInfo.title}" (ID: ${result.channelInfo.id}) created and configured.`,
            });
            setIsCreateCloudChannelDialogOpen(false);

            const newCloudFolder: CloudFolder = {
                id: `channel-${result.channelInfo.id}`,
                name: result.channelInfo.title,
                isChatFolder: false,
                inputPeer: {
                    _: 'inputPeerChannel',
                    channel_id: result.channelInfo.id,
                    access_hash: result.channelInfo.access_hash,
                },
                files: [],
                folders: [],
                isAppManagedCloud: true,
                cloudConfig: result.initialConfig,
            };

            setAppManagedCloudFolders(prevFolders => {
                const exists = prevFolders.some(f => f.id === newCloudFolder.id);
                if (exists) return prevFolders.map(f => f.id === newCloudFolder.id ? newCloudFolder : f).sort((a,b) => a.name.localeCompare(b.name));
                return [...prevFolders, newCloudFolder].sort((a,b) => a.name.localeCompare(b.name));
            });

            await fetchAppManagedCloudChannels(true);
            await fetchDialogFilters(true);
        } else {
            throw new Error("Channel creation did not return expected info including config.");
        }
    } catch (error: any) {
        handleApiError(error, "Error Creating Cloud Storage", `Could not create new cloud storage: ${error.message}`);
    } finally {
        setIsCreatingCloudChannel(false);
    }
};


  const handleRefreshCurrentFilter = () => {
    if (activeFilterDetails) {
        toast({ title: `Refreshing "${activeFilterDetails.title}"...`});

        const cacheKeyToReset = activeFilterDetails.id;
        const filterType = activeFilterDetails._;

        if (filterType === 'dialogFilterDefault') {
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
        setLastFetchedFilterId(null);
    }
  };

  const handleRefreshCloudStorage = () => {
    toast({ title: "Refreshing Cloud Storage List..."});
    fetchAppManagedCloudChannels(true);
  };

  const handleOpenCreateVirtualFolderDialog = (path: string) => {
    setVirtualFolderParentPath(path || "/");
    setIsCreateVirtualFolderDialogOpen(true);
  };

  const handleCreateVirtualFolder = async (newFolderName: string) => {
    if (!selectedFolder || !selectedFolder.isAppManagedCloud || !selectedFolder.inputPeer) {
      toast({ title: "Error", description: "No cloud channel selected or inputPeer missing.", variant: "destructive" });
      return;
    }
    setIsProcessingVirtualFolder(true);
    try {
      const updatedConfig = await telegramService.addVirtualFolderToCloudChannel(
        selectedFolder.inputPeer,
        virtualFolderParentPath,
        newFolderName
      );

      if (updatedConfig) {
        setSelectedFolder(prev => prev ? { ...prev, cloudConfig: updatedConfig } : null);
        setAppManagedCloudFolders(prevList =>
          prevList.map(cf =>
            cf.id === selectedFolder.id ? { ...cf, cloudConfig: updatedConfig } : cf
          )
        );
        toast({ title: "Virtual Folder Created", description: `Folder "${newFolderName}" created in ${selectedFolder.name} at ${virtualFolderParentPath}.` });
      } else {
        toast({ title: "Creation Failed", description: "Could not create virtual folder. Config message might not have updated. Check Telegram.", variant: "destructive" });
      }
    } catch (error: any) {
      toast({ title: "Error Creating Folder", description: error.message || "An unknown error occurred.", variant: "destructive" });
    } finally {
      setIsProcessingVirtualFolder(false);
      setIsCreateVirtualFolderDialogOpen(false);
    }
  };

  const handleNavigateVirtualPath = (path: string) => {
    setCurrentVirtualPath(normalizePath(path));
  };

  const handleDeleteFile = (file: CloudFile) => {
    if (!file.inputPeer) {
        toast({ title: "Error", description: "Cannot delete file: InputPeer is missing.", variant: "destructive" });
        return;
    }
    setItemToDelete({ type: 'file', file, parentInputPeer: file.inputPeer });
    setIsDeleteItemDialogOpen(true);
  };

  const handleDeleteVirtualFolder = (folderPath: string, folderName: string, parentInputPeer?: InputPeer | null) => {
     if (!parentInputPeer) {
        toast({ title: "Error", description: "Cannot delete virtual folder: Parent InputPeer is missing.", variant: "destructive" });
        return;
    }
    setItemToDelete({ type: 'virtualFolder', path: folderPath, name: folderName, parentInputPeer });
    setIsDeleteItemDialogOpen(true);
  };

  const confirmDeleteItem = async () => {
    if (!itemToDelete) return;
    setIsProcessingDeletion(true);

    try {
      if (itemToDelete.type === 'file') {
        const { file, parentInputPeer } = itemToDelete;
        if (!parentInputPeer) throw new Error("InputPeer missing for file deletion.");
        const success = await telegramService.deleteTelegramMessages(parentInputPeer, [file.messageId]);
        if (success) {
          toast({ title: "File Deleted", description: `File "${file.name}" has been deleted.` });
          setCurrentChatMedia(prev => prev.filter(f => f.id !== file.id));
          // If it was a VFS file, its caption is gone, so it's effectively removed from VFS
        } else {
          throw new Error("Telegram service failed to delete the message.");
        }
      } else if (itemToDelete.type === 'virtualFolder') {
        const { path, name, parentInputPeer } = itemToDelete;
        if (!parentInputPeer) throw new Error("InputPeer missing for virtual folder deletion.");

        const updatedConfig = await telegramService.removeVirtualFolderFromCloudChannel(parentInputPeer, path);
        if (updatedConfig) {
          toast({ title: "Virtual Folder Deleted", description: `Folder "${name}" has been removed from the virtual structure.` });
          setSelectedFolder(prev => prev ? { ...prev, cloudConfig: updatedConfig } : null);
          setAppManagedCloudFolders(prevList =>
            prevList.map(cf =>
              cf.id === selectedFolder?.id ? { ...cf, cloudConfig: updatedConfig } : cf
            )
          );
        } else {
          throw new Error("Failed to update cloud configuration after deleting virtual folder.");
        }
      }
    } catch (error: any) {
      handleApiError(error, `Error Deleting ${itemToDelete.type === 'file' ? 'File' : 'Virtual Folder'}`, error.message || "Could not complete deletion.");
    } finally {
      setIsProcessingDeletion(false);
      setIsDeleteItemDialogOpen(false);
      setItemToDelete(null);
    }
  };


  useEffect(() => {
    downloadQueueRef.current = downloadQueue;
  }, [downloadQueue]);

  useEffect(() => {
    checkExistingConnection();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  useEffect(() => {
    if (isLoadingDialogFilters) {
        return;
    }

    let newFilter: DialogFilter | null = dialogFilters.find(f => f.id === activeDialogFilterId) || null;

    if (!newFilter && dialogFilters.length > 0) {
        newFilter = dialogFilters.find(f => f.id === ALL_CHATS_FILTER_ID) || dialogFilters[0];
        if (newFilter && newFilter.id !== activeDialogFilterId) {
          setActiveDialogFilterId(newFilter.id);
          return;
        }
    } else if (!newFilter && dialogFilters.length === 0) {
        newFilter = defaultAllChatsFilter;
        if (activeDialogFilterId !== ALL_CHATS_FILTER_ID) {
            setActiveDialogFilterId(ALL_CHATS_FILTER_ID);
            return;
        }
    }

    if (activeFilterDetails?.id !== newFilter?.id ||
        activeFilterDetails?._ !== newFilter?._ ||
        activeFilterDetails?.title !== newFilter?.title
      ) {
        setActiveFilterDetails(newFilter);
    }
  }, [activeDialogFilterId, dialogFilters, isLoadingDialogFilters, activeFilterDetails]);


  useEffect(() => {
    if (!isConnected || !activeFilterDetails || isLoadingDialogFilters) {
      return;
    }
    const filterIdToFetch = activeFilterDetails.id;
    const isNewFilter = lastFetchedFilterId !== filterIdToFetch;

    if (isNewFilter) setCurrentErrorMessage(null);

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
            setSelectedFolder(null);
            setCurrentChatMedia([]);
            setCurrentVirtualPath("/");
        }
        setLastFetchedFilterId(filterIdToFetch);
        fetchDataForActiveFilter(false);
    }
  }, [
      isConnected, activeFilterDetails, isLoadingDialogFilters, lastFetchedFilterId,
      chatDataCache, masterChatListPaginationForFiltering.hasMore, fetchDataForActiveFilter
  ]);


  useEffect(() => {
    if (!isConnected || !activeFilterDetails) {
      setIsLoadingDisplayedChats(isConnecting || isLoadingDialogFilters);
      setDisplayedChats([]);
      return;
    }

    const currentFilterId = activeFilterDetails.id;
    const filterType = activeFilterDetails._;
    const cachedEntryForCurrentFilter = chatDataCache.get(currentFilterId);
    const cachedEntryForAllChats = chatDataCache.get(ALL_CHATS_FILTER_ID);

    if(lastFetchedFilterId !== currentFilterId) setCurrentErrorMessage(null);


    if (filterType === 'dialogFilterDefault') {
      if (cachedEntryForAllChats) {
        setDisplayedChats(cachedEntryForAllChats.folders);
        setHasMoreDisplayedChats(cachedEntryForAllChats.pagination.hasMore);
        if (cachedEntryForAllChats.error && cachedEntryForAllChats.error !== 'FOLDER_ID_INVALID_FALLBACK') setCurrentErrorMessage(`Error for "All Chats": ${cachedEntryForAllChats.error}`);
        setIsLoadingDisplayedChats(cachedEntryForAllChats.isLoading);
      } else {
        setDisplayedChats([]);
        setHasMoreDisplayedChats(initialPaginationState.hasMore);
        setIsLoadingDisplayedChats(true);
      }
    } else if (filterType === 'dialogFilter') {
      if (cachedEntryForCurrentFilter?.error === 'FOLDER_ID_INVALID_FALLBACK') {
        setCurrentErrorMessage(`"${activeFilterDetails.title}" couldn't be loaded directly. Showing matching chats from 'All Chats'.`);

        const masterCacheIsEmptyOrStale = !cachedEntryForAllChats || (cachedEntryForAllChats.folders.length === 0 && cachedEntryForAllChats.pagination.hasMore);
        const masterCacheIsNotLoading = !cachedEntryForAllChats?.isLoading;

        if (masterCacheIsEmptyOrStale && masterCacheIsNotLoading) {
          fetchAndCacheDialogs(ALL_CHATS_FILTER_ID, false);
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
            setHasMoreDisplayedChats(initialPaginationState.hasMore);
            setIsLoadingDisplayedChats(true);
        }
      } else if (cachedEntryForCurrentFilter) {
        setDisplayedChats(cachedEntryForCurrentFilter.folders);
        setHasMoreDisplayedChats(cachedEntryForCurrentFilter.pagination.hasMore);
        if (cachedEntryForCurrentFilter.error && cachedEntryForCurrentFilter.error !== 'FOLDER_ID_INVALID_FALLBACK') setCurrentErrorMessage(`Error for "${activeFilterDetails.title}": ${cachedEntryForCurrentFilter.error}`);
        setIsLoadingDisplayedChats(cachedEntryForCurrentFilter.isLoading);
      } else {
         setDisplayedChats([]);
         setHasMoreDisplayedChats(initialPaginationState.hasMore);
         setIsLoadingDisplayedChats(true);
      }
    } else if (filterType === 'dialogFilterChatlist') {
        setCurrentErrorMessage(null);
        const masterCacheIsEmptyOrStale = !cachedEntryForAllChats || (cachedEntryForAllChats.folders.length === 0 && cachedEntryForAllChats.pagination.hasMore);
        const masterCacheIsNotLoading = !cachedEntryForAllChats?.isLoading;

        if (masterCacheIsEmptyOrStale && masterCacheIsNotLoading) {
          fetchAndCacheDialogs(ALL_CHATS_FILTER_ID, false);
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
          setHasMoreDisplayedChats(initialPaginationState.hasMore);
          setIsLoadingDisplayedChats(true);
      }
    }
  }, [
      isConnected, activeFilterDetails, chatDataCache, peerToKey, isConnecting, isLoadingDialogFilters, lastFetchedFilterId, fetchAndCacheDialogs
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
                            const fullFileBlob = new Blob(upToDateItem.chunks, { type: upToDateItem.telegramMessage?.mime_type || upToDateItem.telegramMessage?.document?.mime_type || 'application/octet-stream' });
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
                        setDownloadQueue(prev => prevQ.map(q => q.id === upToDateItem.id ? { ...q, status: 'failed', error_message: 'CDN blocks exhausted before completion' } : q));
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
                            const fullFileBlob = new Blob(upToDateItem.chunks, { type: upToDateItem.telegramMessage?.mime_type || upToDateItem.telegramMessage?.document?.mime_type || 'application/octet-stream' });
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
                        const fullFileBlob = new Blob(newChunks, { type: q_item.telegramMessage?.mime_type || q_item.telegramMessage?.document?.mime_type || 'application/octet-stream' });
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
              setDownloadQueue(prevQ => prevQ.map(q_item => q_item.id === upToDateItem.id ? { ...q_item, status: 'failed', error_message: `Download error: ${errorMessage}` } : q_item));
            }
          } catch (error: any) {
             if (error.name === 'AbortError' || (error.message && error.message.toLowerCase().includes('aborted'))) {
                if(upToDateItem.status !== 'cancelled' && upToDateItem.status !== 'failed' && upToDateItem.status !== 'completed' ) {
                    setDownloadQueue(prevQ => prevQ.map(q_item => q_item.id === upToDateItem.id ? { ...q_item, status: 'cancelled', error_message: "Aborted by user or system." } : q_item));
                }
             } else {
                setDownloadQueue(prev => prevQ.map(q_item => q_item.id === upToDateItem.id ? { ...q_item, status: 'failed', error_message: error.message || 'Processing error during chunk download' } : q_item));
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
                    const actualMediaForRefresh = updatedMediaObject.media ? updatedMediaObject.media : updatedMediaObject;

                    if ((actualMediaForRefresh._ === 'photo' || actualMediaForRefresh._ === 'messageMediaPhoto') && actualMediaForRefresh.id && actualMediaForRefresh.access_hash && actualMediaForRefresh.file_reference) {
                        const photoData = actualMediaForRefresh.photo || actualMediaForRefresh;
                        const largestSize = photoData.sizes?.find((s: any) => s.type === 'y') || photoData.sizes?.sort((a: any, b: any) => (b.w * b.h) - (a.w * a.h))[0];
                        newLocation = {
                            _: 'inputPhotoFileLocation',
                            id: photoData.id,
                            access_hash: photoData.access_hash,
                            file_reference: photoData.file_reference,
                            thumb_size: largestSize?.type || '',
                        };
                    } else if ((actualMediaForRefresh._ === 'document' || actualMediaForRefresh._ === 'messageMediaDocument') && actualMediaForRefresh.id && actualMediaForRefresh.access_hash && actualMediaForRefresh.file_reference) {
                         const docData = actualMediaForRefresh.document || actualMediaForRefresh;
                         newLocation = {
                            _: 'inputDocumentFileLocation',
                            id: docData.id,
                            access_hash: docData.access_hash,
                            file_reference: docData.file_reference,
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
                         setDownloadQueue(prevQ => prevQ.map(q_item => q_item.id === upToDateItem.id ? { ...q_item, status: 'failed', error_message: 'Refresh failed (new location construction error)' } : q_item));
                    }
                } else {
                    setDownloadQueue(prevQ => prevQ.map(q_item => q_item.id === upToDateItem.id ? { ...q_item, status: 'failed', error_message: 'Refresh failed (no new file_reference)' } : q_item));
                }
            } catch (refreshError: any) {
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


  if (!isConnected && !isConnecting) {
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
           <div className="container mx-auto h-full px-0 sm:px-0 lg:px-0 py-0 md:py-0 lg:py-0">
            {selectedFolder ? (
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
                    isPreparingStream={isPreparingVideoStream}
                    preparingStreamForFileId={preparingVideoStreamForFileId}
                    onLoadMoreMedia={loadMoreChatMediaCallback}
                    isCloudChannel={selectedFolder.isAppManagedCloud || false}
                    cloudConfig={selectedFolder.cloudConfig}
                    currentVirtualPath={currentVirtualPath}
                    onNavigateVirtualPath={handleNavigateVirtualPath}
                    onOpenCreateVirtualFolderDialog={handleOpenCreateVirtualFolderDialog}
                    onDeleteFile={handleDeleteFile}
                    onDeleteVirtualFolder={handleDeleteVirtualFolder}
                    selectedFolderInputPeer={selectedFolder.inputPeer}
                 />
            ) : (
                <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground p-4">
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

      <CreateVirtualFolderDialog
        isOpen={isCreateVirtualFolderDialogOpen}
        onClose={() => setIsCreateVirtualFolderDialogOpen(false)}
        onCreate={handleCreateVirtualFolder}
        isLoading={isProcessingVirtualFolder}
        parentPath={virtualFolderParentPath}
      />

      <DeleteItemConfirmationDialog
        isOpen={isDeleteItemDialogOpen}
        onClose={() => setIsDeleteItemDialogOpen(false)}
        onConfirm={confirmDeleteItem}
        isLoading={isProcessingDeletion}
        itemName={itemToDelete?.type === 'file' ? itemToDelete.file.name : itemToDelete?.name || "item"}
        itemType={itemToDelete?.type || "item"}
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

    