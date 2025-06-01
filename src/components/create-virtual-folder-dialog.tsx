
"use client";

import React, { useState, useEffect } from 'react';
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FolderPlus, X, Loader2 } from "lucide-react";

interface CreateVirtualFolderDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (folderName: string) => Promise<void>;
  isLoading?: boolean;
  parentPath?: string;
}

export function CreateVirtualFolderDialog({
  isOpen,
  onClose,
  onCreate,
  isLoading,
  parentPath,
}: CreateVirtualFolderDialogProps) {
  const [folderName, setFolderName] = useState('');

  useEffect(() => {
    if (isOpen) {
      setFolderName(''); // Reset folder name when dialog opens
    }
  }, [isOpen]);

  const handleSubmit = async () => {
    if (!folderName.trim()) {
      // Simple validation, can be enhanced with toast
      alert("Folder name cannot be empty and cannot contain '/' or be '.' or '..'.");
      return;
    }
    if (folderName.includes('/') || folderName === '.' || folderName === '..') {
      alert("Folder name cannot contain '/' or be '.' or '..'.");
      return;
    }
    await onCreate(folderName.trim());
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <FolderPlus className="h-6 w-6 text-primary" />
            <DialogTitle>Create New Virtual Folder</DialogTitle>
          </div>
          <DialogDescription>
            Enter a name for the new folder.
            {parentPath && <span className="block text-xs mt-1">Parent path: {parentPath}</span>}
          </DialogDescription>
          <DialogClose className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-secondary">
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </DialogClose>
        </DialogHeader>

        <div className="py-4 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="virtual-folder-name">Folder Name</Label>
            <Input
              id="virtual-folder-name"
              value={folderName}
              onChange={(e) => setFolderName(e.target.value)}
              placeholder="e.g., Project Documents"
              disabled={isLoading}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !isLoading && folderName.trim()) {
                  handleSubmit();
                }
              }}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isLoading || !folderName.trim()}>
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : (
              "Create Folder"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
