
"use client";

import { useState, useCallback } from 'react';
import type { CloudFolder } from '@/types'; // Added CloudFolder for context

export function usePageDialogsVisibility() {
  const [isChatSelectionDialogOpen, setIsChatSelectionDialogOpen] = useState(false);
  const [isCloudStorageSelectorOpen, setIsCloudStorageSelectorOpen] = useState(false);
  const [isCreateCloudChannelDialogOpen, setIsCreateCloudChannelDialogOpen] = useState(false);
  const [isCreateVirtualFolderDialogOpen, setIsCreateVirtualFolderDialogOpen] = useState(false);
  const [virtualFolderParentPath, setVirtualFolderParentPath] = useState<string>("/"); // State for VFS dialog
  const [isManageCloudChannelDialogOpen, setIsManageCloudChannelDialogOpen] = useState(false);
  const [managingCloudChannelContext, setManagingCloudChannelContext] = useState<CloudFolder | null>(null);


  const handleOpenChatSelectionDialog = useCallback(() => setIsChatSelectionDialogOpen(true), []);
  const handleOpenCloudStorageSelector = useCallback(() => setIsCloudStorageSelectorOpen(true), []);
  
  const handleOpenCreateCloudChannelDialog = useCallback(() => setIsCreateCloudChannelDialogOpen(true), []);
  
  const handleOpenCreateVirtualFolderDialog = useCallback((path: string) => {
    setVirtualFolderParentPath(path || "/");
    setIsCreateVirtualFolderDialogOpen(true);
  }, []);

  const handleOpenManageCloudChannelDialog = useCallback((channel: CloudFolder) => {
    setManagingCloudChannelContext(channel);
    setIsManageCloudChannelDialogOpen(true);
  }, []);
  
  const resetAllDialogsVisibility = useCallback(() => {
    setIsChatSelectionDialogOpen(false);
    setIsCloudStorageSelectorOpen(false);
    setIsCreateCloudChannelDialogOpen(false);
    setIsCreateVirtualFolderDialogOpen(false);
    setVirtualFolderParentPath("/");
    setIsManageCloudChannelDialogOpen(false);
    setManagingCloudChannelContext(null);
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
    isManageCloudChannelDialogOpen,
    setIsManageCloudChannelDialogOpen,
    managingCloudChannelContext,
    setManagingCloudChannelContext,


    handleOpenChatSelectionDialog,
    handleOpenCloudStorageSelector,
    handleOpenCreateCloudChannelDialog,
    handleOpenCreateVirtualFolderDialog,
    handleOpenManageCloudChannelDialog,
    resetAllDialogsVisibility,
  };
}

