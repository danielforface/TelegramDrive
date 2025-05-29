
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
      <DialogContent className="max-w-3xl w-auto p-0 bg-transparent border-0 shadow-none flex flex-col items-center justify-center">
        <DialogHeader className="w-full flex flex-row justify-between items-center p-2 bg-background/80 backdrop-blur-sm rounded-t-lg">
          <DialogTitle className="text-sm text-foreground truncate">{imageName || "Image Preview"}</DialogTitle>
          <DialogClose asChild>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-5 w-5" />
              <span className="sr-only">Close</span>
            </Button>
          </DialogClose>
        </DialogHeader>
        <div className="relative w-full h-auto max-h-[80vh] flex items-center justify-center p-4">
          {/* Using next/image for optimization, assuming imageUrl is a valid external URL or relative path */}
          {/* For data URIs or blobs, a standard <img> tag might be simpler if next/image struggles */}
          <Image
            src={imageUrl}
            alt={imageName || "Preview"}
            width={1200} // Max width, will scale down
            height={800} // Max height, will scale down
            className="object-contain rounded-md shadow-lg"
            style={{ maxWidth: '100%', maxHeight: '80vh' }}
            data-ai-hint="lightbox image"
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
