
"use client";

import { useState, useCallback, useRef } from 'react';
import type { ExtendedFile, CloudFolder } from '@/types';
import * as telegramService from '@/services/telegramService';
import type { useToast } from "@/hooks/use-toast";
import { normalizePath } from '@/lib/vfsUtils';

interface UseUploadManagerProps {
  toast: ReturnType<typeof useToast>['toast'];
  selectedFolder: CloudFolder | null; // From useSelectedMediaManager
  currentVirtualPath: string; // From useSelectedMediaManager
  refreshMediaCallback?: () => void; // Callback to refresh media list after upload
}

export function useUploadManager({
  toast,
  selectedFolder,
  currentVirtualPath,
  refreshMediaCallback,
}: UseUploadManagerProps) {
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
  const [filesToUpload, setFilesToUpload] = useState<ExtendedFile[]>([]);
  const [isUploadingFiles, setIsUploadingFiles] = useState(false);
  const uploadAbortControllersRef = useRef<Map<string, AbortController>>(new Map());

  const handleOpenUploadFilesDialog = useCallback(() => {
    if (!selectedFolder) {
      toast({ title: "No Chat Selected", description: "Please select a chat first to upload files to.", variant: "default" });
      return;
    }
    setIsUploadDialogOpen(true);
  }, [selectedFolder, toast]);

  const handleCloseUploadFilesDialog = useCallback(() => {
    if (isUploadingFiles) {
      toast({ title: "Upload in Progress", description: "Please wait for uploads to complete or cancel them.", variant: "default" });
      return;
    }
    setIsUploadDialogOpen(false);
    setFilesToUpload([]); // Clear list on close
    uploadAbortControllersRef.current.forEach((controller) => {
      if (!controller.signal.aborted) controller.abort("Upload dialog closed");
    });
    uploadAbortControllersRef.current.clear();
  }, [isUploadingFiles, toast]);

  const handleFilesSelectedForUploadList = useCallback((selectedNativeFiles: FileList | null) => {
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
      if (newExtendedFiles.length > 0) {
        toast({ title: "Files Ready", description: `${newExtendedFiles.length} file(s) added to upload list.` });
      }
    }
  }, [toast]);

  const handleStartFileUploads = useCallback(async () => {
    const filesToAttemptUpload = filesToUpload.filter(f => ['pending', 'failed', 'cancelled'].includes(f.uploadStatus));
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
      if (['completed', 'uploading', 'processing'].includes(fileToUpload.uploadStatus)) continue;

      const controller = new AbortController();
      uploadAbortControllersRef.current.set(fileToUpload.id, controller);

      const updateUiForFile = (fileId: string, progress: number, status: ExtendedFile['uploadStatus']) => {
        setFilesToUpload(prev => prev.map(f => f.id === fileId ? { ...f, uploadProgress: progress, uploadStatus: status } : f));
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
          (percent) => updateUiForFile(fileToUpload.id, percent, percent === 100 ? 'processing' : 'uploading'),
          controller.signal,
          captionForUpload
        );
        updateUiForFile(fileToUpload.id, 100, 'completed');
        toast({ title: "Upload Successful!", description: `${fileToUpload.name} uploaded to ${selectedFolder.name}.` });
        if (refreshMediaCallback) refreshMediaCallback(); // Refresh media list
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
  }, [filesToUpload, selectedFolder, currentVirtualPath, toast, refreshMediaCallback]);

  const resetUploadManager = useCallback(() => {
    setIsUploadDialogOpen(false);
    setFilesToUpload([]);
    setIsUploadingFiles(false);
    uploadAbortControllersRef.current.forEach((controller) => {
      if (!controller.signal.aborted) controller.abort("User reset application state");
    });
    uploadAbortControllersRef.current.clear();
  }, []);

  return {
    isUploadDialogOpen,
    filesToUpload,
    isUploadingFiles,
    handleOpenUploadFilesDialog,
    handleCloseUploadFilesDialog,
    handleFilesSelectedForUploadList,
    handleStartFileUploads,
    resetUploadManager,
    uploadAbortControllersRefForReset: uploadAbortControllersRef, // For full reset from page
  };
}
