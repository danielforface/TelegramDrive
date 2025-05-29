
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

  // Effect to manage video source and player state based on props
  useEffect(() => {
    const videoElement = videoRef.current;
    if (!videoElement) return;

    if (!isOpen) {
      // If dialog is not open, pause and reset video
      videoElement.pause();
      if (videoElement.src) { // Only if src was set
        videoElement.removeAttribute('src'); // Important to stop potential background loading/buffering
        videoElement.load(); // Resets the media element to its initial state
      }
      return;
    }

    // If dialog is open
    if (isLoading || !videoUrl) {
      // If loading or no URL, ensure no source is set and show loading state (handled by JSX)
      if (videoElement.src) {
        videoElement.pause();
        videoElement.removeAttribute('src');
        videoElement.load();
      }
    } else if (videoUrl && videoElement.currentSrc !== videoUrl) {
      // If a valid videoUrl is provided and it's different from current, set it
      videoElement.src = videoUrl;
      videoElement.load(); // Important for the browser to pick up the new source
      videoElement.play().catch(error => {
        // Autoplay might be blocked by the browser, which is common.
        // User might need to click play manually if autoplay fails.
        console.warn("Video autoplay was prevented:", error.message);
      });
    }
  }, [isOpen, isLoading, videoUrl]);
  

  if (!isOpen) {
    return null;
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {if (!open) onClose()}}>
      <DialogContent 
        className="max-w-3xl w-[90vw] sm:w-full p-0 border-0 shadow-xl flex flex-col items-center justify-center bg-black aspect-video overflow-hidden"
        onInteractOutside={(e) => {
            // Default behavior: allow closing on outside click.
            // If custom controls were inside the dialog but outside the video,
            // e.preventDefault() might be needed here.
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
          {(isLoading || (!videoUrl && isOpen)) ? ( // Show loader if isLoading or if open but no URL yet
            <div className="flex flex-col items-center justify-center text-primary-foreground">
              <Loader2 className="h-12 w-12 animate-spin mb-2" />
              <p>Preparing video...</p>
            </div>
          ) : videoUrl ? ( // Only render video tag if videoUrl is present
            <video
              ref={videoRef}
              // src is managed by useEffect
              controls
              // autoPlay // Autoplay is attempted in useEffect
              playsInline // Important for iOS
              className="object-contain rounded-b-md w-full h-full"
              data-ai-hint="video playback"
              onError={(e) => {
                console.error("Video player error:", e);
                // Optionally call onClose() here if errors should close the player.
                // toast({ title: "Video Playback Error", description: "Could not play the video.", variant: "destructive" });
              }}
            >
              Your browser does not support the video tag.
            </video>
           ) : null /* No URL and not loading, render nothing for video area */ }
        </div>
      </DialogContent>
    </Dialog>
  );
}

    
