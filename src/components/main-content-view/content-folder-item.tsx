
"use client";

import type { CloudFolder } from "@/types";
import { Folder as FolderIcon } from "lucide-react";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

interface ContentFolderItemProps {
  folder: CloudFolder;
  style?: React.CSSProperties;
  onClick?: () => void; 
}

export function ContentFolderItem({ folder, style, onClick }: ContentFolderItemProps) {
  const totalItems = folder.files.length + folder.folders.length;
  const folderTypeHint = folder.name.toLowerCase().includes("image") ? "gallery folder" : 
                         folder.name.toLowerCase().includes("video") ? "video library" :
                         folder.name.toLowerCase().includes("audio") ? "music collection" :
                         folder.name.toLowerCase().includes("document") ? "document archive" :
                         "general folder";

  return (
    <Card
      className={cn(
        "flex flex-col h-48 w-full overflow-hidden rounded-lg shadow-sm hover:shadow-md transition-shadow duration-200 animate-item-enter cursor-pointer",
      )}
      style={style}
      onClick={onClick}
      tabIndex={0}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onClick?.()}
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
          {totalItems > 0 && `${totalItems} item${totalItems > 1 ? 's' : ''}`}
        </Badge>
      </CardFooter>
    </Card>
  );
}
