
"use client";

import { useState, useCallback } from 'react';

export function usePageDialogsVisibility() {
  const [isChatSelectionDialogOpen, setIsChatSelectionDialogOpen] = useState(false);
  const [isCloudStorageSelectorOpen, setIsCloudStorageSelectorOpen] = useState(false);
  const [isCreateCloudChannelDialogOpen, setIsCreateCloudChannelDialogOpen] = useState(false);
  const [isCreateVirtualFolderDialogOpen, setIsCreateVirtualFolderDialogOpen] = useState(false);
  const [virtualFolderParentPath, setVirtualFolderParentPath] = useState<string>("/"); // State for VFS dialog

  const handleOpenChatSelectionDialog = useCallback(() => setIsChatSelectionDialogOpen(true), []);
  const handleOpenCloudStorageSelector = useCallback(() => setIsCloudStorageSelectorOpen(true), []);
  
  const handleOpenCreateCloudChannelDialog = useCallback(() => setIsCreateCloudChannelDialogOpen(true), []);
  
  const handleOpenCreateVirtualFolderDialog = useCallback((path: string) => {
    setVirtualFolderParentPath(path || "/");
    setIsCreateVirtualFolderDialogOpen(true);
  }, []);
  
  const resetAllDialogsVisibility = useCallback(() => {
    setIsChatSelectionDialogOpen(false);
    setIsCloudStorageSelectorOpen(false);
    setIsCreateCloudChannelDialogOpen(false);
    setIsCreateVirtualFolderDialogOpen(false);
    setVirtualFolderParentPath("/");
  }, []);

  return {
    isChatSelectionDialogOpen,
    setIsChatSelectionDialogOpen,
    isCloudStorageSelectorOpen,
    setIsCloudStorageSelectorOpen,
    isCreateCloudChannelDialogOpen,
    setIsCreateCloudChannelDialogOpen,
    isCreateVirtualFolderDialogOpen,
    setIsCreateVirtualFolderDialogOpen,
    virtualFolderParentPath, // Expose for CreateVirtualFolderDialog
    setVirtualFolderParentPath, // Expose setter

    handleOpenChatSelectionDialog,
    handleOpenCloudStorageSelector,
    handleOpenCreateCloudChannelDialog,
    handleOpenCreateVirtualFolderDialog,
    resetAllDialogsVisibility,
  };
}
