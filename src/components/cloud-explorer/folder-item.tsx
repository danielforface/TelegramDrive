"use client";

import type { CloudFolder, CloudFile } from "@/types";
import { useState, useMemo } from "react";
import { Folder as FolderIcon, ChevronRight, ChevronDown, FolderOpen } from "lucide-react";
import { FileItem } from "./file-item";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface FolderItemProps {
  folder: CloudFolder;
  defaultOpen?: boolean;
  style?: React.CSSProperties;
}

export function FolderItem({ folder, defaultOpen = false, style }: FolderItemProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  const ChevronIcon = isOpen ? ChevronDown : ChevronRight;

  // Apply animation delay for staggered effect for direct children of this folder
  const getAnimationStyle = (index: number) => ({
    animationDelay: `${index * 50}ms`,
  });
  
  return (
    <Card 
      className={cn("mb-2 overflow-hidden transition-all duration-300 ease-in-out animate-item-enter", isOpen ? "shadow-lg" : "shadow-sm")}
      style={style}
    >
      <CardHeader 
        className={cn(
          "flex flex-row items-center justify-between p-3 cursor-pointer hover:bg-accent/50 transition-colors",
          folder.isChatFolder ? "bg-accent/30 hover:bg-accent/60" : ""
        )}
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-controls={`folder-content-${folder.id}`}
      >
        <div className="flex items-center gap-2">
          <ChevronIcon className="w-5 h-5 text-muted-foreground transition-transform duration-200" />
          {isOpen ? <FolderOpen className="w-6 h-6 text-primary" /> : <FolderIcon className="w-6 h-6 text-primary" />}
          <span className="font-medium text-foreground">{folder.name}</span>
        </div>
        <span className="text-sm text-muted-foreground">
          {folder.folders.length > 0 && `${folder.folders.length} folder(s), `}
          {folder.files.length} file(s)
        </span>
      </CardHeader>
      {isOpen && (
        <CardContent 
          id={`folder-content-${folder.id}`}
          className="p-3 pl-6 border-t data-[state=open]:animate-accordion-down data-[state=closed]:animate-accordion-up"
        >
          {folder.folders.length === 0 && folder.files.length === 0 && (
            <p className="text-sm text-muted-foreground py-2">This folder is empty.</p>
          )}
          <div className="space-y-2">
            {folder.folders.map((subFolder, index) => (
              <FolderItem key={subFolder.id} folder={subFolder} style={getAnimationStyle(index)} />
            ))}
            {folder.files.map((file, index) => (
              <FileItem key={file.id} file={file} style={getAnimationStyle(folder.folders.length + index)} />
            ))}
          </div>
        </CardContent>
      )}
    </Card>
  );
}
