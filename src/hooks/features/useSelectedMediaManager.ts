
"use client";

import { useState, useCallback } from 'react';
import type { CloudFolder, CloudFile, MediaHistoryResponse, InputPeer, CloudChannelConfigV1 } from '@/types';
import * as telegramService from '@/services/telegramService';
import type { useToast } from "@/hooks/use-toast";
import { normalizePath } from '@/lib/vfsUtils';

const INITIAL_MEDIA_LOAD_LIMIT = 20;
const CLOUD_CHANNEL_INITIAL_MESSAGES_LOAD_LIMIT = 100;
const SUBSEQUENT_MEDIA_LOAD_LIMIT = 20;

interface UseSelectedMediaManagerProps {
  toast: ReturnType<typeof useToast>['toast'];
  handleGlobalApiError: (error: any, title: string, defaultMessage: string, doPageReset?: boolean) => void;
  // From other hooks/page state
  displayedChatsFromChatList: CloudFolder[];
  appManagedCloudFoldersFromManager: CloudFolder[];
  setClipboardItem: (item: any) => void; // From useFileOperationsManager
}

export function useSelectedMediaManager({
  toast,
  handleGlobalApiError,
  displayedChatsFromChatList,
  appManagedCloudFoldersFromManager,
  setClipboardItem,
}: UseSelectedMediaManagerProps) {
  const [selectedFolder, setSelectedFolder] = useState<CloudFolder | null>(null);
  const [currentChatMedia, setCurrentChatMedia] = useState<CloudFile[]>([]);
  const [isLoadingChatMedia, setIsLoadingChatMedia] = useState(false);
  const [hasMoreChatMedia, setHasMoreChatMedia] = useState(true);
  const [currentMediaOffsetId, setCurrentMediaOffsetId] = useState<number>(0);
  const [currentVirtualPath, setCurrentVirtualPath] = useState<string>("/");

  const fetchInitialChatMediaForSelected = useCallback(async (folderToLoad: CloudFolder) => {
    if (!folderToLoad.inputPeer && !folderToLoad.isAppManagedCloud) {
      toast({ title: "Error", description: "Cannot load media: InputPeer data is missing for this chat.", variant: "destructive" });
      return;
    }

    setIsLoadingChatMedia(true);
    setCurrentChatMedia([]);
    setHasMoreChatMedia(true);
    setCurrentMediaOffsetId(0);
    setCurrentVirtualPath("/"); // Reset virtual path when a new folder is selected

    const isCloud = folderToLoad.isAppManagedCloud || false;
    const mediaLimit = isCloud ? CLOUD_CHANNEL_INITIAL_MESSAGES_LOAD_LIMIT : INITIAL_MEDIA_LOAD_LIMIT;

    toast({ title: `Loading ${isCloud ? 'Content' : 'Media'} for ${folderToLoad.name}`, description: "Fetching initial items..." });

    try {
      const response = await telegramService.getChatMediaHistory(
        folderToLoad.inputPeer!,
        mediaLimit,
        0, // offsetId for initial load
        isCloud
      );
      setCurrentChatMedia(response.files);
      setCurrentMediaOffsetId(response.nextOffsetId || 0);
      setHasMoreChatMedia(response.hasMore);
      if (response.files.length === 0 && !response.hasMore) {
        toast({ title: `No ${isCloud ? 'Content' : 'Media'} Found`, description: `No items in ${folderToLoad.name}.` });
      } else if (response.files.length > 0) {
        toast({ title: `${isCloud ? 'Content' : 'Media'} Loaded`, description: `Loaded ${response.files.length} initial items for ${folderToLoad.name}.` });
      }
    } catch (error: any) {
      handleGlobalApiError(error, `Error Fetching ${isCloud ? 'Content' : 'Media'} for ${folderToLoad.name}`, `Could not load items. ${error.message}`);
      setHasMoreChatMedia(false);
    } finally {
      setIsLoadingChatMedia(false);
    }
  }, [toast, handleGlobalApiError]);

  const handleSelectFolderOrChannel = useCallback((folderId: string, type: 'chat' | 'cloud') => {
    let folder: CloudFolder | undefined;
    if (type === 'chat') {
      folder = displayedChatsFromChatList.find(f => f.id === folderId);
    } else {
      folder = appManagedCloudFoldersFromManager.find(c => c.id === folderId);
    }

    if (folder) {
      setSelectedFolder(folder);
      fetchInitialChatMediaForSelected(folder);
      setClipboardItem(null); // Clear clipboard on folder change
    } else {
      setSelectedFolder(null);
      setCurrentChatMedia([]);
      setCurrentVirtualPath("/");
    }
  }, [displayedChatsFromChatList, appManagedCloudFoldersFromManager, fetchInitialChatMediaForSelected, setClipboardItem]);


  const loadMoreChatMediaForSelected = useCallback(async () => {
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
        toast({ title: `More ${isCloud ? 'Content' : 'Media'} Loaded`, description: `Loaded ${response.files.length} additional items.` });
      } else if (!response.hasMore) {
        toast({ title: `All ${isCloud ? 'Content' : 'Media'} Loaded`, description: `No more items to load for ${selectedFolder.name}.` });
      }
    } catch (error: any) {
      handleGlobalApiError(error, `Error Loading More ${isCloud ? 'Content' : 'Media'}`, `Could not load more items. ${error.message}`);
      setHasMoreChatMedia(false);
    } finally {
      setIsLoadingChatMedia(false);
    }
  }, [isLoadingChatMedia, hasMoreChatMedia, selectedFolder, currentMediaOffsetId, toast, handleGlobalApiError]);

  const handleNavigateVirtualPath = useCallback((path: string) => {
    setCurrentVirtualPath(normalizePath(path));
  }, []);

  const resetSelectedMedia = useCallback(() => {
    setSelectedFolder(null);
    setCurrentChatMedia([]);
    setIsLoadingChatMedia(false);
    setHasMoreChatMedia(true);
    setCurrentMediaOffsetId(0);
    setCurrentVirtualPath("/");
  }, []);
  
  const updateSelectedFolderConfig = useCallback((newConfig: CloudChannelConfigV1) => {
    setSelectedFolder(prev => prev ? { ...prev, cloudConfig: newConfig } : null);
  }, []);


  return {
    selectedFolder,
    setSelectedFolder, // Also expose setter for VFS ops
    currentChatMedia,
    setCurrentChatMedia, // Expose for VFS ops
    isLoadingChatMedia,
    hasMoreChatMedia,
    currentMediaOffsetId,
    currentVirtualPath,
    handleSelectFolderOrChannel,
    fetchInitialChatMediaForSelected,
    loadMoreChatMediaForSelected,
    handleNavigateVirtualPath,
    resetSelectedMedia,
    updateSelectedFolderConfig,
  };
}
