
"use client";

import React, { forwardRef, type MouseEvent } from "react";
import type { CloudFile } from "@/types";
import { FileText, Image as ImageIcon, Video, FileAudio, FileQuestion, Download, Info, Eye, PlayCircle, Loader2, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card"; // Removed CardContent, CardFooter
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface ContentFileItemProps {
  file: CloudFile;
  style?: React.CSSProperties;
  onDetailsClick: (file: CloudFile) => void;
  onQueueDownloadClick: (file: CloudFile) => void;
  onViewImageClick: (file: CloudFile) => void;
  onPlayVideoClick: (file: CloudFile) => void;
  isPreparingStream?: boolean;
  preparingStreamForFileId?: string | null;
  onDeleteFile: (file: CloudFile) => void; // New prop
}

const FileTypeIcon = ({ type, name, dataAiHint }: { type: CloudFile['type'], name: string, dataAiHint?: string }) => {
  const iconProps = { className: "w-12 h-12 text-primary flex-shrink-0", strokeWidth: 1.5 };
  switch (type) {
    case 'image':
      return <ImageIcon {...iconProps} data-ai-hint={dataAiHint || "image file"}/>;
    case 'video':
      return <Video {...iconProps} data-ai-hint={dataAiHint || "video file"}/>;
    case 'audio':
      return <FileAudio {...iconProps} data-ai-hint={dataAiHint || "audio file"}/>;
    case 'document':
      if (name.toLowerCase().endsWith('.pdf')) return <FileText {...iconProps} className="w-12 h-12 text-red-500 flex-shrink-0" strokeWidth={1.5} data-ai-hint={dataAiHint || "pdf document"}/>;
      if (name.toLowerCase().endsWith('.doc') || name.toLowerCase().endsWith('.docx')) return <FileText {...iconProps} className="w-12 h-12 text-blue-500 flex-shrink-0" strokeWidth={1.5} data-ai-hint={dataAiHint || "word document"}/>;
      if (name.toLowerCase().endsWith('.xls') || name.toLowerCase().endsWith('.xlsx')) return <FileText {...iconProps} className="w-12 h-12 text-green-500 flex-shrink-0" strokeWidth={1.5} data-ai-hint={dataAiHint || "excel spreadsheet"}/>;
      return <FileText {...iconProps} data-ai-hint={dataAiHint || "document file"}/>;
    default:
      return <FileQuestion {...iconProps} data-ai-hint={dataAiHint || "unknown file"}/>;
  }
};

export const ContentFileItem = forwardRef<HTMLDivElement, ContentFileItemProps>(
  ({ file, style, onDetailsClick, onQueueDownloadClick, onViewImageClick, onPlayVideoClick, isPreparingStream, preparingStreamForFileId, onDeleteFile }, ref) => {

    const handleCardClick = (e: MouseEvent) => {
      // Prevent card click if dropdown trigger or item was clicked
      if ((e.target as HTMLElement).closest('[data-radix-dropdown-menu-trigger]') || (e.target as HTMLElement).closest('[role="menuitem"]')) {
        return;
      }
      onDetailsClick(file);
    };

    const handleDropdownSelect = (event: Event) => {
        event.preventDefault(); // Prevent triggering card click
    };

    const isCurrentlyPreparingThisFile = isPreparingStream && preparingStreamForFileId === file.id;

    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Card
            ref={ref}
            className={cn(
              "flex flex-col h-40 w-full overflow-hidden rounded-lg shadow-sm hover:shadow-md transition-shadow duration-200 animate-item-enter cursor-pointer",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 bg-card"
            )}
            style={style}
            onClick={handleCardClick}
            onContextMenu={(e) => e.stopPropagation()} // Allow dropdown trigger to handle context menu
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                if (!(e.target as HTMLElement).closest('[data-radix-dropdown-menu-trigger]')) {
                  handleCardClick(e as any);
                }
              }
            }}
            tabIndex={0}
            aria-label={`File: ${file.name}, Type: ${file.type}`}
          >
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex flex-col items-center justify-center text-center p-3 flex-grow w-full overflow-hidden">
                    <FileTypeIcon type={file.type} name={file.name} dataAiHint={file.dataAiHint} />
                    <p className="text-xs font-medium mt-2 truncate w-full px-1" title={file.name}>{file.name}</p>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom" align="center">
                  <p className="font-semibold">{file.name}</p>
                  <p>Type: {file.type}</p>
                  {file.size && <p>Size: {file.size}</p>}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </Card>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-56" align="start" onSelect={handleDropdownSelect}>
          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onDetailsClick(file); }}>
            <Info className="mr-2 h-4 w-4" />
            <span>Details</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onQueueDownloadClick(file); }}>
            <Download className="mr-2 h-4 w-4" />
            <span>Download</span>
          </DropdownMenuItem>
          {file.type === 'image' && file.url && (
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onViewImageClick(file); }}>
              <Eye className="mr-2 h-4 w-4" />
              <span>View Image</span>
            </DropdownMenuItem>
          )}
          {file.type === 'video' && (
            <DropdownMenuItem
              onClick={(e) => { e.stopPropagation(); onPlayVideoClick(file); }}
              disabled={isCurrentlyPreparingThisFile}
            >
              {isCurrentlyPreparingThisFile ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <PlayCircle className="mr-2 h-4 w-4" />
              )}
              <span>{isCurrentlyPreparingThisFile ? "Preparing..." : "Play Video"}</span>
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={(e) => { e.stopPropagation(); onDeleteFile(file); }}
            className="text-destructive focus:text-destructive focus:bg-destructive/10"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            <span>Delete File</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }
);

ContentFileItem.displayName = "ContentFileItem";

    