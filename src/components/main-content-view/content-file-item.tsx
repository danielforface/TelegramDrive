
"use client";

import React, { forwardRef, type MouseEvent } from "react";
import type { CloudFile } from "@/types";
import { FileText, Image as ImageIcon, Video, FileAudio, FileQuestion, Download, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface ContentFileItemProps {
  file: CloudFile;
  style?: React.CSSProperties;
}

const FileTypeIcon = ({ type, name, dataAiHint }: { type: CloudFile['type'], name: string, dataAiHint?: string }) => {
  const iconProps = { className: "w-12 h-12 text-primary flex-shrink-0", strokeWidth: 1.5 }; // Removed mb-2, margin will be handled by parent
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

export const ContentFileItem = forwardRef<HTMLDivElement, ContentFileItemProps>(({ file, style }, ref) => {
  const handleDownload = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    console.log("Download requested for:", file.name, file.url);
    if (!file.url) {
      alert("No download URL available for this file.");
    } else {
      window.open(file.url, '_blank');
    }
  };

  return (
    <Card
      ref={ref}
      className={cn(
        "flex flex-col h-48 w-full overflow-hidden rounded-lg shadow-sm hover:shadow-md transition-shadow duration-200 animate-item-enter"
      )}
      style={style}
      aria-label={`File: ${file.name}, Type: ${file.type}${file.size ? `, Size: ${file.size}` : ''}`}
    >
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <CardContent className="flex flex-col items-center text-center p-4 flex-grow w-full overflow-hidden">
              <FileTypeIcon type={file.type} name={file.name} dataAiHint={file.dataAiHint} />
              <p className="text-sm font-medium mt-2 mb-1 truncate w-full" title={file.name}>{file.name}</p>
              <div className="flex flex-wrap justify-center items-center gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground w-full">
                <span>{file.type.charAt(0).toUpperCase() + file.type.slice(1)}</span>
                {file.size && (
                  <>
                    <span className="text-muted-foreground/60 mx-0.5">&bull;</span>
                    <span>{file.size}</span>
                  </>
                )}
              </div>
            </CardContent>
          </TooltipTrigger>
          <TooltipContent side="bottom" align="center">
            <p className="font-semibold">{file.name}</p>
            <p>Type: {file.type}</p>
            {file.size && <p>Size: {file.size}</p>}
            {file.lastModified && <p>Modified: {file.lastModified}</p>}
            {file.url ? <Badge variant="secondary" className="mt-1">Downloadable</Badge> : <Badge variant="outline" className="mt-1">No URL</Badge>}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <CardFooter className="p-3 w-full border-t flex-shrink-0 bg-card">
        {file.url ? (
          <Button variant="ghost" size="sm" onClick={handleDownload} className="w-full text-xs font-medium">
            <Download className="w-3.5 h-3.5 mr-1.5" />
            Download
          </Button>
        ) : (
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center justify-center text-muted-foreground p-1 text-xs w-full font-medium">
                  <AlertCircle className="w-3.5 h-3.5 mr-1.5 text-amber-500" />
                  No URL
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>Download not available for this file.</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </CardFooter>
    </Card>
  );
});

ContentFileItem.displayName = "ContentFileItem";
