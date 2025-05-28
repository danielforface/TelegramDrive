
"use client";

import type { CloudFile } from "@/types";
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
import { Download, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface FileDetailsPanelProps {
  file: CloudFile | null;
  isOpen: boolean;
  onClose: () => void;
}

function formatValue(value: any): string {
  if (value === null || value === undefined) return "N/A";
  if (typeof value === 'object') {
    // For BigInt-like objects from Telegram (e.g., { "_": "long", "value": "12345" })
    if (value._ === 'long' && value.value) return value.value.toString();
    return JSON.stringify(value, null, 2); // Basic pretty print for other objects
  }
  if (typeof value === 'boolean') return value ? "Yes" : "No";
  return value.toString();
}

function renderTelegramMessageDetails(details: any, indentLevel = 0) {
  if (!details || typeof details !== 'object') {
    return <p className="text-sm text-muted-foreground">No additional Telegram data.</p>;
  }

  return (
    <div className={`pl-${indentLevel * 2}`}>
      {Object.entries(details).map(([key, value]) => {
        // Skip overly verbose or internal-looking fields if needed
        if (key.startsWith('$$') || key === 'photoSize' || key === 'videoSize' || key === 'thumbSize') return null;
         if (key === 'photo' && value && (value as any)._ === 'photoEmpty') return null;
         if (key === 'document' && value && (value as any)._ === 'documentEmpty') return null;


        if (typeof value === 'object' && value !== null && !Array.isArray(value) && value._ !== 'long') {
          return (
            <div key={key} className="mt-2">
              <p className="text-xs font-semibold text-foreground capitalize">{key.replace(/_/g, ' ')}:</p>
              {renderTelegramMessageDetails(value, indentLevel + 1)}
            </div>
          );
        }
        return (
          <div key={key} className="grid grid-cols-3 gap-2 items-start py-1 border-b border-border/50 last:border-b-0">
            <p className="text-xs font-medium text-muted-foreground capitalize col-span-1">{key.replace(/_/g, ' ')}:</p>
            <p className="text-xs text-foreground col-span-2 break-words">{formatValue(value)}</p>
          </div>
        );
      })}
    </div>
  );
}


export function FileDetailsPanel({ file, isOpen, onClose }: FileDetailsPanelProps) {
  if (!file) return null;

  const handleDownload = () => {
    console.log("Download requested for (from panel):", file.name, file.url);
    if (!file.url) {
      // Here you might trigger a toast message
      alert("No download URL available for this file yet.");
    } else {
      window.open(file.url, '_blank');
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="sm:max-w-lg w-[90vw] p-0 flex flex-col" side="right">
        <SheetHeader className="p-6 border-b">
          <SheetTitle className="truncate" title={file.name}>File Details: {file.name}</SheetTitle>
          <SheetDescription>
            Type: {file.type} {file.size && `(${file.size})`}
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-grow overflow-y-auto p-6 space-y-4">
          <div>
            <h4 className="text-sm font-semibold mb-2 text-primary">Basic Information</h4>
            <div className="space-y-1 text-sm">
              <p><strong className="text-muted-foreground">Name:</strong> {file.name}</p>
              <p><strong className="text-muted-foreground">Type:</strong> <Badge variant="outline">{file.type}</Badge></p>
              {file.size && <p><strong className="text-muted-foreground">Size:</strong> {file.size}</p>}
              {file.lastModified && <p><strong className="text-muted-foreground">Date:</strong> {file.lastModified}</p>}
              {file.dataAiHint && <p><strong className="text-muted-foreground">AI Hint:</strong> {file.dataAiHint}</p>}
            </div>
          </div>

          {file.telegramMessage && (
            <div>
              <h4 className="text-sm font-semibold mt-4 mb-2 text-primary">Telegram Message Data</h4>
              <div className="bg-muted/30 p-3 rounded-md max-h-96 overflow-y-auto">
                 {renderTelegramMessageDetails(file.telegramMessage)}
              </div>
            </div>
          )}
        </ScrollArea>

        <SheetFooter className="p-6 border-t flex-shrink-0">
          <div className="flex justify-between w-full items-center">
            <Button variant="outline" onClick={onClose}>
              <X className="mr-2 h-4 w-4" /> Close
            </Button>
            <Button onClick={handleDownload} disabled={!file.url}>
              <Download className="mr-2 h-4 w-4" /> Download
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
