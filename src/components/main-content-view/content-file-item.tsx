
"use client";

import React, { forwardRef, type MouseEvent, useState } from "react";
import type { CloudFile, MenuItemType } from "@/types";
import { FileText, Image as ImageIcon, Video, FileAudio, FileQuestion, Download, Info, Eye, PlayCircle, Loader2, Trash2, Copy } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { ContextMenu } from "@/components/context-menu"; 

interface ContentFileItemProps {
  file: CloudFile;
  style?: React.CSSProperties;
  onDetailsClick: (file: CloudFile) => void;
  onQueueDownloadClick: (file: CloudFile) => void;
  onViewImageClick: (file: CloudFile) => void;
  onPlayVideoClick: (file: CloudFile) => void;
  isPreparingStream?: boolean;
  preparingStreamForFileId?: string | null;
  onDeleteFile: (file: CloudFile) => void;
  onCopyFile: (file: CloudFile) => void; 
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
  ({ file, style, onDetailsClick, onQueueDownloadClick, onViewImageClick, onPlayVideoClick, isPreparingStream, preparingStreamForFileId, onDeleteFile, onCopyFile }, ref) => {
    
    const [contextMenu, setContextMenu] = useState<{
      visible: boolean;
      x: number;
      y: number;
      items: MenuItemType[];
    }>({ visible: false, x: 0, y: 0, items: [] });

    const handleCardClick = (e: MouseEvent) => {
      if (e.button !== 2) {
        onDetailsClick(file);
      }
    };

    const isCurrentlyPreparingThisFile = isPreparingStream && preparingStreamForFileId === file.id;

    const fileMenuItems: MenuItemType[] = [
      {
        label: "Details",
        onClick: () => onDetailsClick(file),
        icon: <Info className="w-3.5 h-3.5"/>,
      },
      {
        label: "Download",
        onClick: () => onQueueDownloadClick(file),
        icon: <Download className="w-3.5 h-3.5"/>,
      },
      {
        label: "Copy File",
        onClick: () => onCopyFile(file),
        icon: <Copy className="w-3.5 h-3.5"/>,
      },
    ];

    if (file.type === 'image' && file.url) {
      fileMenuItems.push({
        label: "View Image",
        onClick: () => onViewImageClick(file),
        icon: <Eye className="w-3.5 h-3.5"/>,
      });
    }
    if (file.type === 'video') {
      fileMenuItems.push({
        label: isCurrentlyPreparingThisFile ? "Preparing..." : "Play Video",
        onClick: () => onPlayVideoClick(file),
        icon: isCurrentlyPreparingThisFile ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PlayCircle className="w-3.5 h-3.5"/>,
        disabled: isCurrentlyPreparingThisFile,
      });
    }
    fileMenuItems.push({ isSeparator: true });
    fileMenuItems.push({
      label: "Delete File",
      onClick: () => onDeleteFile(file),
      icon: <Trash2 className="w-3.5 h-3.5"/>,
      className: "text-destructive hover:bg-destructive/10 focus:bg-destructive/10",
    });


    const handleContextMenu = (event: React.MouseEvent) => {
      event.preventDefault();
      setContextMenu({
        visible: true,
        x: event.clientX,
        y: event.clientY,
        items: fileMenuItems,
      });
    };

    const closeContextMenu = () => {
      setContextMenu({ ...contextMenu, visible: false });
    };

    return (
      <div data-file-item="true">
        <Card
          ref={ref}
          className={cn(
            "flex flex-col h-40 w-full overflow-hidden rounded-lg shadow-sm hover:shadow-md transition-shadow duration-200 animate-item-enter cursor-pointer",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 bg-card"
          )}
          style={style}
          onClick={handleCardClick}
          onContextMenu={handleContextMenu}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              onDetailsClick(file);
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
);

ContentFileItem.displayName = "ContentFileItem";

