
"use client";

import type { DownloadQueueItemType } from "@/types";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DownloadCloud } from "lucide-react"; 
import { DownloadQueueItem } from "./download-queue-item";

interface DownloadManagerDialogProps {
  isOpen: boolean;
  onClose: () => void;
  queue: DownloadQueueItemType[];
  onCancel: (itemId: string) => void;
  onPause: (itemId: string) => void;
  onResume: (itemId: string) => void;
}

export function DownloadManagerDialog({ 
  isOpen, 
  onClose, 
  queue,
  onCancel,
  onPause,
  onResume 
}: DownloadManagerDialogProps) {
  const activeDownloads = queue.filter(item => item.status === 'downloading' || item.status === 'queued' || item.status === 'paused').length;
  const completedDownloads = queue.filter(item => item.status === 'completed').length;
  
  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="sm:max-w-md w-[90vw] p-0 flex flex-col" side="right">
        <SheetHeader className="p-6 border-b">
          <div className="flex items-center gap-2">
            <DownloadCloud className="h-6 w-6 text-primary" />
            <SheetTitle>Download Manager</SheetTitle>
          </div>
          <SheetDescription>
            {queue.length === 0 
              ? "Your download queue is empty."
              : `${activeDownloads} active, ${completedDownloads} completed. Total: ${queue.length}.`}
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-grow overflow-y-auto p-4 space-y-3 bg-muted/20">
          {queue.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No files currently in the download queue.
            </p>
          )}
          {queue.slice().reverse().map((item) => ( // Show newest first
            <DownloadQueueItem 
              key={item.id} 
              item={item} 
              onCancel={() => onCancel(item.id)}
              onPause={() => onPause(item.id)}
              onResume={() => onResume(item.id)}
            />
          ))}
        </ScrollArea>

        <SheetFooter className="p-4 border-t flex-shrink-0">
           <div className="flex justify-end w-full">
             {/* Placeholder for future actions like "Clear All Completed" or "Clear All" */}
           </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
