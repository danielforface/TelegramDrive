
"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

interface DeleteItemConfirmationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isLoading: boolean;
  itemName: string;
  itemType: 'file' | 'folder' | 'virtualFolder' | 'item'; // Extended for clarity
}

export function DeleteItemConfirmationDialog({
  isOpen,
  onClose,
  onConfirm,
  isLoading,
  itemName,
  itemType,
}: DeleteItemConfirmationDialogProps) {
  const title = `Delete ${itemType === 'virtualFolder' ? 'Virtual Folder' : itemType === 'folder' ? 'Folder' : 'File'}?`;
  const description = `Are you sure you want to delete "${itemName}"? This action cannot be undone.`;
  const deletingText = `Deleting ${itemType === 'virtualFolder' ? 'virtual folder' : itemType}...`;
  const confirmButtonText = "Delete";

  return (
    <AlertDialog open={isOpen} onOpenChange={onClose}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>
            {description}
            {itemType === 'virtualFolder' && (
                <p className="mt-2 text-xs text-orange-600">
                    Note: This will only remove the virtual folder entry. Files within this virtual path in Telegram will not be deleted but will become "orphaned" from this view.
                </p>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onClose} disabled={isLoading}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={isLoading}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {deletingText}
              </>
            ) : (
              confirmButtonText
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

    