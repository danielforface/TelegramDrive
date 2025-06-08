
"use client";

import { useState, useCallback, useRef } from 'react';
import type { CloudFile } from '@/types';
import * as telegramService from '@/services/telegramService';
import type { useToast } from "@/hooks/use-toast";

const ONE_MB = 1024 * 1024;
const DOWNLOAD_CHUNK_SIZE = 512 * 1024; // 512 KB
const KB_1 = 1024;

interface UseMediaPreviewManagerProps {
  toast: ReturnType<typeof useToast>['toast'];
}

export function useMediaPreviewManager({ toast }: UseMediaPreviewManagerProps) {
  const [isImageViewerOpen, setIsImageViewerOpen] = useState(false);
  const [viewingImageUrl, setViewingImageUrl] = useState<string | null>(null);
  const [viewingImageName, setViewingImageName] = useState<string | undefined>(undefined);

  const [isVideoPlayerOpen, setIsVideoPlayerOpen] = useState(false);
  const [playingVideoUrl, setPlayingVideoUrl] = useState<string | null>(null); // This will hold the blob URL
  const [playingVideoName, setPlayingVideoName] = useState<string | undefined>(undefined);
  const [isPreparingVideoStream, setIsPreparingVideoStream] = useState(false);
  const [videoStreamUrlInternal, setVideoStreamUrlInternal] = useState<string | null>(null); // Internal blob URL state
  const [preparingVideoStreamForFileId, setPreparingVideoStreamForFileId] = useState<string | null>(null);
  const videoStreamAbortControllerRef = useRef<AbortController | null>(null);


  const handleViewImage = useCallback((file: CloudFile) => {
    if (file.type === 'image' && file.url) {
      setViewingImageUrl(file.url);
      setViewingImageName(file.name);
      setIsImageViewerOpen(true);
    } else if (file.type === 'image' && !file.url) {
      toast({ title: "Preview Not Available", description: "Image URL not available for preview. Try downloading first.", variant: "default" });
    } else if (file.type !== 'image') {
      toast({ title: "Not an Image", description: "This file is not an image and cannot be viewed here.", variant: "default" });
    }
  }, [toast]);

  const handleCloseImageViewer = useCallback(() => setIsImageViewerOpen(false), []);

  const fetchVideoAndCreateStreamUrl = useCallback(async (file: CloudFile, signal: AbortSignal) => {
    toast({ title: "Preparing Video...", description: `Fetching ${file.name} for playback.` });
    try {
      const downloadInfo = await telegramService.prepareFileDownloadInfo(file);
      if (!downloadInfo || !downloadInfo.location || !downloadInfo.totalSize || downloadInfo.totalSize <= 0) {
        throw new Error("Could not get valid download information for video.");
      }

      let downloadedBytes = 0;
      let currentOffset = 0;
      const chunks: Uint8Array[] = [];
      const totalSize = downloadInfo.totalSize;

      while (downloadedBytes < totalSize) {
        if (signal.aborted) throw new Error("Video preparation aborted by user.");
        
        const bytesNeededForVideo = totalSize - downloadedBytes;
        const offsetWithinCurrentMBBlockVideo = currentOffset % ONE_MB;
        const bytesLeftInCurrentMBBlockVideo = ONE_MB - offsetWithinCurrentMBBlockVideo;
        let idealBytesToRequestVideo = Math.min(bytesLeftInCurrentMBBlockVideo, DOWNLOAD_CHUNK_SIZE, bytesNeededForVideo);
        let limitForApiCallVideo: number;

        if (bytesNeededForVideo <= 0) { limitForApiCallVideo = 0; }
        else if (idealBytesToRequestVideo <= 0) { limitForApiCallVideo = bytesNeededForVideo > 0 ? KB_1 : 0; }
        else if (idealBytesToRequestVideo < KB_1) { limitForApiCallVideo = KB_1; }
        else { limitForApiCallVideo = Math.floor(idealBytesToRequestVideo / KB_1) * KB_1; }
        
        if (limitForApiCallVideo === 0 && bytesNeededForVideo > 0 && idealBytesToRequestVideo > 0) { limitForApiCallVideo = KB_1; }
        if (limitForApiCallVideo <= 0) break;

        const chunkResponse = await telegramService.downloadFileChunk(downloadInfo.location, currentOffset, limitForApiCallVideo, signal);

        if (signal.aborted) throw new Error("Video preparation aborted during chunk download.");

        if (chunkResponse?.bytes && chunkResponse.bytes.length > 0) {
          chunks.push(chunkResponse.bytes);
          downloadedBytes += chunkResponse.bytes.length;
          currentOffset += chunkResponse.bytes.length;
        } else if (chunkResponse?.errorType) {
          throw new Error(`Failed to download video chunk: ${chunkResponse.errorType}`);
        } else if (chunkResponse?.isCdnRedirect) {
          throw new Error("CDN Redirect not fully handled during video stream preparation. Try regular download.");
        } else {
          break; // No more data or unexpected response
        }
      }

      if (signal.aborted) throw new Error("Video preparation aborted after download loop.");
      
      const mimeType = file.telegramMessage?.mime_type || file.telegramMessage?.document?.mime_type || 'video/mp4';
      const videoBlob = new Blob(chunks, { type: mimeType });
      const objectURL = URL.createObjectURL(videoBlob);

      setVideoStreamUrlInternal(objectURL); // Store the blob URL
      setPlayingVideoUrl(objectURL); // Set it for the player
      toast({ title: "Video Ready", description: `${file.name} is ready for playback.` });

    } catch (error: any) {
      if (error.message?.includes("aborted")) {
        toast({ title: "Video Preparation Cancelled", description: `Preparation for ${file.name} was cancelled.`, variant: "default" });
      } else {
        toast({ title: "Video Preparation Failed", description: `Could not prepare ${file.name}: ${error.message}`, variant: "destructive" });
      }
      setPlayingVideoUrl(null); // Clear on error
      setIsVideoPlayerOpen(false); // Close player on error
    }
  }, [toast]);


  const prepareAndPlayVideoStream = useCallback(async (file: CloudFile) => {
    if (isPreparingVideoStream && preparingVideoStreamForFileId === file.id) {
      toast({ title: "Already Preparing", description: `Still preparing ${file.name}. Please wait.`, variant: "default" });
      setIsVideoPlayerOpen(true); // Ensure player is open if already preparing
      return;
    }

    // Abort previous stream preparation if any
    if (videoStreamAbortControllerRef.current && !videoStreamAbortControllerRef.current.signal.aborted) {
      videoStreamAbortControllerRef.current.abort("New video stream preparation requested");
    }
    // Revoke old blob URL if it exists
    if (videoStreamUrlInternal) {
      URL.revokeObjectURL(videoStreamUrlInternal);
      setVideoStreamUrlInternal(null);
    }

    setPlayingVideoUrl(null); // Clear current playing URL
    setPlayingVideoName(file.name);
    setIsPreparingVideoStream(true);
    setPreparingVideoStreamForFileId(file.id);
    setIsVideoPlayerOpen(true);

    const newController = new AbortController();
    videoStreamAbortControllerRef.current = newController;

    try {
      await fetchVideoAndCreateStreamUrl(file, newController.signal);
    } catch (error) {
      // Error already handled in fetchVideoAndCreateStreamUrl
    } finally {
      // Only reset these if the current controller is the one that finished/aborted
      if (videoStreamAbortControllerRef.current === newController) {
        setIsPreparingVideoStream(false);
        setPreparingVideoStreamForFileId(null);
      }
    }
  }, [isPreparingVideoStream, preparingVideoStreamForFileId, videoStreamUrlInternal, fetchVideoAndCreateStreamUrl, toast]);


  const handlePlayVideo = useCallback((file: CloudFile) => {
    if (file.type === 'video') {
      if (file.url) { // If it's a direct URL (e.g., already a blob or external URL)
        setPlayingVideoUrl(file.url);
        setPlayingVideoName(file.name);
        setIsPreparingVideoStream(false);
        setPreparingVideoStreamForFileId(null);
        setIsVideoPlayerOpen(true);
      } else if (file.totalSizeInBytes && file.totalSizeInBytes > 0) {
        prepareAndPlayVideoStream(file); // Fetch and create blob URL
      } else {
        toast({ title: "Playback Not Possible", description: "Video data or size is missing, cannot play.", variant: "default" });
      }
    } else {
      toast({ title: "Not a Video", description: "This file is not a video and cannot be played here.", variant: "default" });
    }
  }, [prepareAndPlayVideoStream, toast]);

  const handleCloseVideoPlayerAndStream = useCallback(() => {
    setIsVideoPlayerOpen(false);
    if (isPreparingVideoStream && videoStreamAbortControllerRef.current && !videoStreamAbortControllerRef.current.signal.aborted) {
      videoStreamAbortControllerRef.current.abort("Video player closed during preparation");
    }
    setIsPreparingVideoStream(false);
    setPreparingVideoStreamForFileId(null);

    if (videoStreamUrlInternal) {
      URL.revokeObjectURL(videoStreamUrlInternal);
      setVideoStreamUrlInternal(null);
    }
    setPlayingVideoUrl(null); // Clear the URL used by the video player
  }, [isPreparingVideoStream, videoStreamUrlInternal]);
  
  const resetMediaPreview = useCallback(() => {
    setIsImageViewerOpen(false);
    setViewingImageUrl(null);
    setViewingImageName(undefined);
    setIsVideoPlayerOpen(false);
    setPlayingVideoUrl(null);
    setPlayingVideoName(undefined);
    setIsPreparingVideoStream(false);
    if (videoStreamUrlInternal) {
        URL.revokeObjectURL(videoStreamUrlInternal);
        setVideoStreamUrlInternal(null);
    }
    if (videoStreamAbortControllerRef.current && !videoStreamAbortControllerRef.current.signal.aborted) {
        videoStreamAbortControllerRef.current.abort("Media preview reset");
    }
    setPreparingVideoStreamForFileId(null);
  }, [videoStreamUrlInternal]);


  return {
    isImageViewerOpen,
    viewingImageUrl,
    viewingImageName,
    isVideoPlayerOpen,
    playingVideoUrl,
    playingVideoName,
    isPreparingVideoStream,
    preparingVideoStreamForFileId,
    videoStreamAbortControllerRef, // Expose for cleanup on full app reset
    videoStreamUrlInternal, // Expose for cleanup on full app reset
    handleViewImage,
    handleCloseImageViewer,
    handlePlayVideo,
    handleCloseVideoPlayerAndStream,
    resetMediaPreview,
  };
}
