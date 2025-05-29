
"use client";

import type { DownloadQueueItemType } from "@/types";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
    FileText, ImageIcon, Video, FileAudio, FileQuestion, 
    AlertCircle, CheckCircle2, Loader2, Play, Pause, XCircle, RotateCcw 
} from "lucide-react";

interface DownloadQueueItemProps {
  item: DownloadQueueItemType;
  onCancel: () => void;
  onPause: () => void;
  onResume: () => void;
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
        case 'queued': return <Badge variant="outline"><Loader2 className="w-3 h-3 mr-1 animate-spin" />Queued</Badge>;
        case 'downloading': return <Badge variant="secondary"><Loader2 className="w-3 h-3 mr-1 animate-spin" />Downloading</Badge>;
        case 'paused': return <Badge variant="outline"><Pause className="w-3 h-3 mr-1" />Paused</Badge>;
        case 'completed': return <Badge variant="default" className="bg-green-600 hover:bg-green-700 text-primary-foreground"><CheckCircle2 className="w-3 h-3 mr-1" />Completed</Badge>;
        case 'failed': return <Badge variant="destructive"><AlertCircle className="w-3 h-3 mr-1" />Failed</Badge>;
        case 'cancelled': return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />Cancelled</Badge>;
        default: return <Badge variant="outline">{status}</Badge>;
    }
};

export function DownloadQueueItem({ item, onCancel, onPause, onResume }: DownloadQueueItemProps) {
  return (
    <Card className="w-full overflow-hidden shadow-sm hover:shadow-md transition-shadow duration-150">
      <CardContent className="p-3 flex flex-col space-y-2">
        <div className="flex items-center justify-between">
            <div className="flex items-center min-w-0 flex-1"> {/* Added flex-1 here */}
                <FileTypeIcon type={item.type} name={item.name} />
                <span className="text-sm font-medium truncate" title={item.name}>{item.name}</span>
            </div>
            <StatusIndicator status={item.status} />
        </div>
        
        {(item.status === 'downloading' || item.status === 'paused' || item.status === 'completed') && (
             <Progress value={item.progress} className="h-2 my-1" />
        )}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{item.size || 'N/A'}</span>
            {(item.status === 'downloading' || item.status === 'paused') && item.progress > 0 && item.progress < 100 && (
                <span>{item.progress}%</span>
            )}
        </div>

        {(item.status === 'downloading' || item.status === 'paused') && (
          <div className="flex gap-2 mt-2 justify-end">
            {item.status === 'downloading' && (
              <Button variant="outline" size="sm" onClick={onPause}>
                <Pause className="h-4 w-4 mr-1" /> Pause
              </Button>
            )}
            {item.status === 'paused' && (
              <Button variant="outline" size="sm" onClick={onResume}>
                <Play className="h-4 w-4 mr-1" /> Resume
              </Button>
            )}
            <Button variant="destructive" size="sm" onClick={onCancel}>
              <XCircle className="h-4 w-4 mr-1" /> Cancel
            </Button>
          </div>
        )}
        {/* Optional: Add a retry button for failed/cancelled items */}
        {(item.status === 'failed' || item.status === 'cancelled') && (
             <div className="flex gap-2 mt-2 justify-end">
                <Button variant="outline" size="sm" onClick={onResume}> {/* Resume can act as retry */}
                    <RotateCcw className="h-4 w-4 mr-1" /> Retry
                </Button>
            </div>
        )}

      </CardContent>
    </Card>
  );
}
