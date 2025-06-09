
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
import type { CloudFolder, DialogFilter, CloudChannelType, CloudChannelConfigV1, CloudFile } from "@/types";
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

export default function Home() {
  const { toast } = useToast();
  const headerRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLDivElement>(null);

  const [isGlobalDriveActive, setIsGlobalDriveActive] = useState(false);

  const handleGlobalApiError = useCallback((error: any, title: string, defaultMessage: string, doPageReset: boolean = false) => {
    let description = defaultMessage;
    if (error && typeof error.message === 'string' && error.message.length > 0) {
        description = error.message;
    } else if (error && typeof error.toString === 'function') {
        const errStr = error.toString();
        if (errStr !== '[object Object]') description = errStr;
    }

    toast({ title, description, variant: "destructive", duration: doPageReset ? 10000 : 5000 });
    if (doPageReset && connectionManager) {
      connectionManager.handleReset(error.message !== 'AUTH_RESTART');
    }
  }, [toast /* connectionManager is initialized later */]);


  const pageDialogs = usePageDialogsVisibility();

  const authManager = useAuthManager({
    onAuthSuccess: (user) => connectionManager.onAuthSuccessMain(user),
    setGlobalIsConnecting: (isConn) => connectionManager?.setIsConnecting(isConn),
    setGlobalPhoneNumberForDisplay: (phone) => connectionManager?.setAppPhoneNumber(phone),
    toast,
    handleGlobalApiError,
  });

  const globalDriveManager = useGlobalDriveManager({
    toast,
    handleGlobalApiError,
    isConnected: false, // Will be updated by connectionManager effect
  });

  const dialogFiltersManager = useDialogFiltersManager({
    isConnected: false,
    toast,
    handleGlobalApiError,
    fetchAndCacheDialogsForListManager: (key, more, id, limit) => chatListManager?.fetchAndCacheDialogsForList(key, more, id, limit) || Promise.resolve(),
    setLastFetchedFilterIdForChatListManager: (id) => chatListManager?.setLastFetchedFilterIdForChatList(id),
    setChatsDataCacheForFilter: (filterId, data) => chatListManager?.setChatsDataCacheForFilter(filterId, data),
    resetMasterChatListForFilteringInCache: () => chatListManager?.resetMasterChatListForFilteringInCache(),
    updateMasterChatListInCache: (folders, pagination) => chatListManager?.updateMasterChatListInCache(folders, pagination),
    getChatDataCacheEntry: (key) => chatListManager?.getChatDataCacheEntry(key),
  });

  const chatListManager = useChatListManager({
    isConnected: false,
    activeFilterDetails: dialogFiltersManager.activeFilterDetails,
    toast,
    handleGlobalApiError,
    dialogFilters: dialogFiltersManager.dialogFilters,
    resetSelectedMedia: () => {
      selectedMediaManager?.resetSelectedMedia();
      if (isGlobalDriveActive) {
          setIsGlobalDriveActive(false);
          globalDriveManager.resetManager();
      }
    },
    setClipboardItem: (item) => fileOperationsManager?.setClipboardItem(item),
  });

  const appCloudChannelsManager = useAppCloudChannelsManager({
    isConnected: false,
    toast,
    handleGlobalApiError,
  });

  const selectedMediaManager = useSelectedMediaManager({
    toast,
    handleGlobalApiError,
    displayedChatsFromChatList: chatListManager.displayedChats,
    appManagedCloudFoldersFromManager: appCloudChannelsManager.appManagedCloudFolders,
    setClipboardItem: (item) => fileOperationsManager?.setClipboardItem(item),
  });

  const fileOperationsManager = useFileOperationsManager({
    toast,
    handleGlobalApiError,
    selectedFolder: isGlobalDriveActive ? null : selectedMediaManager.selectedFolder,
    currentVirtualPath: isGlobalDriveActive ? "/" : selectedMediaManager.currentVirtualPath,
    currentChatMedia: isGlobalDriveActive ? globalDriveManager.globalMediaItems : selectedMediaManager.currentChatMedia,
    setCurrentChatMedia: isGlobalDriveActive ? globalDriveManager.setGlobalMediaItemsDirectly : selectedMediaManager.setCurrentChatMedia, // Allow global drive to set its media directly
    updateSelectedFolderConfig: selectedMediaManager.updateSelectedFolderConfig,
    setAppManagedCloudFoldersState: appCloudChannelsManager.setAppManagedCloudFolders,
    fetchInitialChatMediaForSelectedManager: selectedMediaManager.fetchInitialChatMediaForSelected,
  });

  const mediaPreviewManager = useMediaPreviewManager({ toast });
  const downloadManager = useDownloadManager({ toast });

  const uploadManager = useUploadManager({
    toast,
    selectedFolder: isGlobalDriveActive ? null : selectedMediaManager.selectedFolder,
    currentVirtualPath: selectedMediaManager.currentVirtualPath,
    refreshMediaCallback: () => {
        if (isGlobalDriveActive) {
          // For global drive, a full refresh might be too much.
          // Consider targeted updates or just rely on natural flow if possible.
          // For now, no specific refresh on upload for global drive.
        } else if (selectedMediaManager.selectedFolder) {
          selectedMediaManager.fetchInitialChatMediaForSelected(selectedMediaManager.selectedFolder);
        }
    },
  });

  const onChannelDetailsUpdatedForAdminHook = useCallback((updatedChannel: CloudFolder) => {
    appCloudChannelsManager.setAppManagedCloudFolders(prev =>
        prev.map(cf => cf.id === updatedChannel.id ? { ...cf, ...updatedChannel } : cf)
    );
    if (!isGlobalDriveActive && selectedMediaManager.selectedFolder?.id === updatedChannel.id) {
        selectedMediaManager.setSelectedFolder(prev => prev ? { ...prev, ...updatedChannel } : null);
    }
  }, [
      isGlobalDriveActive,
      appCloudChannelsManager.setAppManagedCloudFolders,
      selectedMediaManager.setSelectedFolder,
      selectedMediaManager.selectedFolder?.id
    ]);


  const connectionManager = useConnectionManager({
    toast,
    onInitialConnect: async () => {
      await dialogFiltersManager.fetchDialogFilters(true);
      await appCloudChannelsManager.fetchAppManagedCloudChannelsList(true);
      // Do not auto-start globalDriveManager.fetchInitialGlobalMedia here.
      // It will be triggered by handleOpenGlobalDrive.
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
      globalDriveManager.resetManager();
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

  useEffect(() => {
    const isConnected = connectionManager.isConnected;
    dialogFiltersManager.setIsConnected(isConnected);
    chatListManager.setIsConnected(isConnected);
    appCloudChannelsManager.setIsConnected(isConnected);
    globalDriveManager.setIsConnected(isConnected); // Update globalDriveManager's connection status
  }, [connectionManager.isConnected, dialogFiltersManager, chatListManager, appCloudChannelsManager, globalDriveManager]);

  useEffect(() => {
    connectionManager.checkExistingConnection();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (dialogFiltersManager.isLoadingDialogFilters) return;

    const currentActiveId = dialogFiltersManager.activeDialogFilterId;
    const currentFilters = dialogFiltersManager.dialogFilters;
    let newActiveFilterDetails: DialogFilter | null = null;

    if (currentFilters && currentFilters.length > 0) {
        newActiveFilterDetails = currentFilters.find(f => f.id === currentActiveId) || null;
        if (!newActiveFilterDetails && currentFilters.length > 0) {
            newActiveFilterDetails = currentFilters.find(f => f.id === telegramService.ALL_CHATS_FILTER_ID) || currentFilters[0] || null;
        }
    } else {
        newActiveFilterDetails = dialogFiltersManager.defaultAllChatsFilter;
    }

    const currentFilterDetailsState = dialogFiltersManager.activeFilterDetails;
    if (
      currentFilterDetailsState?.id !== newActiveFilterDetails?.id ||
      currentFilterDetailsState?.title !== newActiveFilterDetails?.title ||
      (!currentFilterDetailsState && newActiveFilterDetails) ||
      (currentFilterDetailsState && !newActiveFilterDetails)
    ) {
      dialogFiltersManager.setActiveFilterDetails(newActiveFilterDetails);
    }
  }, [
    dialogFiltersManager.activeDialogFilterId,
    dialogFiltersManager.dialogFilters,
    dialogFiltersManager.isLoadingDialogFilters,
    dialogFiltersManager.setActiveFilterDetails,
    dialogFiltersManager.defaultAllChatsFilter,
    dialogFiltersManager.activeFilterDetails,
  ]);


  const performFullReset = useCallback(async (performServerLogout = true) => {
        if (mediaPreviewManager.videoStreamAbortControllerRef.current && !mediaPreviewManager.videoStreamAbortControllerRef.current.signal.aborted) {
            mediaPreviewManager.videoStreamAbortControllerRef.current.abort("User reset application state");
        }
        if (mediaPreviewManager.videoStreamUrlInternal) {
            URL.revokeObjectURL(mediaPreviewManager.videoStreamUrlInternal);
        }
        downloadManager.downloadQueueRefForReset.current.forEach(item => {
            if (item.abortController && !item.abortController.signal.aborted) {
                item.abortController.abort("User reset application state");
            }
        });
        downloadManager.activeDownloadsRefForReset.current.clear();
        downloadManager.browserDownloadTriggeredRefForReset.current.clear();
        uploadManager.uploadAbortControllersRefForReset.current.forEach((controller) => {
          if (!controller.signal.aborted) controller.abort("User reset application state");
        });
        uploadManager.uploadAbortControllersRefForReset.current.clear();
        await connectionManager.handleReset(performServerLogout);
    }, [connectionManager, mediaPreviewManager, downloadManager, uploadManager]);

  const handleOpenGlobalDrive = () => {
    if (!connectionManager.isConnected) {
        toast({ title: "Not Connected", description: "Please connect to Telegram first.", variant: "default"});
        return;
    }
    setIsGlobalDriveActive(true);
    selectedMediaManager.resetSelectedMedia(); // Clear any specific chat selection
    globalDriveManager.fetchInitialGlobalMedia(); // Trigger initial load
    toast({ title: "Global Drive Activated", description: "Loading all accessible media. This may take a while..."});
  };

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
        onOpenChatSelectionDialog={() => { setIsGlobalDriveActive(false); globalDriveManager.resetManager(); pageDialogs.handleOpenChatSelectionDialog(); }}
        onOpenCloudStorageSelector={() => { setIsGlobalDriveActive(false); globalDriveManager.resetManager(); pageDialogs.handleOpenCloudStorageSelector(); }}
        onOpenGlobalDrive={handleOpenGlobalDrive}
      />
      <div className="flex-1 flex overflow-hidden min-h-0">
        <main className="flex-1 overflow-y-auto bg-background">
          <div className="container mx-auto h-full px-0 sm:px-0 lg:px-0 py-0 md:py-0 lg:py-0">
            {isGlobalDriveActive ? (
              <MainContentView
                folderName="Global Drive"
                files={globalDriveManager.globalMediaItems}
                isLoading={globalDriveManager.isLoading && globalDriveManager.globalMediaItems.length === 0}
                isLoadingMoreMedia={globalDriveManager.isLoading && globalDriveManager.globalMediaItems.length > 0}
                hasMore={globalDriveManager.hasMore}
                onFileDetailsClick={fileOperationsManager.handleOpenFileDetails}
                onQueueDownloadClick={downloadManager.handleQueueDownloadFile}
                onFileViewImageClick={mediaPreviewManager.handleViewImage}
                onFilePlayVideoClick={mediaPreviewManager.handlePlayVideo}
                onOpenUploadDialog={() => toast({title: "Upload Not Available", description: "Uploads are not supported in Global Drive view."})}
                isPreparingStream={mediaPreviewManager.isPreparingVideoStream}
                preparingStreamForFileId={mediaPreviewManager.preparingVideoStreamForFileId}
                onLoadMoreMedia={globalDriveManager.loadMoreGlobalMedia}
                isCloudChannel={false}
                currentVirtualPath="/"
                onNavigateVirtualPath={() => {}}
                onOpenCreateVirtualFolderDialog={() => {}}
                onDeleteFile={(file) => fileOperationsManager.handleRequestDeleteItem('file', file, file.inputPeer)}
                onDeleteVirtualFolder={() => {}}
                selectedFolderInputPeer={null}
                onCopyFile={fileOperationsManager.handleCopyFileOp}
                onPasteItem={() => {}}
                clipboardItem={fileOperationsManager.clipboardItem}
                selectedFolderForView={null}
                onOpenManageCloudChannelDialog={() => {}}
                isGlobalView={true}
                globalStatusMessage={globalDriveManager.statusMessage}
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
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground p-4">
                <LayoutPanelLeft className="w-16 h-16 mb-4 opacity-50" />
                <p className="text-lg mb-2">No chat or view selected.</p>
                <p className="text-sm mb-4">Select a chat folder, a cloud storage channel, or open the Global Drive.</p>
                <div className="flex gap-4 flex-wrap justify-center">
                  <Button onClick={handleOpenGlobalDrive}><Globe className="mr-2 h-5 w-5" /> Open Global Drive</Button>
                  <Button onClick={() => { setIsGlobalDriveActive(false); globalDriveManager.resetManager(); pageDialogs.handleOpenChatSelectionDialog();}}><MessageSquare className="mr-2 h-5 w-5" /> Select Chat Folder</Button>
                  <Button onClick={() => { setIsGlobalDriveActive(false); globalDriveManager.resetManager(); pageDialogs.handleOpenCloudStorageSelector();}} variant="outline"><Cloud className="mr-2 h-5 w-5" /> Select Cloud Storage</Button>
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
        onOpenChange={pageDialogs.setIsChatSelectionDialogOpen}
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
        onSelectFolder={(id) => { setIsGlobalDriveActive(false); globalDriveManager.resetManager(); selectedMediaManager.handleSelectFolderOrChannel(id, 'chat'); pageDialogs.setIsChatSelectionDialogOpen(false);}}
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
        onSelectFolder={(id) => {setIsGlobalDriveActive(false); globalDriveManager.resetManager(); selectedMediaManager.handleSelectFolderOrChannel(id, 'cloud'); pageDialogs.setIsCloudStorageSelectorOpen(false);}}
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
        onClose={() => pageDialogs.setIsCreateVirtualFolderDialogOpen(false)}
        onCreate={async (folderName: string) => {
            if (isGlobalDriveActive || !selectedMediaManager.selectedFolder || !selectedMediaManager.selectedFolder.inputPeer) {
                 toast({ title: "Error", description: "Operation not valid in Global Drive or no cloud channel selected.", variant: "destructive" }); return;
            }
            fileOperationsManager.setIsProcessingVirtualFolder(true);
            try {
                const updatedConfig = await telegramService.addVirtualFolderToCloudChannel(selectedMediaManager.selectedFolder.inputPeer, pageDialogs.virtualFolderParentPath, folderName);
                if (updatedConfig) {
                    selectedMediaManager.updateSelectedFolderConfig(updatedConfig);
                    appCloudChannelsManager.setAppManagedCloudFoldersState(prev => prev.map(cf => cf.id === selectedMediaManager.selectedFolder?.id ? {...cf, cloudConfig: updatedConfig} : cf));
                    toast({ title: "Virtual Folder Created", description: `Folder "${folderName}" created.`});
                    pageDialogs.setIsCreateVirtualFolderDialogOpen(false);
                } else { toast({ title: "Creation Failed", variant: "destructive" }); }
            } catch (e:any) { handleGlobalApiError(e, "Error Creating Folder", e.message); }
            finally { fileOperationsManager.setIsProcessingVirtualFolder(false); }
        }}
        isLoading={fileOperationsManager.isProcessingVirtualFolder}
        parentPath={pageDialogs.virtualFolderParentPath}
      />

      <DeleteItemConfirmationDialog
        isOpen={fileOperationsManager.isDeleteItemDialogOpen}
        onClose={() => fileOperationsManager.handleCancelDeletion()}
        onConfirm={fileOperationsManager.handleConfirmDeletion}
        isLoading={fileOperationsManager.isProcessingDeletion}
        itemName={fileOperationsManager.itemToDelete?.type === 'file' ? fileOperationsManager.itemToDelete.file.name : fileOperationsManager.itemToDelete?.name || "item"}
        itemType={fileOperationsManager.itemToDelete?.type || "item"}
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

