
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
    if (doPageReset && connectionManagerRef.current) {
      connectionManagerRef.current.handleReset(error.message !== 'AUTH_RESTART');
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

  const globalDriveManager = useGlobalDriveManager({
    toast,
    handleGlobalApiError,
    isConnected: false,
  });
  const {
    fetchInitialGlobalMedia: gdFetchInitialGlobalMedia,
    resetManager: gdResetManager,
    isFullScanActive: gdIsFullScanActive,
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


  const chatListManager = useChatListManager({
    isConnected: false,
    activeFilterDetails: null, // Will be updated by effect
    toast,
    handleGlobalApiError,
    dialogFilters: [], // Will be updated by effect
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
    fetchAndCacheDialogsForList: clmFetchAndCacheDialogsForList,
    setLastFetchedFilterIdForChatList: clmSetLastFetchedFilterIdForChatList,
    setChatsDataCacheForFilter: clmSetChatsDataCacheForFilter,
    resetMasterChatListForFilteringInCache: clmResetMasterChatListForFilteringInCache,
    updateMasterChatListInCache: clmUpdateMasterChatListInCache,
    getChatDataCacheEntry: clmGetChatDataCacheEntry,
    setIsConnected: clmSetIsConnected,
  } = chatListManager;

  const dialogFiltersManager = useDialogFiltersManager({
    isConnected: false,
    toast,
    handleGlobalApiError,
    fetchAndCacheDialogsForListManager: clmFetchAndCacheDialogsForList,
    setLastFetchedFilterIdForChatListManager: clmSetLastFetchedFilterIdForChatList,
    setChatsDataCacheForFilter: clmSetChatsDataCacheForFilter,
    resetMasterChatListForFilteringInCache: clmResetMasterChatListForFilteringInCache,
    updateMasterChatListInCache: clmUpdateMasterChatListInCache,
    getChatDataCacheEntry: clmGetChatDataCacheEntry,
    setIsConnected: undefined, //This hook is now passed functions from chatListManager directly
  });
  const {
    dialogFilters: dfmDialogFilters,
    activeFilterDetails: dfmActiveFilterDetails,
    setActiveFilterDetails: dfmSetActiveFilterDetails,
    setIsConnected: dfmSetIsConnected,
  } = dialogFiltersManager;


  const appCloudChannelsManager = useAppCloudChannelsManager({
    isConnected: false,
    toast,
    handleGlobalApiError,
  });
  const {
    setAppManagedCloudFolders: accmSetAppManagedCloudFolders,
    setIsConnected: accmSetIsConnected,
  } = appCloudChannelsManager;


  const selectedMediaManager = useSelectedMediaManager({
    toast,
    handleGlobalApiError,
    displayedChatsFromChatList: chatListManager.displayedChats,
    appManagedCloudFoldersFromManager: appCloudChannelsManager.appManagedCloudFolders,
    setClipboardItem: (item) => fileOperationsManager?.setClipboardItem(item),
  });
  const {
    selectedFolder: smSelectedFolder,
    setSelectedFolder: smSetSelectedFolder,
    fetchInitialChatMediaForSelected: smFetchInitialChatMediaForSelected,
    resetSelectedMedia: smResetSelectedMedia,
  } = selectedMediaManager;

  const fileOperationsManager = useFileOperationsManager({
    toast,
    handleGlobalApiError,
    selectedFolder: isGlobalDriveActive ? null : smSelectedFolder,
    currentVirtualPath: isGlobalDriveActive ? "/" : selectedMediaManager.currentVirtualPath,
    currentChatMedia: isGlobalDriveActive ? globalDriveManager.globalMediaItems : selectedMediaManager.currentChatMedia,
    setCurrentChatMedia: isGlobalDriveActive ? globalDriveManager.setGlobalMediaItemsDirectly : selectedMediaManager.setCurrentChatMedia,
    updateSelectedFolderConfig: selectedMediaManager.updateSelectedFolderConfig,
    setAppManagedCloudFoldersState: accmSetAppManagedCloudFolders,
    fetchInitialChatMediaForSelectedManager: smFetchInitialChatMediaForSelected,
  });
  const {
    itemToDelete: foItemToDelete,
    setIsDeleteItemDialogOpen: foSetIsDeleteItemDialogOpen,
  } = fileOperationsManager;


  const mediaPreviewManager = useMediaPreviewManager({ toast });
  const {
    videoStreamAbortControllerRef: mpvAbortRef,
    videoStreamUrlInternal: mpvUrlInternal,
  } = mediaPreviewManager;

  const downloadManager = useDownloadManager({ toast });
  const {
    downloadQueueRefForReset: dlQueueRef,
    activeDownloadsRefForReset: dlActiveRef,
    browserDownloadTriggeredRefForReset: dlBrowserRef,
  } = downloadManager;

  const uploadManager = useUploadManager({
    toast,
    selectedFolder: isGlobalDriveActive ? null : smSelectedFolder,
    currentVirtualPath: selectedMediaManager.currentVirtualPath,
    refreshMediaCallback: () => {
        if (isGlobalDriveActive && globalDriveManager.isFullScanActive) {
          // Refresh for global drive if scan is active could be complex, might need targeted update
        } else if (isGlobalDriveActive && !globalDriveManager.isFullScanActive) {
           globalDriveManager.fetchInitialGlobalMedia();
        } else if (selectedMediaManager.selectedFolder) {
          selectedMediaManager.fetchInitialChatMediaForSelected(selectedMediaManager.selectedFolder);
        }
    },
  });
  const { uploadAbortControllersRefForReset: ulAbortRef } = uploadManager;


  const onChannelDetailsUpdatedForAdminHook = useCallback((updatedChannel: CloudFolder) => {
    accmSetAppManagedCloudFolders(prev =>
        prev.map(cf => cf.id === updatedChannel.id ? { ...cf, ...updatedChannel } : cf)
    );
    // Use a local variable for stable dependency if selectedFolder object itself is unstable
    const currentSelectedFolderId = smSelectedFolder?.id;
    if (!isGlobalDriveActive && currentSelectedFolderId === updatedChannel.id) {
        smSetSelectedFolder(prev => prev ? { ...prev, ...updatedChannel } : null);
    }
  }, [isGlobalDriveActive, accmSetAppManagedCloudFolders, smSelectedFolder?.id, smSetSelectedFolder]);


  const tempConnectionManager = useConnectionManager({
    toast,
    onInitialConnect: async () => {
      await dialogFiltersManager.fetchDialogFilters(true);
      await appCloudChannelsManager.fetchAppManagedCloudChannelsList(true);
    },
    onResetApp: () => {
      authManager.resetAuthVisuals();
      dialogFiltersManager.resetDialogFiltersState();
      chatListManager.resetAllChatListData();
      appCloudChannelsManager.resetAppManagedCloudFolders();
      selectedMediaManager.resetSelectedMedia();
      fileOperationsManager.resetFileOperations();
      mediaPreviewManager.resetMediaPreview();
      downloadManager.resetDownloadManager();
      uploadManager.resetUploadManager();
      pageDialogs.resetAllDialogsVisibility();
      setIsGlobalDriveActive(false);
      gdResetManager();
      gdcResetConfigState();
      setOrganizationMode('default');
    },
    setAuthStep: authManager.setAuthStep,
    handleGlobalApiError,
    handleNewCloudChannelDiscoveredAppLevel: (folder, source) => {
      const listChanged = appCloudChannelsManager?.handleNewCloudChannelVerifiedAndUpdateList(folder, source);
      if (listChanged && source === 'update') {
        dialogFiltersManager.fetchDialogFilters(true);
      }
    },
    setGlobalPhoneNumberForDisplay: authManager.setAuthInputPhoneNumber,
    appPhoneNumber: authManager.authInputPhoneNumber,
  });
  connectionManagerRef.current = tempConnectionManager;
  const connectionManager = tempConnectionManager;
  const {
    isConnected: connManagerIsConnected,
    handleReset: connManagerHandleReset,
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
    connectionManager.checkExistingConnection();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  useEffect(() => {
    if (isGlobalDriveActive && connManagerIsConnected) {
      if (!gdIsFullScanActive) {
        gdFetchInitialGlobalMedia();
      }
      if (organizationMode === 'custom' && !gdcCustomConfig && !gdcIsLoadingConfig && !gdcConfigError) {
        gdcLoadOrCreateConfig();
      }
    } else if (!isGlobalDriveActive) {
      if (gdIsFullScanActive) {
        gdResetManager();
      }
      gdcResetConfigState();
    }
  }, [
      isGlobalDriveActive, connManagerIsConnected, organizationMode,
      gdIsFullScanActive, gdFetchInitialGlobalMedia, gdResetManager,
      gdcCustomConfig, gdcIsLoadingConfig, gdcConfigError, gdcLoadOrCreateConfig, gdcResetConfigState
  ]);


  useEffect(() => {
    if (dialogFiltersManager.isLoadingDialogFilters) return;

    const currentActiveId = dialogFiltersManager.activeDialogFilterId;
    const currentFilters = dfmDialogFilters; // Use destructured version
    let newActiveFilterDetails: DialogFilter | null = null;

    if (currentFilters && currentFilters.length > 0) {
        newActiveFilterDetails = currentFilters.find(f => f.id === currentActiveId) || null;
        if (!newActiveFilterDetails && currentFilters.length > 0) {
            newActiveFilterDetails = currentFilters.find(f => f.id === telegramService.ALL_CHATS_FILTER_ID) || currentFilters[0] || null;
        }
    } else {
        newActiveFilterDetails = dialogFiltersManager.defaultAllChatsFilter;
    }

    const currentFilterDetailsState = dfmActiveFilterDetails; // Use destructured version
    if (
      currentFilterDetailsState?.id !== newActiveFilterDetails?.id ||
      currentFilterDetailsState?.title !== newActiveFilterDetails?.title ||
      (!currentFilterDetailsState && newActiveFilterDetails) ||
      (currentFilterDetailsState && !newActiveFilterDetails)
    ) {
      dfmSetActiveFilterDetails(newActiveFilterDetails); // Use destructured version
    }
  }, [
    dialogFiltersManager.activeDialogFilterId,
    dfmDialogFilters, // Use destructured version
    dialogFiltersManager.isLoadingDialogFilters,
    dfmSetActiveFilterDetails, // Use destructured version
    dialogFiltersManager.defaultAllChatsFilter,
    dfmActiveFilterDetails, // Use destructured version
  ]);

  useEffect(() => {
    // Update chatListManager with activeFilterDetails from dialogFiltersManager
    if (dfmActiveFilterDetails) {
      chatListManager.activeFilterDetails = dfmActiveFilterDetails;
    }
    // Update chatListManager with dialogFilters from dialogFiltersManager
    if (dfmDialogFilters) {
      chatListManager.dialogFilters = dfmDialogFilters;
    }
  }, [dfmActiveFilterDetails, dfmDialogFilters, chatListManager]);


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
  }, [connManagerIsConnected, toast, smResetSelectedMedia, gdcResetConfigState /* setOrganizationMode, setIsGlobalDriveActive are stable */]);

  const handleSetOrganizationMode = useCallback((mode: OrganizationMode) => {
    setOrganizationMode(mode);
  }, [/* setOrganizationMode is stable */]);

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


  if (connectionManager.isConnecting && !connectionManager.isConnected && !authManager.authError && authManager.authStep === 'initial' && !dialogFiltersManager.hasFetchedDialogFiltersOnce) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header ref={headerRef} isConnected={false} />
        <main className="flex-grow flex items-center justify-center text-center">
          <div>
            <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
            <p className="text-lg text-muted-foreground">
              {connectionManager.isConnecting ? "Connecting to Telegram..." : "Initializing..."}
            </p>
          </div>
        </main>
        <footer ref={footerRef} className="py-3 px-4 sm:px-6 lg:px-8 text-center border-t text-xs"><p className="text-muted-foreground">Telegram Cloudifier &copy; {new Date().getFullYear()}</p></footer>
      </div>
    );
  }

  if (!connectionManager.isConnected && !connectionManager.isConnecting) {
    return (
      <>
        <Header ref={headerRef} isConnected={false} />
        <main className="flex-grow container mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col items-center justify-center">
          <TelegramConnect
            authStep={authManager.authStep}
            onSendCode={authManager.handleSendCode}
            onSignIn={(code) => { authManager.setAuthPhoneCode(code); authManager.handleSignIn(code); }}
            onCheckPassword={(pw) => { authManager.setAuthPassword(pw); authManager.handleCheckPassword(pw); }}
            isLoading={connectionManager.isConnecting}
            error={authManager.authError}
            phoneNumber={connectionManager.appPhoneNumber || authManager.authInputPhoneNumber}
            setPhoneNumber={authManager.setAuthInputPhoneNumber}
            phoneCode={authManager.authPhoneCode}
            setPhoneCode={authManager.setAuthPhoneCode}
            password={authManager.authPassword}
            setPassword={authManager.setAuthPassword}
            onReset={() => performFullReset(authManager.authStep !== 'initial')}
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
        isConnected={connectionManager.isConnected}
        onDisconnect={() => performFullReset(true)}
        onOpenDownloadManager={downloadManager.handleOpenDownloadManagerSheet}
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
                files={globalDriveManager.globalMediaItems}
                isLoading={globalDriveManager.isLoading && globalDriveManager.globalMediaItems.length === 0 && !gdcIsLoadingConfig}
                isLoadingMoreMedia={(globalDriveManager.isLoading && globalDriveManager.globalMediaItems.length > 0) || gdcIsLoadingConfig}
                hasMore={globalDriveManager.hasMore || (organizationMode === 'default' && globalDriveManager.isFullScanActive)}
                onFileDetailsClick={fileOperationsManager.handleOpenFileDetails}
                onQueueDownloadClick={downloadManager.handleQueueDownloadFile}
                onFileViewImageClick={mediaPreviewManager.handleViewImage}
                onFilePlayVideoClick={mediaPreviewManager.handlePlayVideo}
                onOpenUploadDialog={() => toast({title: "Upload Not Available", description: "Uploads are not supported in Global Drive view."})}
                isPreparingStream={mediaPreviewManager.isPreparingVideoStream}
                preparingStreamForFileId={mediaPreviewManager.preparingVideoStreamForFileId}
                onLoadMoreMedia={globalDriveManager.loadMoreGlobalMedia}
                isCloudChannel={false}
                currentVirtualPath={organizationMode === 'custom' ? pageDialogsVirtualFolderParentPath : "/"}
                onNavigateVirtualPath={(path) => { if (organizationMode === 'custom') pageDialogsSetVirtualFolderParentPath(path); else {/* no-op for default global */} }}
                onOpenCreateVirtualFolderDialog={(path) => pageDialogs.handleOpenCreateVirtualFolderDialog(path)}
                onDeleteFile={(file) => fileOperationsManager.handleRequestDeleteItem('file', file, file.inputPeer)}
                onDeleteVirtualFolder={(path, name) => fileOperationsManager.handleRequestDeleteItem('virtualFolder', {path, name}, undefined)}
                selectedFolderInputPeer={null}
                onCopyFile={fileOperationsManager.handleCopyFileOp}
                onPasteItem={() => {}}
                clipboardItem={fileOperationsManager.clipboardItem}
                selectedFolderForView={null}
                onOpenManageCloudChannelDialog={() => {}}
                isGlobalView={true}
                globalStatusMessage={gdcIsLoadingConfig ? "Loading custom configuration..." : (gdcConfigError ? `Config Error: ${gdcConfigError}` : globalDriveManager.statusMessage)}
                organizationMode={organizationMode}
                onSetOrganizationMode={handleSetOrganizationMode}
                customGlobalDriveConfig={gdcCustomConfig}
                isLoadingCustomGlobalDriveConfig={gdcIsLoadingConfig}
                customGlobalDriveConfigError={gdcConfigError}
              />
            ) : selectedMediaManager.selectedFolder ? (
              <MainContentView
                folderName={selectedMediaManager.selectedFolder.name}
                files={selectedMediaManager.currentChatMedia}
                isLoading={selectedMediaManager.isLoadingChatMedia && selectedMediaManager.currentChatMedia.length === 0}
                isLoadingMoreMedia={selectedMediaManager.isLoadingChatMedia && selectedMediaManager.currentChatMedia.length > 0}
                hasMore={selectedMediaManager.hasMoreChatMedia}
                onFileDetailsClick={fileOperationsManager.handleOpenFileDetails}
                onQueueDownloadClick={downloadManager.handleQueueDownloadFile}
                onFileViewImageClick={mediaPreviewManager.handleViewImage}
                onFilePlayVideoClick={mediaPreviewManager.handlePlayVideo}
                onOpenUploadDialog={uploadManager.handleOpenUploadFilesDialog}
                isPreparingStream={mediaPreviewManager.isPreparingVideoStream}
                preparingStreamForFileId={mediaPreviewManager.preparingVideoStreamForFileId}
                onLoadMoreMedia={selectedMediaManager.loadMoreChatMediaForSelected}
                isCloudChannel={selectedMediaManager.selectedFolder.isAppManagedCloud || false}
                cloudConfig={selectedMediaManager.selectedFolder.cloudConfig}
                currentVirtualPath={selectedMediaManager.currentVirtualPath}
                onNavigateVirtualPath={selectedMediaManager.handleNavigateVirtualPath}
                onOpenCreateVirtualFolderDialog={pageDialogs.handleOpenCreateVirtualFolderDialog}
                onDeleteFile={(file) => fileOperationsManager.handleRequestDeleteItem('file', file)}
                onDeleteVirtualFolder={(path, name, peer) => fileOperationsManager.handleRequestDeleteItem('virtualFolder', { path, name }, peer)}
                selectedFolderInputPeer={selectedMediaManager.selectedFolder.inputPeer}
                onCopyFile={fileOperationsManager.handleCopyFileOp}
                onCopyFolderStructure={fileOperationsManager.handleCopyFolderStructureOp}
                onPasteItem={(targetPath) => fileOperationsManager.handlePasteItemOp(targetPath, pageDialogs.handleOpenCreateVirtualFolderDialog)}
                clipboardItem={fileOperationsManager.clipboardItem}
                selectedFolderForView={selectedMediaManager.selectedFolder}
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
                {chatListManager.isLoadingDisplayedChats && chatListManager.displayedChats.length === 0 && dialogFiltersManager.activeFilterDetails && (
                  <div className="mt-4 flex items-center"><Loader2 className="animate-spin h-5 w-5 text-primary mr-2" /><span>Loading initial chat list for "{dialogFiltersManager.activeFilterDetails?.title || 'current folder'}"...</span></div>
                )}
                {!chatListManager.isLoadingDisplayedChats && chatListManager.displayedChats.length === 0 && !chatListManager.currentErrorMessageForChatList && connectionManager.isConnected && dialogFiltersManager.activeFilterDetails && !chatListManager.cachedDataForActiveFilterIsLoading(dialogFiltersManager.activeFilterDetails) && (
                  <div className="mt-4 flex items-center text-sm"><MessageSquare className="mr-2 h-5 w-5 text-muted-foreground" /><span>Chat list for "{dialogFiltersManager.activeFilterDetails.title}" appears to be empty.</span></div>
                )}
                {chatListManager.currentErrorMessageForChatList && (
                  <div className="mt-4 p-3 bg-destructive/10 text-destructive rounded-md text-sm"><p>{chatListManager.currentErrorMessageForChatList}</p></div>
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
        dialogFilters={dialogFiltersManager.dialogFilters}
        activeDialogFilterId={dialogFiltersManager.activeDialogFilterId}
        onSelectDialogFilter={dialogFiltersManager.handleSelectDialogFilter}
        isLoadingDialogFilters={dialogFiltersManager.isLoadingDialogFilters}
        isReorderingFolders={dialogFiltersManager.isReorderingFolders}
        onToggleReorderFolders={dialogFiltersManager.handleToggleReorderFolders}
        onMoveFilter={dialogFiltersManager.handleMoveFilter}
        onShareFilter={dialogFiltersManager.handleShareFilter}
        folders={chatListManager.displayedChats}
        isLoading={chatListManager.isLoadingDisplayedChats && chatListManager.displayedChats.length === 0}
        isLoadingMore={chatListManager.isLoadingDisplayedChats && chatListManager.displayedChats.length > 0}
        hasMore={chatListManager.hasMoreDisplayedChats}
        selectedFolderId={selectedMediaManager.selectedFolder?.id || null}
        onSelectFolder={(id) => { setIsGlobalDriveActive(false); selectedMediaManager.handleSelectFolderOrChannel(id, 'chat'); pageDialogsSetIsChatSelectionDialogOpen(false);}}
        onLoadMore={chatListManager.loadMoreDisplayedChatsInManager}
        onRefresh={dialogFiltersManager.handleRefreshCurrentFilterView}
        currentErrorMessage={chatListManager.currentErrorMessageForChatList}
      />

      <ChatSelectionDialog
        isOpen={pageDialogs.isCloudStorageSelectorOpen && !isGlobalDriveActive}
        onOpenChange={pageDialogs.setIsCloudStorageSelectorOpen}
        viewMode="cloudStorage"
        folders={appCloudChannelsManager.appManagedCloudFolders}
        isLoading={appCloudChannelsManager.isLoadingAppManagedCloudFolders && appCloudChannelsManager.appManagedCloudFolders.length === 0}
        isLoadingMore={false}
        hasMore={false}
        selectedFolderId={selectedMediaManager.selectedFolder?.isAppManagedCloud ? selectedMediaManager.selectedFolder.id : null}
        onSelectFolder={(id) => {setIsGlobalDriveActive(false); selectedMediaManager.handleSelectFolderOrChannel(id, 'cloud'); pageDialogs.setIsCloudStorageSelectorOpen(false);}}
        onLoadMore={() => {}}
        onRefresh={appCloudChannelsManager.fetchAppManagedCloudChannelsList.bind(null, true)}
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
                appCloudChannelsManager.addCreatedCloudChannelToList(newCF);
                dialogFiltersManager.fetchDialogFilters(true);
            } else { throw new Error("Channel creation did not return expected info."); }
        }}
        isLoading={fileOperationsManager.isProcessingVirtualFolder}
      />

      <CreateVirtualFolderDialog
        isOpen={pageDialogs.isCreateVirtualFolderDialogOpen}
        onClose={() => pageDialogsSetIsCreateVirtualFolderDialogOpen(false)}
        onCreate={async (folderName: string) => {
            if (isGlobalDriveActive && organizationMode === 'custom') {
                await handleCreateGlobalVirtualFolder(folderName);
            } else if (!isGlobalDriveActive && selectedMediaManager.selectedFolder?.inputPeer) {
                fileOperationsManager.setIsProcessingVirtualFolder(true);
                try {
                    const updatedConfig = await telegramService.addVirtualFolderToCloudChannel(selectedMediaManager.selectedFolder.inputPeer, pageDialogsVirtualFolderParentPath, folderName);
                    if (updatedConfig) {
                        selectedMediaManager.updateSelectedFolderConfig(updatedConfig);
                        accmSetAppManagedCloudFolders(prev => prev.map(cf => cf.id === selectedMediaManager.selectedFolder?.id ? {...cf, cloudConfig: updatedConfig} : cf));
                        toast({ title: "Virtual Folder Created", description: `Folder "${folderName}" created.`});
                        pageDialogsSetIsCreateVirtualFolderDialogOpen(false);
                    } else { toast({ title: "Creation Failed", variant: "destructive" }); }
                } catch (e:any) { handleGlobalApiError(e, "Error Creating Folder", e.message); }
                finally { fileOperationsManager.setIsProcessingVirtualFolder(false); }
            } else {
                toast({ title: "Error", description: "Operation not valid in this context.", variant: "destructive" });
            }
        }}
        isLoading={fileOperationsManager.isProcessingVirtualFolder || (isGlobalDriveActive && organizationMode === 'custom' && gdcIsLoadingConfig)}
        parentPath={pageDialogsVirtualFolderParentPath}
      />

      <DeleteItemConfirmationDialog
        isOpen={fileOperationsManager.isDeleteItemDialogOpen}
        onClose={() => fileOperationsManager.handleCancelDeletion()}
        onConfirm={isGlobalDriveActive && organizationMode === 'custom' ? handleDeleteGlobalVirtualFolder : fileOperationsManager.handleConfirmDeletion}
        isLoading={fileOperationsManager.isProcessingDeletion || (isGlobalDriveActive && organizationMode === 'custom' && gdcIsLoadingConfig)}
        itemName={foItemToDelete?.type === 'file' ? foItemToDelete.file.name : foItemToDelete?.name || "item"}
        itemType={foItemToDelete?.type || "item"}
      />

      <FileDetailsPanel
        file={fileOperationsManager.selectedFileForDetails}
        isOpen={fileOperationsManager.isDetailsPanelOpen}
        onClose={fileOperationsManager.handleCloseFileDetails}
        onQueueDownload={downloadManager.handleQueueDownloadFile}
      />
      <ImageViewer
        isOpen={mediaPreviewManager.isImageViewerOpen}
        onClose={mediaPreviewManager.handleCloseImageViewer}
        imageUrl={mediaPreviewManager.viewingImageUrl}
        imageName={mediaPreviewManager.viewingImageName}
      />
      <VideoPlayer
        isOpen={mediaPreviewManager.isVideoPlayerOpen}
        onClose={mediaPreviewManager.handleCloseVideoPlayerAndStream}
        videoUrl={mediaPreviewManager.playingVideoUrl}
        videoName={mediaPreviewManager.playingVideoName}
        isLoading={mediaPreviewManager.isPreparingVideoStream && mediaPreviewManager.playingVideoUrl === null}
      />
      <DownloadManagerDialog
        isOpen={downloadManager.isDownloadManagerOpen}
        onClose={downloadManager.handleCloseDownloadManagerSheet}
        queue={downloadManager.downloadQueue}
        onCancel={downloadManager.handleCancelDownloadOp}
        onPause={downloadManager.handlePauseDownloadOp}
        onResume={downloadManager.handleResumeDownloadOp}
      />
      <UploadDialog
        isOpen={uploadManager.isUploadDialogOpen && !isGlobalDriveActive}
        onClose={uploadManager.handleCloseUploadFilesDialog}
        onFilesSelected={uploadManager.handleFilesSelectedForUploadList}
        onUpload={uploadManager.handleStartFileUploads}
        selectedFiles={uploadManager.filesToUpload}
        isLoading={uploadManager.isUploadingFiles}
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
