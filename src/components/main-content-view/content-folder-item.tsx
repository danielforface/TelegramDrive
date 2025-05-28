
"use client";

import type { CloudFolder } from "@/types";
import { useState, useEffect } from "react";
import { Folder as FolderIcon, ChevronRight, ChevronDown, FolderOpen } from "lucide-react";
import { ContentFileItem } from "./content-file-item"; // Files inside this folder
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

interface ContentFolderItemProps {
  folder: CloudFolder;
  defaultOpen?: boolean;
  style?: React.CSSProperties;
  // onSelect?: () => void; // If clicking the folder itself should navigate
}

export function ContentFolderItem({ folder, defaultOpen = false, style }: ContentFolderItemProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  useEffect(() => {
    setIsOpen(defaultOpen); // Sync with defaultOpen prop, e.g., when search term changes
  }, [defaultOpen]);

  const ChevronIcon = isOpen ? ChevronDown : ChevronRight;
  const FolderDisplayIcon = isOpen ? FolderOpen : FolderIcon;

  const getAnimationStyle = (index: number) => ({
    animationDelay: `${index * 50}ms`,
  });
  
  const totalItems = folder.files.length + folder.folders.length;

  return (
    <Card 
      className={cn(
        "overflow-hidden transition-all duration-300 ease-in-out animate-item-enter rounded-lg", 
        isOpen ? "shadow-md" : "shadow-sm"
      )}
      style={style}
    >
      <CardHeader 
        className={cn(
          "flex flex-row items-center justify-between p-3 cursor-pointer hover:bg-accent/50 transition-colors",
          // folder.isChatFolder ? "bg-accent/30 hover:bg-accent/60" : "" // Not relevant for sub-folders
        )}
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-controls={`folder-content-${folder.id}`}
      >
        <div className="flex items-center gap-2">
          <ChevronIcon className="w-5 h-5 text-muted-foreground transition-transform duration-200" />
          <FolderDisplayIcon className="w-6 h-6 text-primary" />
          <span className="font-medium text-foreground">{folder.name}</span>
        </div>
        <Badge variant="outline" className="text-sm">
          {folder.files.length > 0 && `${folder.files.length} file(s)`}
          {folder.folders.length > 0 && folder.files.length > 0 && ", "}
          {folder.folders.length > 0 && `${folder.folders.length} subfolder(s)`}
          {totalItems === 0 && "Empty"}
        </Badge>
      </CardHeader>
      {isOpen && (
        <CardContent 
          id={`folder-content-${folder.id}`}
          className="p-3 pl-6 border-t data-[state=open]:animate-accordion-down data-[state=closed]:animate-accordion-up bg-muted/20"
        >
          {totalItems === 0 ? (
            <p className="text-sm text-muted-foreground py-2">This folder is empty.</p>
          ) : (
            <div className="space-y-2">
              {folder.folders.map((subFolder, index) => (
                <ContentFolderItem 
                  key={subFolder.id} 
                  folder={subFolder} 
                  style={getAnimationStyle(index)}
                  // defaultOpen might be useful if searching within subfolders too
                />
              ))}
              {folder.files.map((file, index) => (
                <ContentFileItem 
                  key={file.id} 
                  file={file} 
                  style={getAnimationStyle(folder.folders.length + index)} 
                />
              ))}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

    