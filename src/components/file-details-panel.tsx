
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
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Download, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

interface FileDetailsPanelProps {
  file: CloudFile | null;
  isOpen: boolean;
  onClose: () => void;
  onDownload: (file: CloudFile) => void;
}

function formatValue(value: any): string {
  if (value === null || value === undefined) return "N/A";
  if (typeof value === 'object') {
    if (value._ === 'long' && value.value) return value.value.toString();
    try {
      // Attempt to stringify, handling circular references
      return JSON.stringify(value, (key, value) => {
        if (key === 'photoSize' || key === 'videoSize' || key === 'thumbSize') return undefined; // Skip these verbose fields
        if (key === 'photo' && value && (value as any)._ === 'photoEmpty') return undefined;
        if (key === 'document' && value && (value as any)._ === 'documentEmpty') return undefined;
        return value;
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


        if (typeof value === 'object' && value !== null && !Array.isArray(value) && value._ !== 'long') {
          // Further check for nested objects that we want to render recursively vs just stringify
          const subKeys = Object.keys(value);
          const hasNonPrimitiveSubValues = subKeys.some(subKey => typeof (value as any)[subKey] === 'object' && (value as any)[subKey] !== null && (value as any)[subKey].value === undefined);

          if (hasNonPrimitiveSubValues && subKeys.length < 10 && indentLevel < 3) { // Limit recursion depth and complexity
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


export function FileDetailsPanel({ file, isOpen, onClose, onDownload }: FileDetailsPanelProps) {
  const { toast } = useToast();
  if (!file) return null;

  const handleDownloadClick = () => {
    onDownload(file);
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
            <Button onClick={handleDownloadClick} >
              <Download className="mr-2 h-4 w-4" /> Download
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
