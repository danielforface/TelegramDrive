
"use client";

import React, { useCallback, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { UploadCloud, FileText, X, Loader2, CheckCircle, AlertTriangle } from "lucide-react"; // Added CheckCircle, AlertTriangle
import { useToast } from "@/hooks/use-toast";
import { formatFileSize } from '@/lib/utils';
import type { ExtendedFile } from '@/types'; // Import ExtendedFile

interface UploadDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onFilesSelected: (files: FileList | null) => void;
  onUpload: () => void;
  selectedFiles: ExtendedFile[]; // Use ExtendedFile here
  isLoading?: boolean; 
}

export function UploadDialog({
  isOpen,
  onClose,
  onFilesSelected,
  onUpload,
  selectedFiles,
  isLoading,
}: UploadDialogProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const { toast } = useToast();

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    onFilesSelected(event.target.files);
    if(event.target.files && event.target.files.length > 0) {
        toast({ title: "Files Selected", description: `${event.target.files.length} file(s) added to upload queue.`});
    }
    // Clear the input value to allow selecting the same file again
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleDropZoneClick = () => {
    fileInputRef.current?.click();
  };

  const handleDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDraggingOver(true);
  }, []);

  const handleDragLeave = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDraggingOver(false);
  }, []);

  const handleDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDraggingOver(false);
    if (event.dataTransfer.files && event.dataTransfer.files.length > 0) {
      onFilesSelected(event.dataTransfer.files);
       toast({ title: "Files Dropped", description: `${event.dataTransfer.files.length} file(s) added to upload queue.`});
      event.dataTransfer.clearData();
    }
  }, [onFilesSelected, toast]);

  const handleUploadClick = () => {
    if (selectedFiles.filter(f => f.uploadStatus !== 'completed' && f.uploadStatus !== 'uploading').length === 0) {
      toast({
        title: "No new files to upload",
        description: "Please select new files or clear completed/failed ones to upload again.",
        variant: "default",
      });
      return;
    }
    onUpload();
  };
  
  const filesReadyForUpload = selectedFiles.filter(f => f.uploadStatus !== 'completed' && f.uploadStatus !== 'uploading').length;


  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg p-0 flex flex-col max-h-[80vh]">
        <DialogHeader className="p-6 border-b">
          <div className="flex items-center gap-2">
            <UploadCloud className="h-6 w-6 text-primary" />
            <DialogTitle>Upload Files</DialogTitle>
          </div>
          <DialogDescription>
            Drag and drop files here or click to select files from your computer.
          </DialogDescription>
          <DialogClose className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-secondary">
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </DialogClose>
        </DialogHeader>

        <div className="flex-grow p-6 space-y-4 overflow-y-auto">
          <div
            ref={dropZoneRef}
            onClick={handleDropZoneClick}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`w-full p-8 border-2 border-dashed rounded-lg flex flex-col items-center justify-center text-center cursor-pointer transition-colors
                        ${isDraggingOver ? "border-primary bg-primary/10" : "border-border hover:border-primary/50"}`}
          >
            <UploadCloud className={`w-12 h-12 mb-3 ${isDraggingOver ? 'text-primary' : 'text-muted-foreground'}`} />
            <p className="text-sm text-muted-foreground">
              {isDraggingOver ? "Drop files here" : "Drag & drop files or click to browse"}
            </p>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              multiple
              className="hidden"
            />
          </div>

          {selectedFiles.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-muted-foreground">Selected files ({selectedFiles.length}):</h4>
              <ScrollArea className="h-40 border rounded-md p-2 bg-muted/20">
                <ul className="space-y-1.5">
                  {selectedFiles.map((file, index) => (
                    <li key={`${file.name}-${file.lastModified}-${index}`} className="text-xs flex items-center justify-between p-2 bg-background rounded shadow-sm">
                      <div className="flex items-center truncate flex-1 min-w-0 mr-2">
                        <FileText className="w-4 h-4 mr-2 flex-shrink-0 text-muted-foreground" />
                        <span className="truncate" title={file.name}>{file.name}</span>
                      </div>
                      <div className="flex items-center flex-shrink-0">
                        <span className="text-muted-foreground mr-2">{formatFileSize(file.size)}</span>
                        {file.uploadStatus === 'uploading' && file.uploadProgress !== undefined && (
                           <span className="text-primary text-xs mr-1">({file.uploadProgress}%)</span>
                        )}
                        {file.uploadStatus === 'uploading' && <Loader2 className="w-4 h-4 text-primary animate-spin" />}
                        {file.uploadStatus === 'completed' && <CheckCircle className="w-4 h-4 text-green-500" />}
                        {file.uploadStatus === 'failed' && <AlertTriangle className="w-4 h-4 text-red-500" />}
                      </div>
                    </li>
                  ))}
                </ul>
              </ScrollArea>
            </div>
          )}
        </div>

        <DialogFooter className="p-6 border-t flex-shrink-0">
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={handleUploadClick} disabled={filesReadyForUpload === 0 || isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Uploading...
              </>
            ) : (
              `Upload ${filesReadyForUpload > 0 ? filesReadyForUpload : ''} File${filesReadyForUpload !== 1 ? 's' : ''}`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


    