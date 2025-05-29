
"use client";

import type { CloudFolder } from "@/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, MessageSquare } from "lucide-react";
import { ChatListItem } from "./chat-list-item";

interface ChatSelectionDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  folders: CloudFolder[];
  selectedFolderId: string | null;
  onSelectFolder: (folderId: string) => void;
  lastItemRef?: (node: HTMLLIElement | null) => void;
  isLoading: boolean; // For initial load
  isLoadingMore: boolean; // For loading more items
  hasMore: boolean;
  onLoadMore: () => void; // To trigger loading more chats
  onRefresh: () => void; // To trigger a refresh of the chat list
}

export function ChatSelectionDialog({
  isOpen,
  onOpenChange,
  folders,
  selectedFolderId,
  onSelectFolder,
  lastItemRef,
  isLoading,
  isLoadingMore,
  hasMore,
  onLoadMore, // Should be called by IntersectionObserver logic if needed
  onRefresh,
}: ChatSelectionDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg p-0 flex flex-col max-h-[80vh]">
        <DialogHeader className="p-6 border-b">
          <div className="flex items-center gap-2">
             <MessageSquare className="h-6 w-6 text-primary" />
            <DialogTitle>Select a Chat</DialogTitle>
          </div>
          <DialogDescription>
            Choose a conversation to view its media content.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-grow overflow-y-auto px-6 py-4">
          {isLoading && folders.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full py-10">
              <Loader2 className="animate-spin h-8 w-8 text-primary mb-3" />
              <p className="text-muted-foreground">Loading chats...</p>
            </div>
          ) : folders.length === 0 && !isLoadingMore ? (
            <div className="flex flex-col items-center justify-center h-full py-10">
              <p className="text-muted-foreground mb-3">No chats found.</p>
              <Button onClick={onRefresh} variant="outline">
                <RefreshCw className="mr-2 h-4 w-4" /> Try Refresh
              </Button>
            </div>
          ) : (
            <ul className="space-y-1">
              {folders.map((folder, index) => (
                <ChatListItem
                  key={folder.id}
                  folder={folder}
                  isSelected={folder.id === selectedFolderId}
                  onSelect={() => {
                    onSelectFolder(folder.id);
                    onOpenChange(false); // Close dialog on selection
                  }}
                  ref={index === folders.length - 1 ? lastItemRef : null}
                />
              ))}
            </ul>
          )}
          {isLoadingMore && (
            <div className="flex justify-center items-center py-4">
              <Loader2 className="animate-spin h-5 w-5 text-primary" />
              <p className="ml-2 text-sm text-muted-foreground">Loading more chats...</p>
            </div>
          )}
          {!isLoadingMore && !hasMore && folders.length > 0 && (
            <p className="text-center text-xs text-muted-foreground py-4">
              All chats loaded.
            </p>
          )}
        </ScrollArea>
        <DialogFooter className="p-4 border-t flex-shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
