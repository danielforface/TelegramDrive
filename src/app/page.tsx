
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
import type { CloudFolder, DialogFilter, CloudChannelType, CloudChannelConfigV1 } from "@/types";
import { Button } from "@/components/ui/button";
import { Loader2, LayoutPanelLeft, MessageSquare, Cloud } from "lucide-react";
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
import { useChannelAdminManager } from "@/hooks/features/useChannelAdminManager";


export default function Home() {
  const { toast } = useToast();
  const headerRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLDivElement>(null);

  // Centralized API error handler for the page
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
  }, [toast /* connectionManager is initialized later, its methods are stable via useCallback */]);


  // --- Initialize Hooks ---
  const pageDialogs = usePageDialogsVisibility();

  // AuthManager: Handles user authentication steps and state.
  const authManager = useAuthManager({
    onAuthSuccess: (user) => connectionManager.onAuthSuccessMain(user),
    setGlobalIsConnecting: (isConn) => connectionManager?.setIsConnecting(isConn), // connectionManager may not be defined yet
    setGlobalPhoneNumberForDisplay: (phone) => connectionManager?.setAppPhoneNumber(phone), // connectionManager may not be defined yet
    toast,
    handleGlobalApiError,
  });

  // DialogFiltersManager: Manages Telegram dialog filters (folders).
  // Dependencies are passed as props, including callbacks to other managers.
  const dialogFiltersManager = useDialogFiltersManager({
    isConnected: false, // Initial state, will be updated by connectionManager
    toast,
    handleGlobalApiError,
    // Callbacks to ChatListManager for cache operations
    fetchAndCacheDialogsForListManager: (key, more, id, limit) => chatListManager?.fetchAndCacheDialogsForList(key, more, id, limit) || Promise.resolve(),
    setLastFetchedFilterIdForChatListManager: (id) => chatListManager?.setLastFetchedFilterIdForChatList(id),
    setChatsDataCacheForFilter: (filterId, data) => chatListManager?.setChatsDataCacheForFilter(filterId, data),
    resetMasterChatListForFilteringInCache: () => chatListManager?.resetMasterChatListForFilteringInCache(),
    updateMasterChatListInCache: (folders, pagination) => chatListManager?.updateMasterChatListInCache(folders, pagination),
    getChatDataCacheEntry: (key) => chatListManager?.getChatDataCacheEntry(key),
  });

  // ChatListManager: Manages the list of chats displayed for the active filter.
  const chatListManager = useChatListManager({
    isConnected: false, // Initial state, updated by connectionManager
    activeFilterDetails: dialogFiltersManager.activeFilterDetails, // Derived state from dialogFiltersManager
    toast,
    handleGlobalApiError,
    dialogFilters: dialogFiltersManager.dialogFilters, // List of all filters
    resetSelectedMedia: () => selectedMediaManager?.resetSelectedMedia(), // Callback to SelectedMediaManager
    setClipboardItem: (item) => fileOperationsManager?.setClipboardItem(item), // Callback to FileOperationsManager
  });

  // AppCloudChannelsManager: Manages app-specific cloud storage channels.
  const appCloudChannelsManager = useAppCloudChannelsManager({
    isConnected: false, // Initial state, updated by connectionManager
    toast,
    handleGlobalApiError,
    onCloudChannelListChange: () => dialogFiltersManager.fetchDialogFilters(true), // Refresh dialog filters if cloud channels change
  });

  // SelectedMediaManager: Manages the currently selected folder/channel and its media content.
  const selectedMediaManager = useSelectedMediaManager({
    toast,
    handleGlobalApiError,
    displayedChatsFromChatList: chatListManager.displayedChats, // Chats from ChatListManager
    appManagedCloudFoldersFromManager: appCloudChannelsManager.appManagedCloudFolders, // Cloud channels from AppCloudChannelsManager
    setClipboardItem: (item) => fileOperationsManager?.setClipboardItem(item), // Callback to FileOperationsManager
  });

  // FileOperationsManager: Handles file/folder operations like details, delete, copy, paste.
  const fileOperationsManager = useFileOperationsManager({
    toast,
    handleGlobalApiError,
    selectedFolder: selectedMediaManager.selectedFolder, // Currently selected folder/channel
    currentVirtualPath: selectedMediaManager.currentVirtualPath, // Current path within a cloud channel
    currentChatMedia: selectedMediaManager.currentChatMedia, // Media of the selected folder
    setCurrentChatMedia: selectedMediaManager.setCurrentChatMedia, // Setter for selected media
    updateSelectedFolderConfig: selectedMediaManager.updateSelectedFolderConfig, // Update VFS config
    setAppManagedCloudFoldersState: appCloudChannelsManager.setAppManagedCloudFolders, // Update list of cloud channels
    fetchInitialChatMediaForSelectedManager: selectedMediaManager.fetchInitialChatMediaForSelected, // Fetch media for selected
  });

  // MediaPreviewManager: Manages image viewer and video player states.
  const mediaPreviewManager = useMediaPreviewManager({ toast });

  // DownloadManager: Manages the download queue and operations.
  const downloadManager = useDownloadManager({ toast });

  // UploadManager: Manages file uploads.
  const uploadManager = useUploadManager({
    toast,
    selectedFolder: selectedMediaManager.selectedFolder, // Target for uploads
    currentVirtualPath: selectedMediaManager.currentVirtualPath, // Target path within cloud channel
    refreshMediaCallback: () => { // Refresh media after upload
        if (selectedMediaManager.selectedFolder) {
            selectedMediaManager.fetchInitialChatMediaForSelected(selectedMediaManager.selectedFolder);
        }
    },
  });

  // ChannelAdminManager: Manages administration tasks for cloud channels.
  const channelAdminManager = useChannelAdminManager({
    toast,
    handleGlobalApiError,
    selectedManagingChannel: pageDialogs.managingCloudChannelContext, // Channel being managed
    onChannelDetailsUpdated: (updatedChannel) => { // Update app state after channel details change
        appCloudChannelsManager.setAppManagedCloudFolders(prev =>
            prev.map(cf => cf.id === updatedChannel.id ? { ...cf, ...updatedChannel } : cf)
        );
        if (selectedMediaManager.selectedFolder?.id === updatedChannel.id) {
            selectedMediaManager.setSelectedFolder(prev => prev ? { ...prev, ...updatedChannel } : null);
        }
    }
  });

  // ConnectionManager: Manages the overall connection to Telegram and app reset logic.
  // Must be defined after other managers it might call back to.
  const connectionManager = useConnectionManager({
    toast,
    onInitialConnect: async () => { // Actions to perform on successful initial connection
      await dialogFiltersManager.fetchDialogFilters(true);
      await appCloudChannelsManager.fetchAppManagedCloudChannelsList(true);
    },
    onResetApp: () => { // Reset all relevant manager states
      authManager.resetAuthVisuals();
      dialogFiltersManager.resetDialogFiltersState();
      chatListManager.resetAllChatListData();
      appCloudChannelsManager.resetAppManagedCloudFolders();
      selectedMediaManager.resetSelectedMedia();
      fileOperationsManager.resetFileOperations();
      mediaPreviewManager.resetMediaPreview();
      downloadManager.resetDownloadManager();
      uploadManager.resetUploadManager();
      channelAdminManager.resetAdminManagerState();
      pageDialogs.resetAllDialogsVisibility();
    },
    setAuthStep: authManager.setAuthStep, // Pass auth step setter
    handleGlobalApiError,
    handleNewCloudChannelDiscoveredAppLevel: (folder, source) => appCloudChannelsManager?.handleNewCloudChannelVerifiedAndUpdateList(folder, source),
    setGlobalPhoneNumberForDisplay: authManager.setAuthInputPhoneNumber, // Use authManager's state for this
    appPhoneNumber: authManager.authInputPhoneNumber, // Pass phone number from auth manager
  });

  // Update dependent hooks with connection status from ConnectionManager
  useEffect(() => {
    const isConnected = connectionManager.isConnected;
    dialogFiltersManager.setIsConnected(isConnected);
    chatListManager.setIsConnected(isConnected);
    appCloudChannelsManager.setIsConnected(isConnected);
  }, [connectionManager.isConnected, dialogFiltersManager, chatListManager, appCloudChannelsManager]);


  // Effect for initial connection check when the component mounts.
  useEffect(() => {
    connectionManager.checkExistingConnection();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty dependency array ensures this runs only once on mount


  // Effect to derive and set activeFilterDetails when activeDialogFilterId or dialogFilters change.
  // This effect *derives* state, it does not *trigger* changes to activeDialogFilterId.
  useEffect(() => {
    if (dialogFiltersManager.isLoadingDialogFilters) return;

    const currentActiveId = dialogFiltersManager.activeDialogFilterId;
    const currentFilters = dialogFiltersManager.dialogFilters;
    let newActiveFilterDetails: DialogFilter | null = null;

    if (currentFilters && currentFilters.length > 0) {
        newActiveFilterDetails = currentFilters.find(f => f.id === currentActiveId) || null;
        // Fallback if active ID isn't in current filters (should be rare if dialogFiltersManager handles ID validity)
        if (!newActiveFilterDetails) {
            newActiveFilterDetails = currentFilters.find(f => f.id === telegramService.ALL_CHATS_FILTER_ID) || currentFilters[0] || null;
        }
    } else {
        // If no filters loaded or available, use the default 'All Chats' structure.
        newActiveFilterDetails = dialogFiltersManager.defaultAllChatsFilter;
    }

    const currentFilterDetailsState = dialogFiltersManager.activeFilterDetails;

    // Update only if the determined new details are meaningfully different from the current state.
    if (
      currentFilterDetailsState?.id !== newActiveFilterDetails?.id ||
      currentFilterDetailsState?.title !== newActiveFilterDetails?.title || // Important for when a filter's title might change
      (!currentFilterDetailsState && newActiveFilterDetails) || // Current is null, new is not
      (currentFilterDetailsState && !newActiveFilterDetails)    // Current is not null, new is
    ) {
      dialogFiltersManager.setActiveFilterDetails(newActiveFilterDetails);
    }
  }, [
    dialogFiltersManager.activeDialogFilterId,
    dialogFiltersManager.dialogFilters, // Array of filter objects
    dialogFiltersManager.isLoadingDialogFilters,
    dialogFiltersManager.setActiveFilterDetails, // Stable setter from useDialogFiltersManager
    dialogFiltersManager.defaultAllChatsFilter,  // Stable default filter object
    // dialogFiltersManager.activeFilterDetails, // CRITICAL: Removed to prevent loops. We get its value inside.
  ]);


  // Callback for performing a full application reset, including aborting ongoing operations.
  const performFullReset = useCallback(async (performServerLogout = true) => {
        // Abort video streaming
        if (mediaPreviewManager.videoStreamAbortControllerRef.current && !mediaPreviewManager.videoStreamAbortControllerRef.current.signal.aborted) {
            mediaPreviewManager.videoStreamAbortControllerRef.current.abort("User reset application state");
        }
        if (mediaPreviewManager.videoStreamUrlInternal) {
            URL.revokeObjectURL(mediaPreviewManager.videoStreamUrlInternal);
        }
        // Abort downloads
        downloadManager.downloadQueueRefForReset.current.forEach(item => {
            if (item.abortController && !item.abortController.signal.aborted) {
                item.abortController.abort("User reset application state");
            }
        });
        downloadManager.activeDownloadsRefForReset.current.clear();
        downloadManager.browserDownloadTriggeredRefForReset.current.clear();
        // Abort uploads
        uploadManager.uploadAbortControllersRefForReset.current.forEach((controller) => {
          if (!controller.signal.aborted) controller.abort("User reset application state");
        });
        uploadManager.uploadAbortControllersRefForReset.current.clear();
        // Perform connection reset
        await connectionManager.handleReset(performServerLogout);
    }, [connectionManager, mediaPreviewManager, downloadManager, uploadManager]);


  // Loading state: Shown when initially connecting and no auth error or specific auth step is active.
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

  // Authentication screen: Shown if not connected and not in the process of connecting.
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

  // Main application view: Shown when connected.
  return (
    <div className="min-h-screen flex flex-col">
      <Header
        ref={headerRef}
        isConnected={connectionManager.isConnected}
        onDisconnect={() => performFullReset(true)}
        onOpenDownloadManager={downloadManager.handleOpenDownloadManagerSheet}
        onOpenChatSelectionDialog={pageDialogs.handleOpenChatSelectionDialog}
        onOpenCloudStorageSelector={pageDialogs.handleOpenCloudStorageSelector}
      />
      <div className="flex-1 flex overflow-hidden min-h-0">
        <main className="flex-1 overflow-y-auto bg-background">
          <div className="container mx-auto h-full px-0 sm:px-0 lg:px-0 py-0 md:py-0 lg:py-0">
            {selectedMediaManager.selectedFolder ? (
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
              />
            ) : (
              // Placeholder when no folder is selected
              <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground p-4">
                <LayoutPanelLeft className="w-16 h-16 mb-4 opacity-50" />
                <p className="text-lg mb-2">No chat selected.</p>
                <p className="text-sm mb-4">Select a chat folder or a cloud storage channel.</p>
                <div className="flex gap-4">
                  <Button onClick={pageDialogs.handleOpenChatSelectionDialog}><MessageSquare className="mr-2 h-5 w-5" /> Select Chat Folder</Button>
                  <Button onClick={pageDialogs.handleOpenCloudStorageSelector} variant="outline"><Cloud className="mr-2 h-5 w-5" /> Select Cloud Storage</Button>
                </div>
                {/* Loading/empty state indicators for chat list */}
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

      {/* Dialogs */}
      <ChatSelectionDialog
        isOpen={pageDialogs.isChatSelectionDialogOpen}
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
        onSelectFolder={(id) => { selectedMediaManager.handleSelectFolderOrChannel(id, 'chat'); pageDialogs.setIsChatSelectionDialogOpen(false);}}
        onLoadMore={chatListManager.loadMoreDisplayedChatsInManager}
        onRefresh={dialogFiltersManager.handleRefreshCurrentFilterView}
        currentErrorMessage={chatListManager.currentErrorMessageForChatList}
      />

      <ChatSelectionDialog
        isOpen={pageDialogs.isCloudStorageSelectorOpen}
        onOpenChange={pageDialogs.setIsCloudStorageSelectorOpen}
        viewMode="cloudStorage"
        folders={appCloudChannelsManager.appManagedCloudFolders}
        isLoading={appCloudChannelsManager.isLoadingAppManagedCloudFolders && appCloudChannelsManager.appManagedCloudFolders.length === 0}
        isLoadingMore={false}
        hasMore={false}
        selectedFolderId={selectedMediaManager.selectedFolder?.isAppManagedCloud ? selectedMediaManager.selectedFolder.id : null}
        onSelectFolder={(id) => {selectedMediaManager.handleSelectFolderOrChannel(id, 'cloud'); pageDialogs.setIsCloudStorageSelectorOpen(false);}}
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
            } else { throw new Error("Channel creation did not return expected info."); }
        }}
        isLoading={fileOperationsManager.isProcessingVirtualFolder} // Can use a more specific loading state if needed
      />

      <CreateVirtualFolderDialog
        isOpen={pageDialogs.isCreateVirtualFolderDialogOpen}
        onClose={() => pageDialogs.setIsCreateVirtualFolderDialogOpen(false)}
        onCreate={async (folderName: string) => {
            if (!selectedMediaManager.selectedFolder || !selectedMediaManager.selectedFolder.inputPeer) {
                 toast({ title: "Error", description: "No cloud channel selected or inputPeer missing.", variant: "destructive" }); return;
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
        isOpen={uploadManager.isUploadDialogOpen}
        onClose={uploadManager.handleCloseUploadFilesDialog}
        onFilesSelected={uploadManager.handleFilesSelectedForUploadList}
        onUpload={uploadManager.handleStartFileUploads}
        selectedFiles={uploadManager.filesToUpload}
        isLoading={uploadManager.isUploadingFiles}
      />
      {pageDialogs.managingCloudChannelContext && (
        <ManageCloudChannelDialog
          isOpen={pageDialogs.isManageCloudChannelDialogOpen}
          onClose={() => pageDialogs.setIsManageCloudChannelDialogOpen(false)}
          channel={pageDialogs.managingCloudChannelContext}
          handleGlobalApiError={handleGlobalApiError}
          onChannelDetailsUpdatedAppLevel={(updatedChannel) => { // Propagate updates to relevant managers
            appCloudChannelsManager.setAppManagedCloudFolders(prev =>
                prev.map(cf => cf.id === updatedChannel.id ? { ...cf, ...updatedChannel } : cf)
            );
            if (selectedMediaManager.selectedFolder?.id === updatedChannel.id) {
                selectedMediaManager.setSelectedFolder(prev => prev ? { ...prev, ...updatedChannel } : null);
            }
          }}
        />
      )}
    </div>
  );
}
    
