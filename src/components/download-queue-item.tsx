
"use client";

import type { DownloadQueueItemType } from "@/types";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { FileText, ImageIcon, Video, FileAudio, FileQuestion, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";

interface DownloadQueueItemProps {
  item: DownloadQueueItemType;
}

const FileTypeIcon = ({ type, name }: { type: DownloadQueueItemType['type'], name: string }) => {
  const iconProps = { className: "w-6 h-6 text-muted-foreground flex-shrink-0 mr-3" };
  switch (type) {
    case 'image': return <ImageIcon {...iconProps} />;
    case 'video': return <Video {...iconProps} />;
    case 'audio': return <FileAudio {...iconProps} />;
    case 'document':
      if (name.endsWith('.pdf')) return <FileText {...iconProps} color="red" />;
      if (name.endsWith('.doc') || name.endsWith('.docx')) return <FileText {...iconProps} color="blue" />;
      if (name.endsWith('.xls') || name.endsWith('.xlsx')) return <FileText {...iconProps} color="green" />;
      return <FileText {...iconProps} />;
    default: return <FileQuestion {...iconProps} />;
  }
};

const StatusIndicator = ({ status }: { status: DownloadQueueItemType['status']}) => {
    switch(status) {
        case 'queued': return <Badge variant="outline">Queued</Badge>;
        case 'downloading': return <Badge variant="secondary"><Loader2 className="w-3 h-3 mr-1 animate-spin" />Downloading</Badge>;
        case 'completed': return <Badge variant="default" className="bg-green-600 hover:bg-green-700"><CheckCircle2 className="w-3 h-3 mr-1" />Completed</Badge>;
        case 'failed': return <Badge variant="destructive"><AlertCircle className="w-3 h-3 mr-1" />Failed</Badge>;
        default: return <Badge variant="outline">{status}</Badge>;
    }
};

export function DownloadQueueItem({ item }: DownloadQueueItemProps) {
  return (
    <Card className="w-full overflow-hidden shadow-sm">
      <CardContent className="p-3 flex flex-col space-y-2">
        <div className="flex items-center justify-between">
            <div className="flex items-center min-w-0">
                <FileTypeIcon type={item.type} name={item.name} />
                <span className="text-sm font-medium truncate" title={item.name}>{item.name}</span>
            </div>
            <StatusIndicator status={item.status} />
        </div>
        {/* Progress bar will be static for now */}
        {(item.status === 'downloading' || item.status === 'completed') && (
             <Progress value={item.status === 'completed' ? 100 : item.progress} className="h-2" />
        )}
        {item.size && <p className="text-xs text-muted-foreground self-end">{item.size}</p>}
      </CardContent>
    </Card>
  );
}
