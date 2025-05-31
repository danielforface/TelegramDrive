
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
import { Loader2, RefreshCw, MessageSquare, Cloud } from "lucide-react"; // Added Cloud
import { ChatListItem } from "./chat-list-item";
import { FolderTabsBar } from "./folder-tabs-bar";
import { CLOUD_STORAGE_FILTER_ID } from "@/services/telegramService";

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
  onOpenCreateCloudChannelDialog: () => void;

  folders: CloudFolder[]; // This will be 'displayedChats' or 'appManagedCloudFolders' from page.tsx
  selectedFolderId: string | null;
  onSelectFolder: (folderId: string) => void;
  isLoading: boolean; // Combined loading state based on active tab
  isLoadingMore: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  onRefresh: () => void;
  currentErrorMessage?: string | null;
  isCloudStorageView?: boolean; // To differentiate UI for cloud storage tab
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
  onOpenCreateCloudChannelDialog,
  folders,
  selectedFolderId,
  onSelectFolder,
  isLoading,
  isLoadingMore,
  hasMore,
  onLoadMore,
  onRefresh,
  currentErrorMessage,
  isCloudStorageView,
}: ChatSelectionDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl p-0 flex flex-col max-h-[90vh]">
        <DialogHeader className="p-6 border-b">
          <div className="flex items-center gap-2">
             {isCloudStorageView ? <Cloud className="h-6 w-6 text-primary" /> : <MessageSquare className="h-6 w-6 text-primary" />}
            <DialogTitle>{isCloudStorageView ? "Select Cloud Storage" : "Select a Chat"}</DialogTitle>
          </div>
          <DialogDescription>
            {isCloudStorageView
              ? "Choose an app-managed cloud storage channel."
              : "First, select a folder tab, then choose a conversation. Or, create new cloud storage."}
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
          onOpenCreateCloudChannelDialog={onOpenCreateCloudChannelDialog}
          className="flex-shrink-0 sticky top-0 z-10"
        />

        <ScrollArea className="flex-grow overflow-y-auto px-6 py-4">
          {isLoading && folders.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full py-10">
              <Loader2 className="animate-spin h-8 w-8 text-primary mb-3" />
              <p className="text-muted-foreground">
                {isCloudStorageView ? "Loading cloud storage channels..." : "Loading chats..."}
              </p>
            </div>
          ) : folders.length === 0 && !isLoadingMore ? (
            <div className="flex flex-col items-center justify-center h-full py-10">
              <p className="text-muted-foreground mb-3">
                {currentErrorMessage || (isCloudStorageView ? "No cloud storage channels found." : "No chats found in this folder.")}
              </p>
              <Button onClick={onRefresh} variant="outline" disabled={isLoading}>
                <RefreshCw className="mr-2 h-4 w-4" /> Try Refresh
              </Button>
            </div>
          ) : (
            <>
              <ul className="space-y-1">
                {folders.map((folder) => (
                  <ChatListItem
                    key={folder.id}
                    folder={folder}
                    isSelected={folder.id === selectedFolderId}
                    onSelect={() => {
                      onSelectFolder(folder.id);
                    }}
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
                    Load More {isCloudStorageView ? "Channels" : "Chats"}
                  </Button>
                </div>
              )}
              {!isLoadingMore && !hasMore && folders.length > 0 && (
                <p className="text-center text-xs text-muted-foreground py-4">
                  All {isCloudStorageView ? "cloud storage channels" : "chats in this folder"} loaded.
                </p>
              )}
            </>
          )}
          {isLoadingMore && folders.length > 0 && (
            <div className="flex justify-center items-center py-4">
              <Loader2 className="animate-spin h-5 w-5 text-primary" />
              <p className="ml-2 text-sm text-muted-foreground">Loading more {isCloudStorageView ? "channels" : "chats"}...</p>
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
