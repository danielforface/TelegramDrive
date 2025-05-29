
"use client";

import type { DownloadQueueItemType } from "@/types";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetFooter,
  SheetClose,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { X, DownloadCloud } from "lucide-react";
import { DownloadQueueItem } from "./download-queue-item";

interface DownloadManagerDialogProps {
  isOpen: boolean;
  onClose: () => void;
  queue: DownloadQueueItemType[];
  // onClearQueue?: () => void; // Future: clear all
  // onRetryDownload?: (itemId: string) => void; // Future: retry specific
}

export function DownloadManagerDialog({ isOpen, onClose, queue }: DownloadManagerDialogProps) {
  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="sm:max-w-md w-[90vw] p-0 flex flex-col" side="right">
        <SheetHeader className="p-6 border-b">
          <div className="flex items-center gap-2">
            <DownloadCloud className="h-6 w-6 text-primary" />
            <SheetTitle>Download Manager</SheetTitle>
          </div>
          <SheetDescription>
            {queue.length > 0 ? `${queue.length} item(s) in queue.` : "Your download queue is empty."}
          </SheetDescription>
           <SheetClose className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-secondary">
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </SheetClose>
        </SheetHeader>

        <ScrollArea className="flex-grow overflow-y-auto p-4 space-y-3">
          {queue.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No files currently in the download queue.
            </p>
          )}
          {queue.map((item) => (
            <DownloadQueueItem key={item.id} item={item} />
          ))}
        </ScrollArea>

        <SheetFooter className="p-6 border-t flex-shrink-0">
          <div className="flex justify-end w-full">
            <Button variant="outline" onClick={onClose}>
              <X className="mr-2 h-4 w-4" /> Close
            </Button>
            {/* Add clear queue button later if needed */}
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
