
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
  // ref is implicitly part of ForwardRefExoticComponent
}

const FileTypeIcon = ({ type, name, dataAiHint }: { type: CloudFile['type'], name: string, dataAiHint?: string }) => {
  const iconProps = { className: "w-12 h-12 text-primary flex-shrink-0 mb-2", strokeWidth: 1.5 };
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
      ref={ref} // Apply the ref here
      className={cn(
        "flex flex-col items-center justify-between p-3 hover:shadow-lg transition-shadow duration-200 animate-item-enter rounded-md h-48 w-full",
        "overflow-hidden"
      )}
      style={style}
      aria-label={`File: ${file.name}, Type: ${file.type}${file.size ? `, Size: ${file.size}` : ''}`}
    >
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <CardContent className="flex flex-col items-center text-center pt-3 flex-grow w-full overflow-hidden">
              <FileTypeIcon type={file.type} name={file.name} dataAiHint={file.dataAiHint} />
              <p className="text-xs font-medium truncate w-full" title={file.name}>{file.name}</p>
              <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                <span>{file.type.charAt(0).toUpperCase() + file.type.slice(1)}</span>
                {file.size && <><span>&bull;</span><span>{file.size}</span></>}
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

      <CardFooter className="p-2 w-full mt-auto border-t">
        {file.url ? (
          <Button variant="ghost" size="sm" onClick={handleDownload} className="w-full text-xs">
            <Download className="w-4 h-4 mr-1" />
            Download
          </Button>
        ) : (
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center justify-center text-muted-foreground p-1 text-xs w-full">
                  <AlertCircle className="w-4 h-4 mr-1 text-amber-500" />
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
