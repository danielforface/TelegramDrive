
"use client";

import type { CloudFolder, DialogFilter } from "@/types";
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
import { FolderTabsBar } from "./folder-tabs-bar"; // Import FolderTabsBar

interface ChatSelectionDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  
  // Folder (DialogFilter) management props
  dialogFilters: DialogFilter[];
  activeDialogFilterId: number | null;
  onSelectDialogFilter: (filterId: number) => void;
  isLoadingDialogFilters: boolean;
  isReorderingFolders: boolean;
  onToggleReorderFolders: () => void;
  onMoveFilter: (dragIndex: number, hoverIndex: number) => void;
  onShareFilter: (filterId: number) => void;
  onAddFilterPlaceholder: () => void;

  // Chat list props
  folders: CloudFolder[]; // These are the actual chats within the selected DialogFilter
  selectedFolderId: string | null; // ID of the selected chat (CloudFolder)
  onSelectFolder: (folderId: string) => void; // Callback when a chat is selected
  lastItemRef?: (node: HTMLLIElement | null) => void; // For infinite scroll of chats
  isLoading: boolean; // For initial load of chats
  isLoadingMore: boolean; // For loading more chats
  hasMore: boolean; // If more chats can be loaded
  onLoadMore: () => void; // To trigger loading more chats
  onRefresh: () => void; // To trigger a refresh of the chat list
}

export function ChatSelectionDialog({
  isOpen,
  onOpenChange,
  // Folder props
  dialogFilters,
  activeDialogFilterId,
  onSelectDialogFilter,
  isLoadingDialogFilters,
  isReorderingFolders,
  onToggleReorderFolders,
  onMoveFilter,
  onShareFilter,
  onAddFilterPlaceholder,
  // Chat list props
  folders,
  selectedFolderId,
  onSelectFolder,
  lastItemRef,
  isLoading,
  isLoadingMore,
  hasMore,
  onLoadMore,
  onRefresh,
}: ChatSelectionDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl p-0 flex flex-col max-h-[90vh]"> {/* Increased max-width */}
        <DialogHeader className="p-6 border-b">
          <div className="flex items-center gap-2">
             <MessageSquare className="h-6 w-6 text-primary" />
            <DialogTitle>Select a Chat</DialogTitle>
          </div>
          <DialogDescription>
            First, select a folder tab, then choose a conversation.
          </DialogDescription>
        </DialogHeader>

        {/* Folder Tabs Bar integrated here */}
        <FolderTabsBar
          filters={dialogFilters}
          activeFilterId={activeDialogFilterId}
          onSelectFilter={onSelectDialogFilter}
          isLoading={isLoadingDialogFilters}
          isReorderingMode={isReorderingFolders}
          onToggleReorderMode={onToggleReorderFolders}
          onMoveFilter={onMoveFilter}
          onShareFilter={onShareFilter}
          onAddFilterPlaceholder={onAddFilterPlaceholder}
          className="flex-shrink-0 sticky top-0 z-10" // Make tabs bar sticky
        />

        <ScrollArea className="flex-grow overflow-y-auto px-6 py-4">
          {isLoading && folders.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full py-10">
              <Loader2 className="animate-spin h-8 w-8 text-primary mb-3" />
              <p className="text-muted-foreground">Loading chats for selected folder...</p>
            </div>
          ) : folders.length === 0 && !isLoadingMore ? (
            <div className="flex flex-col items-center justify-center h-full py-10">
              <p className="text-muted-foreground mb-3">No chats found in this folder.</p>
              <Button onClick={onRefresh} variant="outline" disabled={isLoading}>
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
                    // Optionally close dialog on selection, or keep it open for quick switching
                    // onOpenChange(false); 
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
              All chats in this folder loaded.
            </p>
          )}
        </ScrollArea>
        <DialogFooter className="p-4 border-t flex-shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
