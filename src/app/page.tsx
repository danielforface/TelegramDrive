
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
import { DeleteItemConfirmationDialog } from "@/components/delete-item-confirmation-dialog";
import { ManageCloudChannelDialog } from "@/components/manage-cloud-channel-dialog";
import type { CloudFolder, DialogFilter, CloudChannelType, CloudFile, OrganizationMode, GlobalDriveConfigV1 } from "@/types";
import { Button } from "@/components/ui/button";
import { Loader2, LayoutPanelLeft, MessageSquare, Cloud, Globe } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import * as telegramService from '@/services/telegramService';

// Import Custom Hooks
import { useAuthManager } from "@/hooks/features/useAuthManager";
import { useConnectionManager } from "@/hooks/features/useConnectionManager";
import { useDialogFiltersManager } from "@/hooks/features/useDialogFiltersManager";
import { useChatListManager } from "@/hooks/features/useChatListManager";
import { useAppCloudChannelsManager } from "@/hooks/features/useAppCloudChannelsManager";
import { useSelectedMediaManager } from "@/hooks/features/useSelectedMediaManager";
import { useFileOperationsManager } from "@/hooks/features/useFileOperationsManager";
import { useMediaPreviewManager } from "@/hooks/features/useMediaPreviewManager";
import { useDownloadManager } from "@/hooks/features/useDownloadManager";
import { useUploadManager } from "@/hooks/features/useUploadManager";
import { usePageDialogsVisibility } from "@/hooks/features/usePageDialogsVisibility";
import { useGlobalDriveManager } from "@/hooks/features/useGlobalDriveManager";
import { useGlobalDriveConfigManager } from "@/hooks/features/useGlobalDriveConfigManager";


export default function Home() {
  const { toast } = useToast();
  const headerRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLDivElement>(null);

  const [isGlobalDriveActive, setIsGlobalDriveActive] = useState(false);
  const [organizationMode, setOrganizationMode] = useState<OrganizationMode>('default');

  const connectionManagerRef = useRef<ReturnType<typeof useConnectionManager> | null>(null);

  const handleGlobalApiError = useCallback((error: any, title: string, defaultMessage: string, doPageReset: boolean = false) => {
    let description = defaultMessage;
    if (error && typeof error.message === 'string' && error.message.length > 0) {
        description = error.message;
    } else if (error && typeof error.toString === 'function') {
        const errStr = error.toString();
        if (errStr !== '[object Object]') description = errStr;
    }

    toast({ title, description, variant: "destructive", duration: doPageReset ? 10000 : 5000 });
    if (doPageReset) {
      // Access the current handleReset function via the ref inside the callback
      // This avoids making handleGlobalApiError dependent on the potentially changing handleReset function reference.
      const cm = connectionManagerRef.current;
      if (cm) {
        cm.handleReset(error.message !== 'AUTH_RESTART');
      }
    }
  }, [toast]);


  const pageDialogs = usePageDialogsVisibility();
  const {
    setIsChatSelectionDialogOpen: pageDialogsSetIsChatSelectionDialogOpen,
    setIsCreateVirtualFolderDialogOpen: pageDialogsSetIsCreateVirtualFolderDialogOpen,
    virtualFolderParentPath: pageDialogsVirtualFolderParentPath,
    setVirtualFolderParentPath: pageDialogsSetVirtualFolderParentPath,
  } = pageDialogs;


  const authManager = useAuthManager({
    onAuthSuccess: (user) => connectionManagerRef.current?.onAuthSuccessMain(user),
    setGlobalIsConnecting: (isConn) => connectionManagerRef.current?.setIsConnecting(isConn),
    setGlobalPhoneNumberForDisplay: (phone) => connectionManagerRef.current?.setAppPhoneNumber(phone),
    toast,
    handleGlobalApiError,
  });
  const {
      authStep: amAuthStep,
      handleSendCode: amHandleSendCode,
      setAuthPhoneCode: amSetAuthPhoneCode,
      handleSignIn: amHandleSignIn,
      setAuthPassword: amSetAuthPassword,
      handleCheckPassword: amHandleCheckPassword,
      authError: amAuthError,
      authInputPhoneNumber: amAuthInputPhoneNumber,
      setAuthInputPhoneNumber: amSetAuthInputPhoneNumber,
      authPhoneCode: amAuthPhoneCode,
      authPassword: amAuthPassword,
      resetAuthVisuals: amResetAuthVisuals,
      setAuthStep: amSetAuthStep,
  } = authManager;


  const globalDriveManager = useGlobalDriveManager({
    toast,
    handleGlobalApiError,
    isConnected: false,
  });
  const {
    globalMediaItems: gdGlobalMediaItems,
    isLoading: gdIsLoading,
    hasMore: gdHasMore,
    statusMessage: gdStatusMessage,
    fetchInitialGlobalMedia: gdFetchInitialGlobalMedia,
    loadMoreGlobalMedia: gdLoadMoreGlobalMedia,
    resetManager: gdResetManager,
    isScanBatchActive: gdIsScanBatchActive,
    setGlobalMediaItemsDirectly: gdSetGlobalMediaItemsDirectly,
    setIsConnected: gdmSetIsConnected,
  } = globalDriveManager;


  const globalDriveConfigManager = useGlobalDriveConfigManager({
    toast,
    handleGlobalApiError,
    isConnected: false,
  });
  const {
    customConfig: gdcCustomConfig,
    isLoadingConfig: gdcIsLoadingConfig,
    configError: gdcConfigError,
    loadOrCreateConfig: gdcLoadOrCreateConfig,
    resetConfigState: gdcResetConfigState,
    addVirtualFolderInConfig: gdcAddVirtualFolderInConfig,
    removeVirtualFolderFromConfig: gdcRemoveVirtualFolderFromConfig,
    setIsConnected: gdcmSetIsConnected,
  } = globalDriveConfigManager;


  const dialogFiltersManager = useDialogFiltersManager({
    isConnected: false,
    toast,
    handleGlobalApiError,
    fetchAndCacheDialogsForListManager: (cacheKeyToFetch, isLoadingMore, folderIdForApiCall, customLimit) =>
      chatListManager.fetchAndCacheDialogsForList(cacheKeyToFetch, isLoadingMore, folderIdForApiCall, customLimit),
    setLastFetchedFilterIdForChatListManager: (filterId) =>
      chatListManager.setLastFetchedFilterIdForChatList(filterId),
    setChatsDataCacheForFilter: (filterId, data) => chatListManager.setChatsDataCacheForFilter(filterId, data),
    resetMasterChatListForFilteringInCache: () => chatListManager.resetMasterChatListForFilteringInCache(),
    updateMasterChatListInCache: (folders, pagination) => chatListManager.updateMasterChatListInCache(folders, pagination),
    getChatDataCacheEntry: (key) => chatListManager.getChatDataCacheEntry(key),
  });
  const {
    dialogFilters: dfmDialogFilters,
    activeDialogFilterId: dfmActiveDialogFilterId,
    activeFilterDetails: dfmActiveFilterDetails,
    isLoadingDialogFilters: dfmIsLoadingDialogFilters,
    hasFetchedDialogFiltersOnce: dfmHasFetchedDialogFiltersOnce,
    isReorderingFolders: dfmIsReorderingFolders,
    fetchDialogFilters: dfmFetchDialogFilters,
    handleSelectDialogFilter: dfmHandleSelectDialogFilter,
    handleToggleReorderFolders: dfmHandleToggleReorderFolders,
    handleMoveFilter: dfmHandleMoveFilter,
    handleShareFilter: dfmHandleShareFilter,
    handleRefreshCurrentFilterView: dfmHandleRefreshCurrentFilterView,
    defaultAllChatsFilter: dfmDefaultAllChatsFilter,
    resetDialogFiltersState: dfmResetDialogFiltersState,
    setActiveDialogFilterId: dfmSetActiveDialogFilterId,
    setActiveFilterDetails: dfmSetActiveFilterDetails,
    setIsConnected: dfmSetIsConnected,
  } = dialogFiltersManager;


  const chatListManager = useChatListManager({
    isConnected: false,
    activeFilterDetails: dfmActiveFilterDetails, // Pass the state from dialogFiltersManager
    dialogFilters: dfmDialogFilters, // Pass the state from dialogFiltersManager
    toast,
    handleGlobalApiError,
    resetSelectedMedia: () => {
      selectedMediaManager?.resetSelectedMedia();
      if (isGlobalDriveActive) {
          setIsGlobalDriveActive(false);
          gdResetManager();
          gdcResetConfigState();
          setOrganizationMode('default');
      }
    },
    setClipboardItem: (item) => fileOperationsManager?.setClipboardItem(item),
  });
  const {
    displayedChats: clmDisplayedChats,
    isLoadingDisplayedChats: clmIsLoadingDisplayedChats,
    hasMoreDisplayedChats: clmHasMoreDisplayedChats,
    currentErrorMessageForChatList: clmCurrentErrorMessageForChatList,
    loadMoreDisplayedChatsInManager: clmLoadMoreDisplayedChatsInManager,
    resetAllChatListData: clmResetAllChatListData,
    cachedDataForActiveFilterIsLoading: clmCachedDataForActiveFilterIsLoading,
    setIsConnected: clmSetIsConnected,
  } = chatListManager;

  const appCloudChannelsManager = useAppCloudChannelsManager({
    isConnected: false,
    toast,
    handleGlobalApiError,
  });
  const {
    appManagedCloudFolders: accmAppManagedCloudFolders,
    isLoadingAppManagedCloudFolders: accmIsLoadingAppManagedCloudFolders,
    fetchAppManagedCloudChannelsList: accmFetchAppManagedCloudChannelsList,
    handleNewCloudChannelVerifiedAndUpdateList: accmHandleNewCloudChannelVerifiedAndUpdateList,
    addCreatedCloudChannelToList: accmAddCreatedCloudChannelToList,
    resetAppManagedCloudFolders: accmResetAppManagedCloudFolders,
    setAppManagedCloudFolders: accmSetAppManagedCloudFolders,
    setIsConnected: accmSetIsConnected,
  } = appCloudChannelsManager;


  const selectedMediaManager = useSelectedMediaManager({
    toast,
    handleGlobalApiError,
    displayedChatsFromChatList: clmDisplayedChats,
    appManagedCloudFoldersFromManager: accmAppManagedCloudFolders,
    setClipboardItem: (item) => fileOperationsManager?.setClipboardItem(item),
  });
  const {
    selectedFolder: smSelectedFolder,
    setSelectedFolder: smSetSelectedFolder,
    currentChatMedia: smCurrentChatMedia,
    setCurrentChatMedia: smSetCurrentChatMedia,
    isLoadingChatMedia: smIsLoadingChatMedia,
    hasMoreChatMedia: smHasMoreChatMedia,
    currentVirtualPath: smCurrentVirtualPath,
    handleSelectFolderOrChannel: smHandleSelectFolderOrChannel,
    fetchInitialChatMediaForSelected: smFetchInitialChatMediaForSelected,
    loadMoreChatMediaForSelected: smLoadMoreChatMediaForSelected,
    handleNavigateVirtualPath: smHandleNavigateVirtualPath,
    resetSelectedMedia: smResetSelectedMedia,
    updateSelectedFolderConfig: smUpdateSelectedFolderConfig,
  } = selectedMediaManager;

  const fileOperationsManager = useFileOperationsManager({
    toast,
    handleGlobalApiError,
    selectedFolder: isGlobalDriveActive ? null : smSelectedFolder,
    currentVirtualPath: isGlobalDriveActive ? "/" : smCurrentVirtualPath,
    currentChatMedia: isGlobalDriveActive ? gdGlobalMediaItems : smCurrentChatMedia,
    setCurrentChatMedia: isGlobalDriveActive ? gdSetGlobalMediaItemsDirectly : smSetCurrentChatMedia,
    updateSelectedFolderConfig: smUpdateSelectedFolderConfig,
    setAppManagedCloudFoldersState: accmSetAppManagedCloudFolders,
    fetchInitialChatMediaForSelectedManager: smFetchInitialChatMediaForSelected,
  });
  const {
    selectedFileForDetails: foSelectedFileForDetails,
    isDetailsPanelOpen: foIsDetailsPanelOpen,
    itemToDelete: foItemToDelete,
    isDeleteItemDialogOpen: foIsDeleteItemDialogOpen,
    isProcessingDeletion: foIsProcessingDeletion,
    clipboardItem: foClipboardItem,
    isProcessingVirtualFolder: foIsProcessingVirtualFolder,
    handleOpenFileDetails: foHandleOpenFileDetails,
    handleCloseFileDetails: foHandleCloseFileDetails,
    handleRequestDeleteItem: foHandleRequestDeleteItem,
    handleConfirmDeletion: foHandleConfirmDeletion,
    handleCancelDeletion: foHandleCancelDeletion,
    handleCopyFileOp: foHandleCopyFileOp,
    handleCopyFolderStructureOp: foHandleCopyFolderStructureOp,
    handlePasteItemOp: foHandlePasteItemOp,
    resetFileOperations: foResetFileOperations,
    setIsProcessingVirtualFolder: foSetIsProcessingVirtualFolder,
    setIsDeleteItemDialogOpen: foSetIsDeleteItemDialogOpen,
  } = fileOperationsManager;


  const mediaPreviewManager = useMediaPreviewManager({ toast });
  const {
    isImageViewerOpen: mpvIsImageViewerOpen,
    viewingImageUrl: mpvViewingImageUrl,
    viewingImageName: mpvViewingImageName,
    isVideoPlayerOpen: mpvIsVideoPlayerOpen,
    playingVideoUrl: mpvPlayingVideoUrl,
    playingVideoName: mpvPlayingVideoName,
    isPreparingVideoStream: mpvIsPreparingVideoStream,
    preparingVideoStreamForFileId: mpvPreparingVideoStreamForFileId,
    videoStreamAbortControllerRef: mpvAbortRef,
    videoStreamUrlInternal: mpvUrlInternal,
    handleViewImage: mpvHandleViewImage,
    handleCloseImageViewer: mpvHandleCloseImageViewer,
    handlePlayVideo: mpvHandlePlayVideo,
    handleCloseVideoPlayerAndStream: mpvHandleCloseVideoPlayerAndStream,
    resetMediaPreview: mpvResetMediaPreview,
  } = mediaPreviewManager;

  const downloadManager = useDownloadManager({ toast });
  const {
    isDownloadManagerOpen: dmIsDownloadManagerOpen,
    downloadQueue: dmDownloadQueue,
    handleQueueDownloadFile: dmHandleQueueDownloadFile,
    handleCancelDownloadOp: dmHandleCancelDownloadOp,
    handlePauseDownloadOp: dmHandlePauseDownloadOp,
    handleResumeDownloadOp: dmHandleResumeDownloadOp,
    handleOpenDownloadManagerSheet: dmHandleOpenDownloadManagerSheet,
    handleCloseDownloadManagerSheet: dmHandleCloseDownloadManagerSheet,
    resetDownloadManager: dmResetDownloadManager,
    downloadQueueRefForReset: dlQueueRef,
    activeDownloadsRefForReset: dlActiveRef,
    browserDownloadTriggeredRefForReset: dlBrowserRef,
  } = downloadManager;

  const uploadManager = useUploadManager({
    toast,
    selectedFolder: isGlobalDriveActive ? null : smSelectedFolder,
    currentVirtualPath: smCurrentVirtualPath,
    refreshMediaCallback: () => {
        if (isGlobalDriveActive && gdIsScanBatchActive) {
        } else if (isGlobalDriveActive && !gdIsScanBatchActive) {
           gdFetchInitialGlobalMedia();
        } else if (smSelectedFolder) {
          smFetchInitialChatMediaForSelected(smSelectedFolder);
        }
    },
  });
  const {
    isUploadDialogOpen: ulIsUploadDialogOpen,
    filesToUpload: ulFilesToUpload,
    isUploadingFiles: ulIsUploadingFiles,
    handleOpenUploadFilesDialog: ulHandleOpenUploadFilesDialog,
    handleCloseUploadFilesDialog: ulHandleCloseUploadFilesDialog,
    handleFilesSelectedForUploadList: ulHandleFilesSelectedForUploadList,
    handleStartFileUploads: ulHandleStartFileUploads,
    resetUploadManager: ulResetUploadManager,
    uploadAbortControllersRefForReset: ulAbortRef
  } = uploadManager;


  const onChannelDetailsUpdatedForAdminHook = useCallback((updatedChannel: CloudFolder) => {
    accmSetAppManagedCloudFolders(prev =>
        prev.map(cf => cf.id === updatedChannel.id ? { ...cf, ...updatedChannel } : cf)
    );
    const currentSelectedFolderId = smSelectedFolder?.id;
    if (!isGlobalDriveActive && currentSelectedFolderId === updatedChannel.id) {
        smSetSelectedFolder(prev => prev ? { ...prev, ...updatedChannel } : null);
    }
  }, [isGlobalDriveActive, accmSetAppManagedCloudFolders, smSelectedFolder?.id, smSetSelectedFolder]);


  const tempConnectionManager = useConnectionManager({
    toast,
    onInitialConnect: async () => {
      await dfmFetchDialogFilters(true);
      await accmFetchAppManagedCloudChannelsList(true);
    },
    onResetApp: () => {
      amResetAuthVisuals();
      dfmResetDialogFiltersState();
      clmResetAllChatListData();
      accmResetAppManagedCloudFolders();
      smResetSelectedMedia();
      foResetFileOperations();
      mpvResetMediaPreview();
      dmResetDownloadManager();
      ulResetUploadManager();
      pageDialogs.resetAllDialogsVisibility();
      setIsGlobalDriveActive(false);
      gdResetManager();
      gdcResetConfigState();
      setOrganizationMode('default');
    },
    setAuthStep: amSetAuthStep,
    handleGlobalApiError,
    handleNewCloudChannelDiscoveredAppLevel: (folder, source) => {
      const listChanged = accmHandleNewCloudChannelVerifiedAndUpdateList(folder, source);
      if (listChanged && source === 'update') {
        dfmFetchDialogFilters(true);
      }
    },
    setGlobalPhoneNumberForDisplay: amSetAuthInputPhoneNumber,
    appPhoneNumber: amAuthInputPhoneNumber,
  });
  connectionManagerRef.current = tempConnectionManager;
  const connectionManager = tempConnectionManager;
  const {
    isConnected: connManagerIsConnected,
    handleReset: connManagerHandleReset,
    isConnecting: connManagerIsConnecting,
    appPhoneNumber: connManagerAppPhoneNumber,
    checkExistingConnection: connManagerCheckExistingConnection
  } = connectionManager;


  useEffect(() => {
    const isConnected = connManagerIsConnected;
    dfmSetIsConnected(isConnected);
    clmSetIsConnected(isConnected);
    accmSetIsConnected(isConnected);
    gdmSetIsConnected(isConnected);
    gdcmSetIsConnected(isConnected);
  }, [connManagerIsConnected, dfmSetIsConnected, clmSetIsConnected, accmSetIsConnected, gdmSetIsConnected, gdcmSetIsConnected]);

  useEffect(() => {
    connManagerCheckExistingConnection();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  useEffect(() => {
    if (isGlobalDriveActive && connManagerIsConnected) {
      if (!gdIsScanBatchActive) {
        gdFetchInitialGlobalMedia();
      }
      if (organizationMode === 'custom' && !gdcCustomConfig && !gdcIsLoadingConfig && !gdcConfigError) {
        gdcLoadOrCreateConfig();
      }
    } else if (!isGlobalDriveActive) {
      if (gdIsScanBatchActive) {
        gdResetManager();
      }
      gdcResetConfigState();
    }
  }, [
      isGlobalDriveActive, connManagerIsConnected, organizationMode,
      gdIsScanBatchActive, gdFetchInitialGlobalMedia, gdResetManager,
      gdcCustomConfig, gdcIsLoadingConfig, gdcConfigError, gdcLoadOrCreateConfig, gdcResetConfigState
  ]);


  useEffect(() => {
    if (dfmIsLoadingDialogFilters) return;

    const currentActiveId = dfmActiveDialogFilterId;
    const currentFilters = dfmDialogFilters;
    let newActiveFilterDetails: DialogFilter | null = null;

    if (currentFilters && currentFilters.length > 0) {
        newActiveFilterDetails = currentFilters.find(f => f.id === currentActiveId) || null;
        if (!newActiveFilterDetails && currentFilters.length > 0) {
            newActiveFilterDetails = currentFilters.find(f => f.id === telegramService.ALL_CHATS_FILTER_ID) || currentFilters[0] || null;
        }
    } else {
        newActiveFilterDetails = dfmDefaultAllChatsFilter;
    }

    const currentFilterDetailsState = dfmActiveFilterDetails;
    if (
      currentFilterDetailsState?.id !== newActiveFilterDetails?.id ||
      currentFilterDetailsState?.title !== newActiveFilterDetails?.title ||
      (!currentFilterDetailsState && newActiveFilterDetails) ||
      (currentFilterDetailsState && !newActiveFilterDetails)
    ) {
      dfmSetActiveFilterDetails(newActiveFilterDetails);
    }
  }, [
    dfmActiveDialogFilterId,
    dfmDialogFilters,
    dfmIsLoadingDialogFilters,
    dfmSetActiveFilterDetails,
    dfmDefaultAllChatsFilter,
    dfmActiveFilterDetails,
  ]);


  const performFullReset = useCallback(async (performServerLogout = true) => {
        if (mpvAbortRef.current && !mpvAbortRef.current.signal.aborted) {
            mpvAbortRef.current.abort("User reset application state");
        }
        if (mpvUrlInternal) {
            URL.revokeObjectURL(mpvUrlInternal);
        }
        dlQueueRef.current.forEach(item => {
            if (item.abortController && !item.abortController.signal.aborted) {
                item.abortController.abort("User reset application state");
            }
        });
        dlActiveRef.current.clear();
        dlBrowserRef.current.clear();
        ulAbortRef.current.forEach((controller) => {
          if (!controller.signal.aborted) controller.abort("User reset application state");
        });
        ulAbortRef.current.clear();
        await connManagerHandleReset(performServerLogout);
    }, [connManagerHandleReset, mpvAbortRef, mpvUrlInternal, dlQueueRef, dlActiveRef, dlBrowserRef, ulAbortRef]);

  const handleOpenGlobalDrive = useCallback(() => {
    if (!connManagerIsConnected) {
        toast({ title: "Not Connected", description: "Please connect to Telegram first.", variant: "default"});
        return;
    }
    smResetSelectedMedia();
    setOrganizationMode('default');
    gdcResetConfigState();
    setIsGlobalDriveActive(true);
  }, [connManagerIsConnected, toast, smResetSelectedMedia, gdcResetConfigState ]);

  const handleSetOrganizationMode = useCallback((mode: OrganizationMode) => {
    setOrganizationMode(mode);
  }, []);

  const handleCreateGlobalVirtualFolder = useCallback(async (folderName: string) => {
    if (organizationMode !== 'custom' || !gdcCustomConfig) {
      toast({ title: "Error", description: "Custom organization mode not active or config not loaded.", variant: "destructive" });
      return;
    }
    await gdcAddVirtualFolderInConfig(pageDialogsVirtualFolderParentPath, folderName);
    pageDialogsSetIsCreateVirtualFolderDialogOpen(false);
  }, [organizationMode, gdcCustomConfig, gdcAddVirtualFolderInConfig, pageDialogsVirtualFolderParentPath, pageDialogsSetIsCreateVirtualFolderDialogOpen, toast]);

  const handleDeleteGlobalVirtualFolder = useCallback(async () => {
     if (organizationMode !== 'custom' || !gdcCustomConfig || !foItemToDelete || foItemToDelete.type !== 'virtualFolder') {
      toast({ title: "Error", description: "Invalid state for deleting global virtual folder.", variant: "destructive" });
      return;
    }
    const { path, name } = foItemToDelete;
    await gdcRemoveVirtualFolderFromConfig(path, name);
    foSetIsDeleteItemDialogOpen(false);
  },[organizationMode, gdcCustomConfig, foItemToDelete, gdcRemoveVirtualFolderFromConfig, foSetIsDeleteItemDialogOpen, toast]);


  if (connManagerIsConnecting && !connManagerIsConnected && !amAuthError && amAuthStep === 'initial' && !dfmHasFetchedDialogFiltersOnce) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header ref={headerRef} isConnected={false} />
        <main className="flex-grow flex items-center justify-center text-center">
          <div>
            <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
            <p className="text-lg text-muted-foreground">
              {connManagerIsConnecting ? "Connecting to Telegram..." : "Initializing..."}
            </p>
          </div>
        </main>
        <footer ref={footerRef} className="py-3 px-4 sm:px-6 lg:px-8 text-center border-t text-xs"><p className="text-muted-foreground">Telegram Cloudifier &copy; {new Date().getFullYear()}</p></footer>
      </div>
    );
  }

  if (!connManagerIsConnected && !connManagerIsConnecting) {
    return (
      <>
        <Header ref={headerRef} isConnected={false} />
        <main className="flex-grow container mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col items-center justify-center">
          <TelegramConnect
            authStep={amAuthStep}
            onSendCode={amHandleSendCode}
            onSignIn={(code) => { amSetAuthPhoneCode(code); amHandleSignIn(code); }}
            onCheckPassword={(pw) => { amSetAuthPassword(pw); amHandleCheckPassword(pw); }}
            isLoading={connManagerIsConnecting}
            error={amAuthError}
            phoneNumber={connManagerAppPhoneNumber || amAuthInputPhoneNumber}
            setPhoneNumber={amSetAuthInputPhoneNumber}
            phoneCode={amAuthPhoneCode}
            setPhoneCode={amSetAuthPhoneCode}
            password={amAuthPassword}
            setPassword={amSetAuthPassword}
            onReset={() => performFullReset(amAuthStep !== 'initial')}
          />
        </main>
        <footer ref={footerRef} className="py-4 px-4 sm:px-6 lg:px-8 text-center border-t"><p className="text-sm text-muted-foreground">Telegram Cloudifier &copy; {new Date().getFullYear()}</p></footer>
      </>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header
        ref={headerRef}
        isConnected={connManagerIsConnected}
        onDisconnect={() => performFullReset(true)}
        onOpenDownloadManager={dmHandleOpenDownloadManagerSheet}
        onOpenChatSelectionDialog={() => { setIsGlobalDriveActive(false); pageDialogs.handleOpenChatSelectionDialog(); }}
        onOpenCloudStorageSelector={() => { setIsGlobalDriveActive(false); pageDialogs.handleOpenCloudStorageSelector(); }}
        onOpenGlobalDrive={handleOpenGlobalDrive}
      />
      <div className="flex-1 flex overflow-hidden min-h-0">
        <main className="flex-1 overflow-y-auto bg-background">
          <div className="container mx-auto h-full px-0 sm:px-0 lg:px-0 py-0 md:py-0 lg:py-0">
            {isGlobalDriveActive ? (
              <MainContentView
                folderName="Global Drive"
                files={gdGlobalMediaItems}
                isLoading={gdIsLoading && gdGlobalMediaItems.length === 0 && !gdcIsLoadingConfig}
                isLoadingMoreMedia={(gdIsLoading && gdGlobalMediaItems.length > 0) || gdcIsLoadingConfig}
                hasMore={gdHasMore || (organizationMode === 'default' && gdIsScanBatchActive)}
                onFileDetailsClick={foHandleOpenFileDetails}
                onQueueDownloadClick={dmHandleQueueDownloadFile}
                onFileViewImageClick={mpvHandleViewImage}
                onFilePlayVideoClick={mpvHandlePlayVideo}
                onOpenUploadDialog={() => toast({title: "Upload Not Available", description: "Uploads are not supported in Global Drive view."})}
                isPreparingStream={mpvIsPreparingVideoStream}
                preparingStreamForFileId={mpvPreparingVideoStreamForFileId}
                onLoadMoreMedia={gdLoadMoreGlobalMedia}
                isCloudChannel={false}
                currentVirtualPath={organizationMode === 'custom' ? pageDialogsVirtualFolderParentPath : "/"}
                onNavigateVirtualPath={(path) => { if (organizationMode === 'custom') pageDialogsSetVirtualFolderParentPath(path); else {/* no-op for default global */} }}
                onOpenCreateVirtualFolderDialog={(path) => pageDialogs.handleOpenCreateVirtualFolderDialog(path)}
                onDeleteFile={(file) => foHandleRequestDeleteItem('file', file, file.inputPeer)}
                onDeleteVirtualFolder={(path, name) => foHandleRequestDeleteItem('virtualFolder', {path, name}, undefined)}
                selectedFolderInputPeer={null}
                onCopyFile={foHandleCopyFileOp}
                onPasteItem={() => {}}
                clipboardItem={foClipboardItem}
                selectedFolderForView={null}
                onOpenManageCloudChannelDialog={() => {}}
                isGlobalView={true}
                globalStatusMessage={gdcIsLoadingConfig ? "Loading custom configuration..." : (gdcConfigError ? `Config Error: ${gdcConfigError}` : gdStatusMessage)}
                organizationMode={organizationMode}
                onSetOrganizationMode={handleSetOrganizationMode}
                customGlobalDriveConfig={gdcCustomConfig}
                isLoadingCustomGlobalDriveConfig={gdcIsLoadingConfig}
                customGlobalDriveConfigError={gdcConfigError}
                isGlobalScanActive={gdIsScanBatchActive}
              />
            ) : smSelectedFolder ? (
              <MainContentView
                folderName={smSelectedFolder.name}
                files={smCurrentChatMedia}
                isLoading={smIsLoadingChatMedia && smCurrentChatMedia.length === 0}
                isLoadingMoreMedia={smIsLoadingChatMedia && smCurrentChatMedia.length > 0}
                hasMore={smHasMoreChatMedia}
                onFileDetailsClick={foHandleOpenFileDetails}
                onQueueDownloadClick={dmHandleQueueDownloadFile}
                onFileViewImageClick={mpvHandleViewImage}
                onFilePlayVideoClick={mpvHandlePlayVideo}
                onOpenUploadDialog={ulHandleOpenUploadFilesDialog}
                isPreparingStream={mpvIsPreparingVideoStream}
                preparingStreamForFileId={mpvPreparingVideoStreamForFileId}
                onLoadMoreMedia={smLoadMoreChatMediaForSelected}
                isCloudChannel={smSelectedFolder.isAppManagedCloud || false}
                cloudConfig={smSelectedFolder.cloudConfig}
                currentVirtualPath={smCurrentVirtualPath}
                onNavigateVirtualPath={smHandleNavigateVirtualPath}
                onOpenCreateVirtualFolderDialog={pageDialogs.handleOpenCreateVirtualFolderDialog}
                onDeleteFile={(file) => foHandleRequestDeleteItem('file', file)}
                onDeleteVirtualFolder={(path, name, peer) => foHandleRequestDeleteItem('virtualFolder', { path, name }, peer)}
                selectedFolderInputPeer={smSelectedFolder.inputPeer}
                onCopyFile={foHandleCopyFileOp}
                onCopyFolderStructure={foHandleCopyFolderStructureOp}
                onPasteItem={(targetPath) => foHandlePasteItemOp(targetPath, pageDialogs.handleOpenCreateVirtualFolderDialog)}
                clipboardItem={foClipboardItem}
                selectedFolderForView={smSelectedFolder}
                onOpenManageCloudChannelDialog={pageDialogs.handleOpenManageCloudChannelDialog}
                isGlobalView={false}
                organizationMode="default"
                onSetOrganizationMode={() => {}}
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground p-4">
                <LayoutPanelLeft className="w-16 h-16 mb-4 opacity-50" />
                <p className="text-lg mb-2">No chat or view selected.</p>
                <p className="text-sm mb-4">Select a chat folder, a cloud storage channel, or open the Global Drive.</p>
                <div className="flex gap-4 flex-wrap justify-center">
                  <Button onClick={handleOpenGlobalDrive}><Globe className="mr-2 h-5 w-5" /> Open Global Drive</Button>
                  <Button onClick={() => { setIsGlobalDriveActive(false); pageDialogs.handleOpenChatSelectionDialog();}}><MessageSquare className="mr-2 h-5 w-5" /> Select Chat Folder</Button>
                  <Button onClick={() => { setIsGlobalDriveActive(false); pageDialogs.handleOpenCloudStorageSelector();}} variant="outline"><Cloud className="mr-2 h-5 w-5" /> Select Cloud Storage</Button>
                </div>
                {clmIsLoadingDisplayedChats && clmDisplayedChats.length === 0 && dfmActiveFilterDetails && (
                  <div className="mt-4 flex items-center"><Loader2 className="animate-spin h-5 w-5 text-primary mr-2" /><span>Loading initial chat list for "{dfmActiveFilterDetails?.title || 'current folder'}"...</span></div>
                )}
                {!clmIsLoadingDisplayedChats && clmDisplayedChats.length === 0 && !clmCurrentErrorMessageForChatList && connManagerIsConnected && dfmActiveFilterDetails && !clmCachedDataForActiveFilterIsLoading(dfmActiveFilterDetails) && (
                  <div className="mt-4 flex items-center text-sm"><MessageSquare className="mr-2 h-5 w-5 text-muted-foreground" /><span>Chat list for "{dfmActiveFilterDetails.title}" appears to be empty.</span></div>
                )}
                {clmCurrentErrorMessageForChatList && (
                  <div className="mt-4 p-3 bg-destructive/10 text-destructive rounded-md text-sm"><p>{clmCurrentErrorMessageForChatList}</p></div>
                )}
              </div>
            )}
          </div>
        </main>
      </div>
      <footer ref={footerRef} className="py-3 px-4 sm:px-6 lg:px-8 text-center border-t text-xs"><p className="text-muted-foreground">Telegram Cloudifier &copy; {new Date().getFullYear()}</p></footer>

      <ChatSelectionDialog
        isOpen={pageDialogs.isChatSelectionDialogOpen && !isGlobalDriveActive}
        onOpenChange={pageDialogsSetIsChatSelectionDialogOpen}
        viewMode="default"
        dialogFilters={dfmDialogFilters}
        activeDialogFilterId={dfmActiveDialogFilterId}
        onSelectDialogFilter={dfmHandleSelectDialogFilter}
        isLoadingDialogFilters={dfmIsLoadingDialogFilters}
        isReorderingFolders={dfmIsReorderingFolders}
        onToggleReorderFolders={dfmHandleToggleReorderFolders}
        onMoveFilter={dfmHandleMoveFilter}
        onShareFilter={dfmHandleShareFilter}
        folders={clmDisplayedChats}
        isLoading={clmIsLoadingDisplayedChats && clmDisplayedChats.length === 0}
        isLoadingMore={clmIsLoadingDisplayedChats && clmDisplayedChats.length > 0}
        hasMore={clmHasMoreDisplayedChats}
        selectedFolderId={smSelectedFolder?.id || null}
        onSelectFolder={(id) => { setIsGlobalDriveActive(false); smHandleSelectFolderOrChannel(id, 'chat'); pageDialogsSetIsChatSelectionDialogOpen(false);}}
        onLoadMore={clmLoadMoreDisplayedChatsInManager}
        onRefresh={dfmHandleRefreshCurrentFilterView}
        currentErrorMessage={clmCurrentErrorMessageForChatList}
      />

      <ChatSelectionDialog
        isOpen={pageDialogs.isCloudStorageSelectorOpen && !isGlobalDriveActive}
        onOpenChange={pageDialogs.setIsCloudStorageSelectorOpen}
        viewMode="cloudStorage"
        folders={accmAppManagedCloudFolders}
        isLoading={accmIsLoadingAppManagedCloudFolders && accmAppManagedCloudFolders.length === 0}
        isLoadingMore={false}
        hasMore={false}
        selectedFolderId={smSelectedFolder?.isAppManagedCloud ? smSelectedFolder.id : null}
        onSelectFolder={(id) => {setIsGlobalDriveActive(false); smHandleSelectFolderOrChannel(id, 'cloud'); pageDialogs.setIsCloudStorageSelectorOpen(false);}}
        onLoadMore={() => {}}
        onRefresh={() => accmFetchAppManagedCloudChannelsList(true)}
        onOpenCreateCloudChannelDialog={pageDialogs.handleOpenCreateCloudChannelDialog}
      />

      <CreateCloudChannelDialog
        isOpen={pageDialogs.isCreateCloudChannelDialogOpen}
        onClose={() => pageDialogs.setIsCreateCloudChannelDialogOpen(false)}
        onCreate={async (name: string, type: CloudChannelType) => {
            const result = await telegramService.createManagedCloudChannel(name, type);
            if (result && result.channelInfo && result.initialConfig) {
                toast({ title: "Cloud Storage Created!", description: `Channel "${result.channelInfo.title}" created.` });
                pageDialogs.setIsCreateCloudChannelDialogOpen(false);
                const newCF: CloudFolder = {id: `channel-${result.channelInfo.id}`, name: result.channelInfo.title, isChatFolder:false, inputPeer: { _: 'inputPeerChannel', channel_id: result.channelInfo.id, access_hash: result.channelInfo.access_hash }, files:[], folders:[], isAppManagedCloud: true, cloudConfig: result.initialConfig };
                accmAddCreatedCloudChannelToList(newCF);
                dfmFetchDialogFilters(true);
            } else { throw new Error("Channel creation did not return expected info."); }
        }}
        isLoading={foIsProcessingVirtualFolder}
      />

      <CreateVirtualFolderDialog
        isOpen={pageDialogs.isCreateVirtualFolderDialogOpen}
        onClose={() => pageDialogsSetIsCreateVirtualFolderDialogOpen(false)}
        onCreate={async (folderName: string) => {
            if (isGlobalDriveActive && organizationMode === 'custom') {
                await handleCreateGlobalVirtualFolder(folderName);
            } else if (!isGlobalDriveActive && smSelectedFolder?.inputPeer) {
                foSetIsProcessingVirtualFolder(true);
                try {
                    const updatedConfig = await telegramService.addVirtualFolderToCloudChannel(smSelectedFolder.inputPeer, pageDialogsVirtualFolderParentPath, folderName);
                    if (updatedConfig) {
                        smUpdateSelectedFolderConfig(updatedConfig);
                        accmSetAppManagedCloudFolders(prev => prev.map(cf => cf.id === smSelectedFolder?.id ? {...cf, cloudConfig: updatedConfig} : cf));
                        toast({ title: "Virtual Folder Created", description: `Folder "${folderName}" created.`});
                        pageDialogsSetIsCreateVirtualFolderDialogOpen(false);
                    } else { toast({ title: "Creation Failed", variant: "destructive" }); }
                } catch (e:any) { handleGlobalApiError(e, "Error Creating Folder", e.message); }
                finally { foSetIsProcessingVirtualFolder(false); }
            } else {
                toast({ title: "Error", description: "Operation not valid in this context.", variant: "destructive" });
            }
        }}
        isLoading={foIsProcessingVirtualFolder || (isGlobalDriveActive && organizationMode === 'custom' && gdcIsLoadingConfig)}
        parentPath={pageDialogsVirtualFolderParentPath}
      />

      <DeleteItemConfirmationDialog
        isOpen={foIsDeleteItemDialogOpen}
        onClose={() => foHandleCancelDeletion()}
        onConfirm={isGlobalDriveActive && organizationMode === 'custom' ? handleDeleteGlobalVirtualFolder : foHandleConfirmDeletion}
        isLoading={foIsProcessingDeletion || (isGlobalDriveActive && organizationMode === 'custom' && gdcIsLoadingConfig)}
        itemName={foItemToDelete?.type === 'file' ? foItemToDelete.file.name : foItemToDelete?.name || "item"}
        itemType={foItemToDelete?.type || "item"}
      />

      <FileDetailsPanel
        file={foSelectedFileForDetails}
        isOpen={foIsDetailsPanelOpen}
        onClose={foHandleCloseFileDetails}
        onQueueDownload={dmHandleQueueDownloadFile}
      />
      <ImageViewer
        isOpen={mpvIsImageViewerOpen}
        onClose={mpvHandleCloseImageViewer}
        imageUrl={mpvViewingImageUrl}
        imageName={mpvViewingImageName}
      />
      <VideoPlayer
        isOpen={mpvIsVideoPlayerOpen}
        onClose={mpvHandleCloseVideoPlayerAndStream}
        videoUrl={mpvPlayingVideoUrl}
        videoName={mpvPlayingVideoName}
        isLoading={mpvIsPreparingVideoStream && mpvPlayingVideoUrl === null}
      />
      <DownloadManagerDialog
        isOpen={dmIsDownloadManagerOpen}
        onClose={dmHandleCloseDownloadManagerSheet}
        queue={dmDownloadQueue}
        onCancel={dmHandleCancelDownloadOp}
        onPause={dmHandlePauseDownloadOp}
        onResume={dmHandleResumeDownloadOp}
      />
      <UploadDialog
        isOpen={ulIsUploadDialogOpen && !isGlobalDriveActive}
        onClose={ulHandleCloseUploadFilesDialog}
        onFilesSelected={ulHandleFilesSelectedForUploadList}
        onUpload={ulHandleStartFileUploads}
        selectedFiles={ulFilesToUpload}
        isLoading={ulIsUploadingFiles}
      />
      {pageDialogs.managingCloudChannelContext && !isGlobalDriveActive && (
        <ManageCloudChannelDialog
          isOpen={pageDialogs.isManageCloudChannelDialogOpen}
          onClose={() => pageDialogs.setIsManageCloudChannelDialogOpen(false)}
          channel={pageDialogs.managingCloudChannelContext}
          handleGlobalApiError={handleGlobalApiError}
          onChannelDetailsUpdatedAppLevel={onChannelDetailsUpdatedForAdminHook}
        />
      )}
    </div>
  );
}


