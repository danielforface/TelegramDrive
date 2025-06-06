
"use client";

import type { CloudFolder } from "@/types";
import { Folder as FolderIcon, FolderOpen, FolderPlus, Trash2 } from "lucide-react";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import React from "react";


interface ContentFolderItemProps {
  folder: CloudFolder;
  style?: React.CSSProperties;
  onClick?: () => void;
  itemCountOverride?: number;
  isCloudChannelContext?: boolean; // True if this folder is part of a VFS in a cloud channel
  onDelete?: () => void; // For deleting virtual folders
  onCreateFolderInside?: () => void; // For creating a folder inside this virtual folder
}

export function ContentFolderItem({
  folder,
  style,
  onClick,
  itemCountOverride,
  isCloudChannelContext = false,
  onDelete,
  onCreateFolderInside
}: ContentFolderItemProps) {
  const totalItems = itemCountOverride !== undefined
    ? itemCountOverride
    : (folder.files?.length || 0) + (folder.folders?.length || 0);

  const folderTypeHint = folder.name.toLowerCase().includes("image") ? "gallery folder" :
                         folder.name.toLowerCase().includes("video") ? "video library" :
                         folder.name.toLowerCase().includes("audio") ? "music collection" :
                         folder.name.toLowerCase().includes("document") ? "document archive" :
                         "general folder";

  const handleCardClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('[data-radix-dropdown-menu-trigger]') || (e.target as HTMLElement).closest('[role="menuitem"]')) {
      return;
    }
    onClick?.();
  };

  const handleDropdownSelect = (event: Event) => {
      event.preventDefault();
  };


  const cardContent = (
    <Card
      className={cn(
        "flex flex-col h-48 w-full overflow-hidden rounded-lg shadow-sm hover:shadow-md transition-shadow duration-200 animate-item-enter cursor-pointer",
      )}
      style={style}
      onClick={handleCardClick} // Changed: Use specific handler
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && !((e.target as HTMLElement).closest('[data-radix-dropdown-menu-trigger]')) && onClick?.()}
      tabIndex={0}
      aria-label={`Folder: ${folder.name}`}
      onContextMenu={(e) => { // Prevent default context menu if we're using DropdownMenuTrigger
          if (isCloudChannelContext) e.stopPropagation();
      }}
    >
      <CardContent className="flex-grow flex flex-col items-center justify-center p-4 text-center">
        <FolderIcon
          className="w-16 h-16 text-primary mb-2"
          strokeWidth={1.5}
          data-ai-hint={folderTypeHint}
        />
        <p className="text-sm font-medium mt-2 truncate w-full" title={folder.name}>
          {folder.name}
        </p>
      </CardContent>
      <CardFooter className="p-3 w-full border-t bg-muted/20 flex-shrink-0">
        <Badge variant="outline" className="text-xs w-full justify-center truncate">
          {totalItems === 0 && "Empty"}
          {totalItems > 0 && `${totalItems} item${totalItems !== 1 ? 's' : ''}`}
        </Badge>
      </CardFooter>
    </Card>
  );

  if (isCloudChannelContext) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>{cardContent}</DropdownMenuTrigger>
        <DropdownMenuContent className="w-56" align="start" onSelect={handleDropdownSelect}>
          <DropdownMenuItem onClick={(e) => {e.stopPropagation(); onClick?.();}}>
            <FolderOpen className="mr-2 h-4 w-4" />
            <span>Open Folder</span>
          </DropdownMenuItem>
          {onCreateFolderInside && (
            <DropdownMenuItem onClick={(e) => {e.stopPropagation(); onCreateFolderInside();}}>
              <FolderPlus className="mr-2 h-4 w-4" />
              <span>Create New Folder Inside</span>
            </DropdownMenuItem>
          )}
          {onDelete && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={(e) => {e.stopPropagation(); onDelete();}}
                className="text-destructive focus:text-destructive focus:bg-destructive/10"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                <span>Delete Virtual Folder</span>
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return cardContent;
}

    