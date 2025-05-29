
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
  // SheetClose, // No longer explicitly needed here if relying on SheetContent's default
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DownloadCloud } from "lucide-react"; // X icon also comes from lucide-react for the default close
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
           {/* The explicit SheetClose that was here has been removed. 
               SheetContent will render its default close button. */}
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
             {/* Example: <Button variant="destructive">Clear Queue</Button> */}
           </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

