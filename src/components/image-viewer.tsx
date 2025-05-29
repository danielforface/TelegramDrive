
"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import Image from "next/image";
import { X } from "lucide-react";
import { Button } from "./ui/button";

interface ImageViewerProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string | null;
  imageName?: string;
}

export function ImageViewer({ isOpen, onClose, imageUrl, imageName }: ImageViewerProps) {
  if (!isOpen || !imageUrl) {
    return null;
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl w-auto p-0 bg-transparent border-0 shadow-none flex flex-col items-center justify-center">
        <DialogHeader className="w-full flex flex-row justify-between items-center p-2 bg-background/80 backdrop-blur-sm rounded-t-lg sticky top-0 z-10">
          <DialogTitle className="text-sm text-foreground truncate">{imageName || "Image Preview"}</DialogTitle>
          <DialogClose asChild>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-5 w-5" />
              <span className="sr-only">Close</span>
            </Button>
          </DialogClose>
        </DialogHeader>
        <div className="relative w-full h-auto max-h-[85vh] flex items-center justify-center p-4 overflow-auto">
          <Image
            src={imageUrl}
            alt={imageName || "Preview"}
            width={1920} // Max width, will scale down
            height={1080} // Max height, will scale down
            className="object-contain rounded-md shadow-lg"
            style={{ maxWidth: '100%', maxHeight: 'calc(85vh - 40px)' }} // Adjusted for header
            data-ai-hint="lightbox image"
            unoptimized={imageUrl.startsWith('data:') || imageUrl.startsWith('blob:')} // Helpful for data/blob URLs
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
