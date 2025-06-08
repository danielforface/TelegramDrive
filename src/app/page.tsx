

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
import { ManageCloudChannelDialog } from "@/components/manage-cloud-channel-dialog"; // New Dialog
import type { CloudFolder, DialogFilter, InputPeer, CloudChannelType, CloudChannelConfigV1 } from "@/types";
import { Button } from "@/components/ui/button";
import { RefreshCw, Loader2, LayoutPanelLeft, MessageSquare, Cloud } from "lucide-react";
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
import { useChannelAdminManager } from "@/hooks/features/useChannelAdminManager"; // New Hook


export default function Home() {
  const { toast } = useToast();
  const headerRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLDivElement>(null);

  // Centralized API error handler for the page
  const handleGlobalApiError = useCallback((error: any, title: string, defaultMessage: string, doPageReset: boolean = false) => {
    let description = error.message || defaultMessage;
    // authManager?.setAuthError(description); // Assuming authManager hook exposes setAuthError
    toast({ title, description, variant: "destructive", duration: doPageReset ? 10000 : 5000 });
    if (doPageReset && connectionManager) { // connectionManager might not be initialized yet
      connectionManager.handleReset(error.message !== 'AUTH_RESTART');
    }
  }, [toast /*, authManager dependency if setAuthError is called */ /*, connectionManager dependency */]);


  // --- Initialize Hooks ---
  const pageDialogs = usePageDialogsVisibility();

  const {
    authStep, setAuthStep, authInputPhoneNumber, setAuthInputPhoneNumber, authPhoneCode, setAuthPhoneCode,
    authPassword, setAuthPassword, authError, setAuthError: setAuthErrorAuthHook,
    handleSendCode, handleSignIn, handleCheckPassword, resetAuthVisuals,
  } = useAuthManager({
    onAuthSuccess: (user) => connectionManager.onAuthSuccessMain(user), // Assuming onAuthSuccessMain exists
    setGlobalIsConnecting: (isConn) => connectionManager?.setIsConnecting(isConn), // Forward to connectionManager
    setGlobalPhoneNumberForDisplay: (phone) => connectionManager?.setAppPhoneNumber(phone), // Forward
    toast,
    handleGlobalApiError,
  });

  const connectionManager = useConnectionManager({
    toast,
    onInitialConnect: async () => {
      // This now becomes the central point for fetching initial data after connection
      await dialogFiltersManager.fetchDialogFilters(true);
      await appCloudChannelsManager.fetchAppManagedCloudChannelsList(true);
    },
    onResetApp: () => {
      // Call reset functions of all other major hooks
      resetAuthVisuals();
      dialogFiltersManager.resetDialogFiltersState();
      chatListManager.resetAllChatListData();
      appCloudChannelsManager.resetAppManagedCloudFolders();
      selectedMediaManager.resetSelectedMedia();
      fileOperationsManager.resetFileOperations();
      mediaPreviewManager.resetMediaPreview();
      downloadManager.resetDownloadManager();
      uploadManager.resetUploadManager();
      channelAdminManager.resetAdminManagerState(); // Reset new hook
      pageDialogs.resetAllDialogsVisibility();
      // No need to reset global phone number here as handleReset in connectionManager does it
    },
    setAuthStep: setAuthStep, // Pass AuthManager's setter
    handleGlobalApiError,
    handleNewCloudChannelDiscoveredAppLevel: (folder, source) => appCloudChannelsManager?.handleNewCloudChannelVerifiedAndUpdateList(folder, source),
    setGlobalPhoneNumberForDisplay: (phone) => { /* This is primarily managed by authManager now or directly in connectionManager */ }
  });
  
  const dialogFiltersManager = useDialogFiltersManager({
    isConnected: connectionManager.isConnected,
    toast,
    handleGlobalApiError,
    // Pass necessary callbacks to chatListManager's cache functions
    fetchAndCacheDialogsForListManager: (key, more, id, limit) => chatListManager?.fetchAndCacheDialogsForList(key, more, id, limit) || Promise.resolve(),
    setLastFetchedFilterIdForChatListManager: (id) => chatListManager?.setLastFetchedFilterIdForChatList(id),
    // The following are not directly used by dialogFiltersManager itself but are part of the interface
    // for chatListManager's direct cache manipulation if ever needed.
    // These might be simplified if chatListManager exposes direct methods instead.
    setChatsDataCacheForFilter: (filterId, data) => chatListManager?.setChatsDataCacheForFilter(filterId, data),
    resetMasterChatListForFilteringInCache: () => chatListManager?.resetMasterChatListForFilteringInCache(),
    updateMasterChatListInCache: (folders, pagination) => chatListManager?.updateMasterChatListInCache(folders, pagination),
    getChatDataCacheEntry: (key) => chatListManager?.getChatDataCacheEntry(key),

  });

  const chatListManager = useChatListManager({
    isConnected: connectionManager.isConnected,
    activeFilterDetails: dialogFiltersManager.activeFilterDetails,
    toast,
    handleGlobalApiError,
    dialogFilters: dialogFiltersManager.dialogFilters,
    resetSelectedMedia: () => selectedMediaManager?.resetSelectedMedia(),
    setClipboardItem: (item) => fileOperationsManager?.setClipboardItem(item),
  });
  
  const appCloudChannelsManager = useAppCloudChannelsManager({
    isConnected: connectionManager.isConnected,
    toast,
    handleGlobalApiError,
    onCloudChannelListChange: () => dialogFiltersManager.fetchDialogFilters(true), // Refresh dialog filters when cloud channels change
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
    selectedFolder: selectedMediaManager.selectedFolder,
    currentVirtualPath: selectedMediaManager.currentVirtualPath,
    currentChatMedia: selectedMediaManager.currentChatMedia,
    setCurrentChatMedia: selectedMediaManager.setCurrentChatMedia,
    updateSelectedFolderConfig: selectedMediaManager.updateSelectedFolderConfig,
    setAppManagedCloudFoldersState: appCloudChannelsManager.setAppManagedCloudFolders,
    fetchInitialChatMediaForSelectedManager: selectedMediaManager.fetchInitialChatMediaForSelected,
  });

  const mediaPreviewManager = useMediaPreviewManager({ toast });
  
  const downloadManager = useDownloadManager({ toast });

  const uploadManager = useUploadManager({
    toast,
    selectedFolder: selectedMediaManager.selectedFolder,
    currentVirtualPath: selectedMediaManager.currentVirtualPath,
    refreshMediaCallback: () => {
        if (selectedMediaManager.selectedFolder) {
            selectedMediaManager.fetchInitialChatMediaForSelected(selectedMediaManager.selectedFolder);
        }
    },
  });

  const channelAdminManager = useChannelAdminManager({
    toast,
    handleGlobalApiError,
    selectedManagingChannel: pageDialogs.managingCloudChannelContext,
    onChannelDetailsUpdated: (updatedChannel) => {
        // Update the main list of cloud channels
        appCloudChannelsManager.setAppManagedCloudFolders(prev => 
            prev.map(cf => cf.id === updatedChannel.id ? { ...cf, ...updatedChannel } : cf)
        );
        // If this is the currently selected folder, update it too
        if (selectedMediaManager.selectedFolder?.id === updatedChannel.id) {
            selectedMediaManager.setSelectedFolder(prev => prev ? { ...prev, ...updatedChannel } : null);
        }
    }
  });


  // Initial connection check
  useEffect(() => {
    connectionManager.checkExistingConnection();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Runs once on mount

  // Effect to update activeFilterDetails when activeDialogFilterId or dialogFilters change
  useEffect(() => {
    if (dialogFiltersManager.isLoadingDialogFilters) return;
    let newFilter: DialogFilter | null = dialogFiltersManager.dialogFilters.find(f => f.id === dialogFiltersManager.activeDialogFilterId) || null;
    if (!newFilter && dialogFiltersManager.dialogFilters.length > 0) {
        newFilter = dialogFiltersManager.dialogFilters.find(f => f.id === telegramService.ALL_CHATS_FILTER_ID) || dialogFiltersManager.dialogFilters[0];
        if (newFilter && newFilter.id !== dialogFiltersManager.activeDialogFilterId) {
          dialogFiltersManager.setActiveDialogFilterId(newFilter.id); // This will trigger another run
          return;
        }
    } else if (!newFilter && dialogFiltersManager.dialogFilters.length === 0) {
        newFilter = dialogFiltersManager.defaultAllChatsFilter;
        if (dialogFiltersManager.activeDialogFilterId !== telegramService.ALL_CHATS_FILTER_ID) {
            dialogFiltersManager.setActiveDialogFilterId(telegramService.ALL_CHATS_FILTER_ID); // This will trigger another run
            return;
        }
    }
    if (dialogFiltersManager.activeFilterDetails?.id !== newFilter?.id ||
        dialogFiltersManager.activeFilterDetails?._ !== newFilter?._ ||
        dialogFiltersManager.activeFilterDetails?.title !== newFilter?.title
      ) {
        dialogFiltersManager.setActiveFilterDetails(newFilter);
    }
  }, [dialogFiltersManager.activeDialogFilterId, dialogFiltersManager.dialogFilters, dialogFiltersManager.isLoadingDialogFilters, dialogFiltersManager.activeFilterDetails, dialogFiltersManager.setActiveDialogFilterId, dialogFiltersManager.setActiveFilterDetails, dialogFiltersManager.defaultAllChatsFilter]);

  // Combined Reset for full disconnect or manual reset, ensuring cleanup from all hooks
   const performFullReset = useCallback(async (performServerLogout = true) => {
        // Abort video stream if active
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

        await connectionManager.handleReset(performServerLogout); // This calls onResetApp, which resets other hooks' states

    }, [connectionManager, mediaPreviewManager, downloadManager, uploadManager]);


  // Loading state for initial app load
  if (connectionManager.isConnecting && !connectionManager.isConnected && !authError && authStep === 'initial' && !dialogFiltersManager.hasFetchedDialogFiltersOnce) {
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

  // Telegram Connect View
  if (!connectionManager.isConnected && !connectionManager.isConnecting) {
    return (
      <>
        <Header ref={headerRef} isConnected={false} />
        <main className="flex-grow container mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col items-center justify-center">
          <TelegramConnect
            authStep={authStep}
            onSendCode={handleSendCode}
            onSignIn={(code) => { setAuthPhoneCode(code); handleSignIn(code); }}
            onCheckPassword={(pw) => { setAuthPassword(pw); handleCheckPassword(pw); }}
            isLoading={connectionManager.isConnecting} // Use global connecting state
            error={authError}
            phoneNumber={connectionManager.appPhoneNumber || authInputPhoneNumber} // Display global if available, else local input
            setPhoneNumber={setAuthInputPhoneNumber} // For the input field itself
            phoneCode={authPhoneCode}
            setPhoneCode={setAuthPhoneCode}
            password={authPassword}
            setPassword={setAuthPassword}
            onReset={() => performFullReset(authStep !== 'initial')}
          />
        </main>
        <footer ref={footerRef} className="py-4 px-4 sm:px-6 lg:px-8 text-center border-t"><p className="text-sm text-muted-foreground">Telegram Cloudifier &copy; {new Date().getFullYear()}</p></footer>
      </>
    );
  }

  // Main App View
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
              <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground p-4">
                <LayoutPanelLeft className="w-16 h-16 mb-4 opacity-50" />
                <p className="text-lg mb-2">No chat selected.</p>
                <p className="text-sm mb-4">Select a chat folder or a cloud storage channel.</p>
                <div className="flex gap-4">
                  <Button onClick={pageDialogs.handleOpenChatSelectionDialog}><MessageSquare className="mr-2 h-5 w-5" /> Select Chat Folder</Button>
                  <Button onClick={pageDialogs.handleOpenCloudStorageSelector} variant="outline"><Cloud className="mr-2 h-5 w-5" /> Select Cloud Storage</Button>
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
        isLoadingMore={false} /* Cloud channels don't have load more for now */
        hasMore={false}      /* Cloud channels don't have load more for now */
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
        isLoading={fileOperationsManager.isProcessingVirtualFolder} // Re-use for now
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
          onChannelDetailsUpdatedAppLevel={(updatedChannel) => {
            // Update the main list of cloud channels in AppCloudChannelsManager
            appCloudChannelsManager.setAppManagedCloudFolders(prev => 
                prev.map(cf => cf.id === updatedChannel.id ? { ...cf, ...updatedChannel } : cf)
            );
            // If this is the currently selected folder, update it in SelectedMediaManager
            if (selectedMediaManager.selectedFolder?.id === updatedChannel.id) {
                selectedMediaManager.setSelectedFolder(prev => prev ? { ...prev, ...updatedChannel } : null);
            }
          }}
        />
      )}
    </div>
  );
}

