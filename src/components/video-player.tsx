
"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import { X, Loader2 } from "lucide-react";
import { Button } from "./ui/button";
import { useEffect, useRef } from "react";

interface VideoPlayerProps {
  isOpen: boolean;
  onClose: () => void;
  videoUrl: string | null;
  videoName?: string;
  isLoading?: boolean; 
}

export function VideoPlayer({ isOpen, onClose, videoUrl, videoName, isLoading }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!isOpen && videoRef.current) {
      videoRef.current.pause();
      videoRef.current.removeAttribute('src'); // Remove src to stop buffering/download
      videoRef.current.load(); // Reset the video element
    }
  }, [isOpen]);
  
  // Effect to handle video source changes and loading state
  useEffect(() => {
    if (videoRef.current) {
      if (isLoading || !videoUrl) {
        videoRef.current.removeAttribute('src');
        videoRef.current.load();
      } else if (videoUrl && videoRef.current.currentSrc !== videoUrl) {
        videoRef.current.src = videoUrl;
        videoRef.current.load(); // Important to load the new source
        // videoRef.current.play().catch(error => console.warn("Autoplay prevented:", error)); // Optional: attempt to play
      }
    }
  }, [videoUrl, isLoading, isOpen]);


  if (!isOpen) {
    return null;
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {if (!open) onClose()}}>
      <DialogContent 
        className="max-w-3xl w-[90vw] sm:w-full p-0 border-0 shadow-xl flex flex-col items-center justify-center bg-black aspect-video overflow-hidden"
        onInteractOutside={(e) => {
            // Prevent closing when clicking on custom controls if any, or allow if desired
            // For now, default behavior is fine. If user clicks outside, it closes.
        }}
      >
         <DialogHeader className="w-full flex flex-row justify-between items-center p-2 bg-black/80 text-primary-foreground rounded-t-lg absolute top-0 left-0 right-0 z-10">
          <DialogTitle className="text-sm truncate ml-2">{videoName || "Video Preview"}</DialogTitle>
          <DialogClose asChild>
            <Button variant="ghost" size="icon" className="text-primary-foreground hover:bg-white/20 hover:text-primary-foreground" onClick={onClose}>
              <X className="h-5 w-5" />
              <span className="sr-only">Close</span>
            </Button>
          </DialogClose>
        </DialogHeader>
        <div className="relative w-full h-full flex items-center justify-center bg-black pt-10"> {/* pt-10 for header space */}
          {(isLoading || !videoUrl) ? (
            <div className="flex flex-col items-center justify-center text-primary-foreground">
              <Loader2 className="h-12 w-12 animate-spin mb-2" />
              <p>Preparing video...</p>
            </div>
          ) : (
            <video
              ref={videoRef}
              // src={videoUrl} // src is now set via useEffect to handle changes better
              controls
              autoPlay
              playsInline // Important for iOS
              className="object-contain rounded-b-md w-full h-full"
              data-ai-hint="video playback"
              onEnded={onClose} 
              onError={(e) => {
                console.error("Video player error:", e);
                onClose(); // Close player on error
              }}
            >
              Your browser does not support the video tag.
            </video>
           )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

    