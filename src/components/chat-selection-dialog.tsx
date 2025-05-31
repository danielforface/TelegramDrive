
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
import { FolderTabsBar } from "./folder-tabs-bar"; 

interface ChatSelectionDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  
  dialogFilters: DialogFilter[];
  activeDialogFilterId: number | null;
  onSelectDialogFilter: (filterId: number) => void;
  isLoadingDialogFilters: boolean;
  isReorderingFolders: boolean;
  onToggleReorderFolders: () => void;
  onMoveFilter: (dragIndex: number, hoverIndex: number) => void;
  onShareFilter: (filterId: number) => void;
  onAddFilterPlaceholder: () => void;

  folders: CloudFolder[]; 
  selectedFolderId: string | null; 
  onSelectFolder: (folderId: string) => void; 
  isLoading: boolean; 
  isLoadingMore: boolean; 
  hasMore: boolean; 
  onLoadMore: () => void; 
  onRefresh: () => void; 
  currentErrorMessage?: string | null; // Added for consistency
}

export function ChatSelectionDialog({
  isOpen,
  onOpenChange,
  dialogFilters,
  activeDialogFilterId,
  onSelectDialogFilter,
  isLoadingDialogFilters,
  isReorderingFolders,
  onToggleReorderFolders,
  onMoveFilter,
  onShareFilter,
  onAddFilterPlaceholder,
  folders,
  selectedFolderId,
  onSelectFolder,
  isLoading,
  isLoadingMore,
  hasMore,
  onLoadMore,
  onRefresh,
  currentErrorMessage,
}: ChatSelectionDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl p-0 flex flex-col max-h-[90vh]"> 
        <DialogHeader className="p-6 border-b">
          <div className="flex items-center gap-2">
             <MessageSquare className="h-6 w-6 text-primary" />
            <DialogTitle>Select a Chat</DialogTitle>
          </div>
          <DialogDescription>
            First, select a folder tab, then choose a conversation.
          </DialogDescription>
        </DialogHeader>

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
          className="flex-shrink-0 sticky top-0 z-10" 
        />

        <ScrollArea className="flex-grow overflow-y-auto px-6 py-4">
          {isLoading && folders.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full py-10">
              <Loader2 className="animate-spin h-8 w-8 text-primary mb-3" />
              <p className="text-muted-foreground">Loading chats for selected folder...</p>
            </div>
          ) : folders.length === 0 && !isLoadingMore ? (
            <div className="flex flex-col items-center justify-center h-full py-10">
              <p className="text-muted-foreground mb-3">
                {currentErrorMessage ? currentErrorMessage : "No chats found in this folder."}
              </p>
              <Button onClick={onRefresh} variant="outline" disabled={isLoading}>
                <RefreshCw className="mr-2 h-4 w-4" /> Try Refresh
              </Button>
            </div>
          ) : (
            <>
              <ul className="space-y-1">
                {folders.map((folder) => ( // Removed index and lastItemRef from here
                  <ChatListItem
                    key={folder.id}
                    folder={folder}
                    isSelected={folder.id === selectedFolderId}
                    onSelect={() => {
                      onSelectFolder(folder.id);
                    }}
                    // ref prop removed
                  />
                ))}
              </ul>
              {!isLoading && hasMore && folders.length > 0 && (
                <div className="flex justify-center py-4 mt-2">
                  <Button
                    onClick={onLoadMore}
                    disabled={isLoadingMore}
                    variant="outline"
                  >
                    {isLoadingMore ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : null}
                    Load More Chats
                  </Button>
                </div>
              )}
              {!isLoadingMore && !hasMore && folders.length > 0 && (
                <p className="text-center text-xs text-muted-foreground py-4">
                  All chats in this folder loaded.
                </p>
              )}
            </>
          )}
          {isLoadingMore && folders.length > 0 && ( // Show loader if loading more and list is not empty
            <div className="flex justify-center items-center py-4">
              <Loader2 className="animate-spin h-5 w-5 text-primary" />
              <p className="ml-2 text-sm text-muted-foreground">Loading more chats...</p>
            </div>
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


    