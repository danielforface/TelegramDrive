
"use client";

import React, { forwardRef, type MouseEvent } from "react";
import type { CloudFile } from "@/types";
import { FileText, Image as ImageIcon, Video, FileAudio, FileQuestion, Download, Info, Eye, PlayCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button"; // Added for DropdownMenuTrigger asChild

interface ContentFileItemProps {
  file: CloudFile;
  style?: React.CSSProperties;
  onDetailsClick: (file: CloudFile) => void;
  onDownloadClick: (file: CloudFile) => void;
  onViewImageClick?: (file: CloudFile) => void;
  onPlayVideoClick?: (file: CloudFile) => void;
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
      if (name.endsWith('.pdf')) return <FileText {...iconProps} color="red" data-ai-hint={dataAiHint || "pdf document"}/>;
      if (name.endsWith('.doc') || name.endsWith('.docx')) return <FileText {...iconProps} color="blue" data-ai-hint={dataAiHint || "word document"}/>;
      if (name.endsWith('.xls') || name.endsWith('.xlsx')) return <FileText {...iconProps} color="green" data-ai-hint={dataAiHint || "excel spreadsheet"}/>;
      return <FileText {...iconProps} data-ai-hint={dataAiHint || "document file"}/>;
    default:
      return <FileQuestion {...iconProps} data-ai-hint={dataAiHint || "unknown file"}/>;
  }
};

export const ContentFileItem = forwardRef<HTMLDivElement, ContentFileItemProps>(
  ({ file, style, onDetailsClick, onDownloadClick, onViewImageClick, onPlayVideoClick }, ref) => {
    
    const handleCardClick = () => {
      // Default action on left click can be details, or view if image/video
      if (file.type === 'image' && onViewImageClick && file.url) {
        onViewImageClick(file);
      } else if (file.type === 'video' && onPlayVideoClick && file.url) {
        onPlayVideoClick(file);
      } else {
        onDetailsClick(file);
      }
    };

    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Card
            ref={ref}
            className={cn(
              "flex flex-col h-40 w-full overflow-hidden rounded-lg shadow-sm hover:shadow-md transition-shadow duration-200 animate-item-enter cursor-pointer",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            )}
            style={style}
            onClick={handleCardClick}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && handleCardClick()}
            tabIndex={0}
            aria-label={`File: ${file.name}, Type: ${file.type}`}
            // onContextMenu is handled by DropdownMenuTrigger
          >
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <CardContent className="flex flex-col items-center justify-center text-center p-3 flex-grow w-full overflow-hidden">
                    <FileTypeIcon type={file.type} name={file.name} dataAiHint={file.dataAiHint} />
                    <p className="text-xs font-medium mt-2 truncate w-full" title={file.name}>{file.name}</p>
                  </CardContent>
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
        <DropdownMenuContent className="w-56" align="start">
          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onDetailsClick(file); }}>
            <Info className="mr-2 h-4 w-4" />
            <span>Details</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onDownloadClick(file); }}>
            <Download className="mr-2 h-4 w-4" />
            <span>Download</span>
          </DropdownMenuItem>
          {file.type === 'image' && onViewImageClick && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onViewImageClick(file); }}>
                <Eye className="mr-2 h-4 w-4" />
                <span>View Image</span>
              </DropdownMenuItem>
            </>
          )}
          {file.type === 'video' && onPlayVideoClick && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onPlayVideoClick(file); }}>
                <PlayCircle className="mr-2 h-4 w-4" />
                <span>Play Video</span>
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }
);

ContentFileItem.displayName = "ContentFileItem";
