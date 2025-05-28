"use client";

import type { CloudFile } from "@/types";
import { FileText, Image as ImageIcon, Video, FileAudio, FileQuestion, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface FileItemProps {
  file: CloudFile;
  style?: React.CSSProperties;
}

const FileIcon = ({ type }: { type: CloudFile['type'] }) => {
  const iconProps = { className: "w-6 h-6 text-primary" };
  switch (type) {
    case 'image':
      return <ImageIcon {...iconProps} />;
    case 'video':
      return <Video {...iconProps} />;
    case 'audio':
      return <FileAudio {...iconProps} />;
    case 'document':
      return <FileText {...iconProps} />;
    default:
      return <FileQuestion {...iconProps} />;
  }
};

export function FileItem({ file, style }: FileItemProps) {
  return (
    <Card 
      className="flex items-center justify-between p-3 hover:shadow-md transition-shadow duration-200 animate-item-enter"
      style={style}
    >
      <div className="flex items-center gap-3 overflow-hidden">
        <FileIcon type={file.type} />
        <div className="flex flex-col overflow-hidden">
          <span className="text-sm font-medium truncate" title={file.name}>{file.name}</span>
          {file.size && <span className="text-xs text-muted-foreground">{file.size}</span>}
          {file.lastModified && <span className="text-xs text-muted-foreground">Modified: {file.lastModified}</span>}
        </div>
      </div>
      {file.url && (
        <Button variant="ghost" size="icon" asChild>
          <a href={file.url} target="_blank" rel="noopener noreferrer" aria-label={`Download ${file.name}`}>
            <Download className="w-4 h-4 text-muted-foreground hover:text-primary" />
          </a>
        </Button>
      )}
    </Card>
  );
}
