
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
import { useToast } from "@/hooks/use-toast";

interface FileDetailsPanelProps {
  file: CloudFile | null;
  isOpen: boolean;
  onClose: () => void;
  onQueueDownload: (file: CloudFile) => void;
}

function formatValue(value: any): string {
  if (value === null || value === undefined) return "N/A";
  if (typeof value === 'object') {
    // Handle BigInt-like structures from MTProto
    if (value._ === 'long' && typeof value.value === 'string') return value.value;
    if (typeof value.toString === 'function' && value.toString() !== '[object Object]') {
       if(value instanceof Date) return value.toLocaleString();
    }
    try {
      return JSON.stringify(value, (key, val) => {
        if (key === 'photoSize' || key === 'videoSize' || key === 'thumbSize') return undefined; 
        if (key === 'photo' && val && (val as any)._ === 'photoEmpty') return undefined;
        if (key === 'document' && val && (val as any)._ === 'documentEmpty') return undefined;
        if (typeof val === 'bigint') return val.toString(); 
        if (val instanceof Uint8Array) return `Uint8Array(len:${val.length})`; // Basic representation for byte arrays
        return val;
      }, 2);
    } catch (e) {
      return "[Circular Structure or Error]"
    }
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
        if (key.startsWith('$$') || key === 'photoSize' || key === 'videoSize' || key === 'thumbSize') return null;
        if (key === 'photo' && value && (value as any)._ === 'photoEmpty') return null;
        if (key === 'document' && value && (value as any)._ === 'documentEmpty') return null;

        if (typeof value === 'object' && value !== null && !Array.isArray(value) && !(value._ === 'long' && typeof value.value === 'string') && !(value instanceof Uint8Array)) {
          const subKeys = Object.keys(value);
          const hasNonPrimitiveSubValues = subKeys.some(subKey => typeof (value as any)[subKey] === 'object' && (value as any)[subKey] !== null && !((value as any)[subKey] instanceof Uint8Array));

          if (hasNonPrimitiveSubValues && subKeys.length < 10 && indentLevel < 3) { 
            return (
              <div key={key} className="mt-2">
                <p className="text-xs font-semibold text-foreground capitalize">{key.replace(/_/g, ' ')}:</p>
                {renderTelegramMessageDetails(value, indentLevel + 1)}
              </div>
            );
          }
        }
        return (
          <div key={key} className="grid grid-cols-3 gap-2 items-start py-1 border-b border-border/50 last:border-b-0">
            <p className="text-xs font-medium text-muted-foreground capitalize col-span-1">{key.replace(/_/g, ' ')}:</p>
            <p className="text-xs text-foreground col-span-2 break-words whitespace-pre-wrap">{formatValue(value)}</p>
          </div>
        );
      })}
    </div>
  );
}


export function FileDetailsPanel({ file, isOpen, onClose, onQueueDownload }: FileDetailsPanelProps) {
  const { toast } = useToast();
  if (!file) return null;

  const handleDownloadClick = () => {
    if (file) {
      onQueueDownload(file);
    } else {
      toast({ title: "Error", description: "No file selected for download.", variant: "destructive"});
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
           <SheetClose className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-secondary">
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </SheetClose>
        </SheetHeader>

        <ScrollArea className="flex-grow overflow-y-auto p-6 space-y-4">
          <div>
            <h4 className="text-sm font-semibold mb-2 text-primary">Basic Information</h4>
            <div className="space-y-1 text-sm">
              <p><strong className="text-muted-foreground">Name:</strong> {file.name}</p>
              <div><strong className="text-muted-foreground">Type:</strong> <Badge variant="outline">{file.type}</Badge></div>
              {file.size && <p><strong className="text-muted-foreground">Size:</strong> {file.size}</p>}
              {file.lastModified && <p><strong className="text-muted-foreground">Date:</strong> {file.lastModified}</p>}
              {file.dataAiHint && <p><strong className="text-muted-foreground">AI Hint:</strong> {file.dataAiHint}</p>}
              {file.url && <p><strong className="text-muted-foreground">URL:</strong> <span className="break-all">{file.url}</span></p>}
            </div>
          </div>

          {file.telegramMessage && (
            <div>
              <h4 className="text-sm font-semibold mt-4 mb-2 text-primary">Telegram Message Data</h4>
              <div className="bg-muted/30 p-3 rounded-md max-h-96 overflow-y-auto text-xs">
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
            <Button onClick={handleDownloadClick} disabled={!file}>
              <Download className="mr-2 h-4 w-4" /> Download
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

