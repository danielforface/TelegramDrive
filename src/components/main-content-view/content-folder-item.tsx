
"use client";

import type { CloudFolder, MenuItemType, CloudChannelConfigEntry } from "@/types";
import { Folder as FolderIcon, FolderOpen, FolderPlus, Trash2, CopyCheck } from "lucide-react";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { ContextMenu } from "@/components/context-menu"; 
import React, { useState } from "react";


interface ContentFolderItemProps {
  folder: CloudFolder;
  style?: React.CSSProperties;
  onClick?: () => void;
  itemCountOverride?: number;
  isCloudChannelContext?: boolean;
  onDelete?: () => void;
  onCreateFolderInside?: () => void;
  onCopyFolderStructure?: (folderName: string, folderConfig: CloudChannelConfigEntry) => void;
  folderConfigEntry?: CloudChannelConfigEntry; // Pass the config entry for copying
}

export function ContentFolderItem({
  folder,
  style,
  onClick,
  itemCountOverride,
  isCloudChannelContext = false,
  onDelete,
  onCreateFolderInside,
  onCopyFolderStructure,
  folderConfigEntry,
}: ContentFolderItemProps) {
  
  const [contextMenu, setContextMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
    items: MenuItemType[];
  }>({ visible: false, x: 0, y: 0, items: [] });


  const totalItems = itemCountOverride !== undefined
    ? itemCountOverride
    : (folder.files?.length || 0) + (folder.folders?.length || 0);

  const folderTypeHint = folder.name.toLowerCase().includes("image") ? "gallery folder" :
                         folder.name.toLowerCase().includes("video") ? "video library" :
                         folder.name.toLowerCase().includes("audio") ? "music collection" :
                         folder.name.toLowerCase().includes("document") ? "document archive" :
                         "general folder";

  const handleCardClick = (e: React.MouseEvent) => {
    if (e.button !== 2 && onClick) { 
        onClick();
    }
  };
  
  const folderMenuItems: MenuItemType[] = [];
  if (isCloudChannelContext) {
    if (onClick) {
      folderMenuItems.push({
        label: "Open Folder",
        onClick: () => onClick(),
        icon: <FolderOpen className="w-3.5 h-3.5"/>,
      });
    }
    if (onCreateFolderInside) {
      folderMenuItems.push({
        label: "Create Folder Inside",
        onClick: () => onCreateFolderInside(),
        icon: <FolderPlus className="w-3.5 h-3.5"/>,
      });
    }
    if (onCopyFolderStructure && folderConfigEntry) {
      folderMenuItems.push({
        label: "Copy Folder Structure",
        onClick: () => onCopyFolderStructure(folder.name, folderConfigEntry),
        icon: <CopyCheck className="w-3.5 h-3.5"/>,
      });
    }
    if (onDelete) {
      folderMenuItems.push({ isSeparator: true });
      folderMenuItems.push({
        label: "Delete Virtual Folder",
        onClick: () => onDelete(),
        icon: <Trash2 className="w-3.5 h-3.5"/>,
        className: "text-destructive hover:bg-destructive/10 focus:bg-destructive/10",
      });
    }
  }

  const handleContextMenu = (event: React.MouseEvent) => {
      event.preventDefault();
      if (!isCloudChannelContext || folderMenuItems.length === 0) return;
      setContextMenu({
        visible: true,
        x: event.clientX,
        y: event.clientY,
        items: folderMenuItems,
      });
  };

  const closeContextMenu = () => {
    setContextMenu({ ...contextMenu, visible: false });
  };


  const cardContent = (
    <Card
      className={cn(
        "flex flex-col h-48 w-full overflow-hidden rounded-lg shadow-sm hover:shadow-md transition-shadow duration-200 animate-item-enter",
        isCloudChannelContext || onClick ? "cursor-pointer" : "cursor-default"
      )}
      style={style}
      onClick={handleCardClick}
      onContextMenu={isCloudChannelContext ? handleContextMenu : undefined} 
      onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
             if (onClick) {
                 onClick();
             }
        }
      }}
      tabIndex={0}
      aria-label={`Folder: ${folder.name}`}
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

  return (
    <div data-folder-item="true">
      {cardContent}
      {contextMenu.visible && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenu.items}
          onClose={closeContextMenu}
        />
      )}
    </div>
  );
}

