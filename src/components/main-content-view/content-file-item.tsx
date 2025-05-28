
"use client";

import type { CloudFile } from "@/types";
import { FileText, Image as ImageIcon, Video, FileAudio, FileQuestion, Download, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";

interface ContentFileItemProps {
  file: CloudFile;
  style?: React.CSSProperties;
}

const FileTypeIcon = ({ type, name }: { type: CloudFile['type'], name: string }) => {
  const iconProps = { className: "w-6 h-6 text-primary flex-shrink-0" };
  switch (type) {
    case 'image':
      return <ImageIcon {...iconProps} />;
    case 'video':
      return <Video {...iconProps} />;
    case 'audio':
      return <FileAudio {...iconProps} />;
    case 'document':
      // Could add more specific document icons based on extension
      if (name.endsWith('.pdf')) return <FileText {...iconProps} color="red" />;
      if (name.endsWith('.doc') || name.endsWith('.docx')) return <FileText {...iconProps} color="blue"/>;
      if (name.endsWith('.xls') || name.endsWith('.xlsx')) return <FileText {...iconProps} color="green"/>;
      return <FileText {...iconProps} />;
    default:
      return <FileQuestion {...iconProps} />;
  }
};

export function ContentFileItem({ file, style }: ContentFileItemProps) {
  const handleDownload = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent card click if button is inside
    // TODO: Implement actual download logic if file.url exists
    console.log("Download requested for:", file.name, file.url);
    if (!file.url) {
      alert("No download URL available for this file.");
    } else {
      // For actual download, you might need to create an <a> tag dynamically or use window.open(file.url, '_blank')
      // This is a placeholder:
      window.open(file.url, '_blank');
    }
  };

  return (
    <Card
      className="flex items-center justify-between p-3 hover:shadow-lg transition-shadow duration-200 animate-item-enter rounded-md"
      style={style}
      // onClick={() => console.log("File selected:", file.name)} // Placeholder for select/preview
    >
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-3 overflow-hidden cursor-default">
              <FileTypeIcon type={file.type} name={file.name} />
              <div className="flex flex-col overflow-hidden">
                <span className="text-sm font-medium truncate" title={file.name}>{file.name}</span>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{file.type.charAt(0).toUpperCase() + file.type.slice(1)}</span>
                  {file.size && <><span>&bull;</span><span>{file.size}</span></>}
                </div>
                 {file.lastModified && <span className="text-xs text-muted-foreground">Modified: {file.lastModified}</span>}
              </div>
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom" align="start">
            <p className="font-semibold">{file.name}</p>
            <p>Type: {file.type}</p>
            {file.size && <p>Size: {file.size}</p>}
            {file.lastModified && <p>Modified: {file.lastModified}</p>}
            {file.url ? <Badge variant="secondary" className="mt-1">Downloadable</Badge> : <Badge variant="outline" className="mt-1">No URL</Badge>}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {file.url ? (
        <Button variant="ghost" size="icon" onClick={handleDownload} aria-label={`Download ${file.name}`}>
          <Download className="w-5 h-5 text-muted-foreground hover:text-primary" />
        </Button>
      ) : (
         <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="p-2"> {/* Wrapper for tooltip trigger on non-button */}
                <AlertCircle className="w-5 h-5 text-amber-500" />
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p>Download not available for this file.</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </Card>
  );
}

    