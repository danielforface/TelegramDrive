
"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import { X } from "lucide-react";
import { Button } from "./ui/button";
import { useEffect, useRef } from "react";

interface VideoPlayerProps {
  isOpen: boolean;
  onClose: () => void;
  videoUrl: string | null;
  videoName?: string;
}

export function VideoPlayer({ isOpen, onClose, videoUrl, videoName }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!isOpen && videoRef.current) {
      videoRef.current.pause();
    }
  }, [isOpen]);
  
  if (!isOpen || !videoUrl) {
    return null;
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl w-full p-0 border-0 shadow-xl flex flex-col items-center justify-center bg-black aspect-video">
         <DialogHeader className="w-full flex flex-row justify-between items-center p-2 bg-black/80 text-primary-foreground rounded-t-lg absolute top-0 left-0 right-0 z-10">
          <DialogTitle className="text-sm truncate">{videoName || "Video Preview"}</DialogTitle>
          <DialogClose asChild>
            <Button variant="ghost" size="icon" className="text-primary-foreground hover:bg-white/20 hover:text-primary-foreground" onClick={onClose}>
              <X className="h-5 w-5" />
              <span className="sr-only">Close</span>
            </Button>
          </DialogClose>
        </DialogHeader>
        <div className="relative w-full h-full flex items-center justify-center bg-black pt-10"> {/* pt-10 for header */}
          <video
            ref={videoRef}
            src={videoUrl}
            controls
            autoPlay
            className="object-contain rounded-b-md w-full h-full"
            data-ai-hint="video playback"
            onEnded={onClose} 
          >
            Your browser does not support the video tag.
          </video>
        </div>
      </DialogContent>
    </Dialog>
  );
}

    