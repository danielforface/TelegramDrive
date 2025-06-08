
"use client";

import { useState, useCallback } from 'react';
import type { CloudFile, InputPeer, CloudChannelConfigV1, CloudChannelConfigEntry, ClipboardItemType } from '@/types';
import * as telegramService from '@/services/telegramService';
import type { useToast } from "@/hooks/use-toast";
import { normalizePath, parseVfsPathFromCaption } from '@/lib/vfsUtils';

export type ItemToDeleteType =
  | { type: 'file'; file: CloudFile; parentInputPeer?: InputPeer | null }
  | { type: 'virtualFolder'; path: string; name: string; parentInputPeer?: InputPeer | null };

interface UseFileOperationsManagerProps {
  toast: ReturnType<typeof useToast>['toast'];
  handleGlobalApiError: (error: any, title: string, defaultMessage: string, doPageReset?: boolean) => void;
  // From other hooks / page state
  selectedFolder: CloudFolder | null;
  currentVirtualPath: string;
  currentChatMedia: CloudFile[];
  setCurrentChatMedia: React.Dispatch<React.SetStateAction<CloudFile[]>>;
  updateSelectedFolderConfig: (config: CloudChannelConfigV1) => void; // From useSelectedMediaManager
  setAppManagedCloudFoldersState: React.Dispatch<React.SetStateAction<CloudFolder[]>>; // From useAppCloudChannelsManager
  fetchInitialChatMediaForSelectedManager: (folderToLoad: CloudFolder) => Promise<void>; // From useSelectedMediaManager
}

export function useFileOperationsManager({
  toast,
  handleGlobalApiError,
  selectedFolder,
  currentVirtualPath,
  currentChatMedia,
  setCurrentChatMedia,
  updateSelectedFolderConfig,
  setAppManagedCloudFoldersState,
  fetchInitialChatMediaForSelectedManager,
}: UseFileOperationsManagerProps) {
  const [selectedFileForDetails, setSelectedFileForDetails] = useState<CloudFile | null>(null);
  const [isDetailsPanelOpen, setIsDetailsPanelOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<ItemToDeleteType | null>(null);
  const [isDeleteItemDialogOpen, setIsDeleteItemDialogOpen] = useState(false);
  const [isProcessingDeletion, setIsProcessingDeletion] = useState(false);
  const [clipboardItem, setClipboardItem] = useState<ClipboardItemType>(null);
  const [isProcessingVirtualFolder, setIsProcessingVirtualFolder] = useState(false); // For paste operations too

  const handleOpenFileDetails = useCallback((file: CloudFile) => {
    setSelectedFileForDetails(file);
    setIsDetailsPanelOpen(true);
  }, []);

  const handleCloseFileDetails = useCallback(() => {
    setIsDetailsPanelOpen(false);
    setTimeout(() => setSelectedFileForDetails(null), 300); // Delay to allow animation
  }, []);

  const handleRequestDeleteItem = useCallback((itemType: 'file' | 'virtualFolder', itemData: CloudFile | { path: string, name: string }, parentPeer?: InputPeer | null) => {
    const peerForDeletion = parentPeer || selectedFolder?.inputPeer;
    if (!peerForDeletion) {
      toast({ title: "Error", description: "Cannot determine target for deletion: InputPeer is missing.", variant: "destructive" });
      return;
    }

    if (itemType === 'file') {
      setItemToDelete({ type: 'file', file: itemData as CloudFile, parentInputPeer: peerForDeletion });
    } else {
      const { path, name } = itemData as { path: string, name: string };
      setItemToDelete({ type: 'virtualFolder', path, name, parentInputPeer: peerForDeletion });
    }
    setIsDeleteItemDialogOpen(true);
  }, [selectedFolder, toast]);

  const handleConfirmDeletion = useCallback(async () => {
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
        } else {
          throw new Error("Telegram service failed to delete the message.");
        }
      } else if (itemToDelete.type === 'virtualFolder') {
        const { path, name, parentInputPeer } = itemToDelete;
        if (!parentInputPeer) throw new Error("InputPeer missing for virtual folder deletion.");

        const updatedConfig = await telegramService.removeVirtualFolderFromCloudChannel(parentInputPeer, path);
        if (updatedConfig) {
          toast({ title: "Virtual Folder Deleted", description: `Folder "${name}" has been removed.` });
          updateSelectedFolderConfig(updatedConfig);
          setAppManagedCloudFoldersState(prevList =>
            prevList.map(cf => cf.id === selectedFolder?.id ? { ...cf, cloudConfig: updatedConfig } : cf)
          );
        } else {
          throw new Error("Failed to update cloud configuration after deleting virtual folder.");
        }
      }
    } catch (error: any) {
      handleGlobalApiError(error, `Error Deleting ${itemToDelete.type === 'file' ? 'File' : 'Virtual Folder'}`, error.message || "Could not complete deletion.");
    } finally {
      setIsProcessingDeletion(false);
      setIsDeleteItemDialogOpen(false);
      setItemToDelete(null);
    }
  }, [itemToDelete, toast, setCurrentChatMedia, updateSelectedFolderConfig, setAppManagedCloudFoldersState, selectedFolder, handleGlobalApiError]);

  const handleCopyFileOp = useCallback((file: CloudFile) => {
    if (!selectedFolder || !selectedFolder.inputPeer) {
      toast({ title: "Error", description: "Cannot copy: Selected folder or its peer is invalid.", variant: "destructive" });
      return;
    }
    const currentFileVfsPath = parseVfsPathFromCaption(file.caption);
    setClipboardItem({
      type: 'file',
      file: { ...file }, // Shallow copy file
      originalPath: currentFileVfsPath || currentVirtualPath,
      parentInputPeer: selectedFolder.inputPeer
    });
    toast({ title: "File Copied", description: `"${file.name}" copied to clipboard.` });
  }, [selectedFolder, currentVirtualPath, toast]);

  const handleCopyFolderStructureOp = useCallback((folderName: string, folderConfig: CloudChannelConfigEntry) => {
    if (!selectedFolder || !selectedFolder.isAppManagedCloud || !selectedFolder.inputPeer) {
      toast({ title: "Error", description: "Cannot copy: Not in a cloud channel or peer is invalid.", variant: "destructive" });
      return;
    }
    setClipboardItem({
      type: 'folder',
      folderName,
      folderConfig: JSON.parse(JSON.stringify(folderConfig)), // Deep copy
      originalPath: normalizePath(currentVirtualPath + folderName),
      parentInputPeer: selectedFolder.inputPeer
    });
    toast({ title: "Folder Structure Copied", description: `Structure for "${folderName}" copied.` });
  }, [selectedFolder, currentVirtualPath, toast]);

  const handlePasteItemOp = useCallback(async (targetPath: string, openCreateVirtualFolderDialog: (path: string) => void) => {
    if (!clipboardItem) {
      toast({ title: "Clipboard Empty", description: "Nothing to paste.", variant: "default" });
      return;
    }
    if (!selectedFolder || !selectedFolder.inputPeer || !selectedFolder.isAppManagedCloud) {
      toast({ title: "Paste Error", description: "Pasting is only supported within cloud channels.", variant: "destructive" });
      return;
    }

    setIsProcessingVirtualFolder(true);
    const targetInputPeer = selectedFolder.inputPeer;

    try {
      if (clipboardItem.type === 'file') {
        const { file, originalPath: sourceOriginalPath } = clipboardItem;
        if (normalizePath(sourceOriginalPath || '') === normalizePath(targetPath)) {
          toast({ title: "Paste Skipped", description: "File is already in this location.", variant: "default" });
          return;
        }
        const newCaption = JSON.stringify({ path: normalizePath(targetPath) });
        const success = await telegramService.editMessageCaption(targetInputPeer, file.messageId, newCaption);
        if (success) {
          toast({ title: "File Moved", description: `"${file.name}" moved to ${targetPath}.` });
          setClipboardItem(null);
          if (selectedFolder) fetchInitialChatMediaForSelectedManager(selectedFolder); // Refresh
        } else {
          toast({ title: "Move Failed", description: "Could not update file caption.", variant: "destructive" });
        }
      } else if (clipboardItem.type === 'folder') {
        const { folderName, folderConfig } = clipboardItem;
        // Logic for creating virtual folder with structure, can call a service function
        const updatedConfig = await telegramService.addVirtualFolderToCloudChannel(
            targetInputPeer,
            targetPath, // Parent path for the new folder
            folderName,  // Name of the folder to create/paste
            folderConfig.entries // The structure to paste
        );
         if (updatedConfig) {
            toast({ title: "Folder Structure Pasted", description: `Structure "${folderName}" pasted into ${targetPath}.` });
            updateSelectedFolderConfig(updatedConfig);
            setAppManagedCloudFoldersState(prevList =>
                prevList.map(cf => cf.id === selectedFolder?.id ? { ...cf, cloudConfig: updatedConfig } : cf)
            );
            setClipboardItem(null);
        } else {
            toast({ title: "Paste Failed", description: "Could not paste folder structure.", variant: "destructive" });
        }
      }
    } catch (error: any) {
      handleGlobalApiError(error, "Paste Error", error.message || "An unknown error occurred.");
    } finally {
      setIsProcessingVirtualFolder(false);
    }
  }, [clipboardItem, selectedFolder, toast, handleGlobalApiError, fetchInitialChatMediaForSelectedManager, updateSelectedFolderConfig, setAppManagedCloudFoldersState]);
  
  const resetFileOperations = useCallback(() => {
    setSelectedFileForDetails(null);
    setIsDetailsPanelOpen(false);
    setItemToDelete(null);
    setIsDeleteItemDialogOpen(false);
    setIsProcessingDeletion(false);
    setClipboardItem(null);
    setIsProcessingVirtualFolder(false);
  }, []);


  return {
    selectedFileForDetails,
    isDetailsPanelOpen,
    itemToDelete,
    isDeleteItemDialogOpen,
    isProcessingDeletion,
    clipboardItem,
    setClipboardItem, // For clearing from other hooks if needed
    isProcessingVirtualFolder, // For VFS creation/paste
    setIsProcessingVirtualFolder, // For VFS creation
    handleOpenFileDetails,
    handleCloseFileDetails,
    handleRequestDeleteItem,
    handleConfirmDeletion,
    handleCancelDeletion: () => setIsDeleteItemDialogOpen(false),
    handleCopyFileOp,
    handleCopyFolderStructureOp,
    handlePasteItemOp,
    resetFileOperations,
  };
}
