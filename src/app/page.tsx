
"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Header } from "@/components/layout/header";
import { FolderTabsBar } from "@/components/folder-tabs-bar"; // New import
import { TelegramConnect } from "@/components/telegram-connect";
import { MainContentView } from "@/components/main-content-view/main-content-view";
import { FileDetailsPanel } from "@/components/file-details-panel";
import { ImageViewer } from "@/components/image-viewer";
import { VideoPlayer } from "@/components/video-player";
import { DownloadManagerDialog } from "@/components/download-manager-dialog";
import { ChatSelectionDialog } from "@/components/chat-selection-dialog";
import { UploadDialog } from "@/components/upload-dialog";
import type { CloudFolder, CloudFile, DownloadQueueItemType, ExtendedFile, DialogFilter } from "@/types"; // Added DialogFilter
import { Button } from "@/components/ui/button";
import { Loader2, LayoutPanelLeft, MessageSquare } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import * as telegramService from "@/services/telegramService";
import { formatFileSize } from "@/lib/utils";


const INITIAL_CHATS_LOAD_LIMIT = 20;
const SUBSEQUENT_CHATS_LOAD_LIMIT = 10;
const INITIAL_MEDIA_LOAD_LIMIT = 20;
const SUBSEQUENT_MEDIA_LOAD_LIMIT = 20;
const DOWNLOAD_CHUNK_SIZE = 512 * 1024; // 512KB per chunk
const KB_1 = 1024;
const ONE_MB = 1024 * 1024;
const ALL_CHATS_FILTER_ID = 0; // Special ID for "All Chats" tab


type AuthStep = 'initial' | 'awaiting_code' | 'awaiting_password';

export default function Home() {
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);

  // Dialog Filters (Folders) State
  const [dialogFilters, setDialogFilters] = useState<DialogFilter[]>([]);
  const [activeDialogFilterId, setActiveDialogFilterId] = useState<number>(ALL_CHATS_FILTER_ID);
  const [isLoadingDialogFilters, setIsLoadingDialogFilters] = useState(true);


  const [isProcessingChats, setIsProcessingChats] = useState(false);
  const isProcessingChatsRef = useRef(false);

  const [allChats, setAllChats] = useState<CloudFolder[]>([]);
  const [isLoadingMoreChats, setIsLoadingMoreChats] = useState(false);
  const isLoadingMoreChatsRequestInFlightRef = useRef(false);
  const [hasMoreChats, setHasMoreChats] = useState(true);
  const [chatsOffsetDate, setChatsOffsetDate] = useState(0);
  const [chatsOffsetId, setChatsOffsetId] = useState(0);
  const [chatsOffsetPeer, setChatsOffsetPeer] = useState<any>({ _: 'inputPeerEmpty' });

  const [selectedFolder, setSelectedFolder] = useState<CloudFolder | null>(null); // This is the selected chat
  const [currentChatMedia, setCurrentChatMedia] = useState<CloudFile[]>([]);
  const [isLoadingChatMedia, setIsLoadingChatMedia] = useState(false);
  const [hasMoreChatMedia, setHasMoreChatMedia] = useState(true);
  const [currentMediaOffsetId, setCurrentMediaOffsetId] = useState<number>(0);

  const [selectedFileForDetails, setSelectedFileForDetails] = useState<CloudFile | null>(null);
  const [isDetailsPanelOpen, setIsDetailsPanelOpen] = useState(false);

  const [isImageViewerOpen, setIsImageViewerOpen] = useState(false);
  const [viewingImageUrl, setViewingImageUrl] = useState<string | null>(null);
  const [viewingImageName, setViewingImageName] = useState<string | undefined>(undefined);

  const [isVideoPlayerOpen, setIsVideoPlayerOpen] = useState(false);
  const [playingVideoUrl, setPlayingVideoUrl] = useState<string | null>(null);
  const [playingVideoName, setPlayingVideoName] = useState<string | undefined>(undefined);
  const [isPreparingVideoStream, setIsPreparingVideoStream] = useState(false);
  const [videoStreamUrl, setVideoStreamUrl] = useState<string | null>(null);
  const [preparingVideoStreamForFileId, setPreparingVideoStreamForFileId] = useState<string | null>(null);
  const videoStreamAbortControllerRef = useRef<AbortController | null>(null);

  const [isDownloadManagerOpen, setIsDownloadManagerOpen] = useState(false);
  const [downloadQueue, setDownloadQueue] = useState<DownloadQueueItemType[]>([]);
  const activeDownloadsRef = useRef<Set<string>>(new Set());
  const downloadQueueRef = useRef<DownloadQueueItemType[]>([]);
  const browserDownloadTriggeredRef = useRef(new Set<string>());

  const [isChatSelectionDialogOpen, setIsChatSelectionDialogOpen] = useState(false);
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
  const [filesToUpload, setFilesToUpload] = useState<ExtendedFile[]>([]);
  const [isUploadingFiles, setIsUploadingFiles] = useState(false);
  const uploadAbortControllersRef = useRef<Map<string, AbortController>>(new Map());


  const headerRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLDivElement>(null);


  useEffect(() => {
    downloadQueueRef.current = downloadQueue;
  }, [downloadQueue]);

  const { toast } = useToast();

  const [authStep, setAuthStep] = useState<AuthStep>('initial');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [phoneCode, setPhoneCode] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);

  const handleApiError = useCallback((error: any, title: string, defaultMessage: string) => {
    console.error(`${title}:`, error.message, error.originalErrorObject || error);
    let description = error.message || defaultMessage;
    if (error.message && error.message.includes("Invalid hash in mt_dh_gen_ok")) {
      description = "Connection handshake failed. Please check your API ID/Hash in .env.local, ensure it's correct, restart the server, and try clearing your browser's localStorage for this site.";
      setAuthError(description);
    } else if (error.message === 'AUTH_RESTART') {
        description = "Authentication process needs to be restarted. Please try entering your phone number again.";
        handleReset(false); // Reset state without server logout for AUTH_RESTART
    } else {
        setAuthError(description);
    }
    toast({ title, description, variant: "destructive", duration: error.message && error.message.includes("Invalid hash") ? 10000 : 5000 });
  }, [toast]); // Removed handleReset from dependencies to avoid re-creation loop

  const fetchDialogFilters = useCallback(async () => {
    if (!isConnected) return;
    setIsLoadingDialogFilters(true);
    try {
      const filters = await telegramService.getDialogFilters();
      setDialogFilters(filters);
      // If "All Chats" is the default and exists, set it. Otherwise, handle no filters.
      const allChatsFilter = filters.find(f => f.id === ALL_CHATS_FILTER_ID);
      if (allChatsFilter) {
        setActiveDialogFilterId(allChatsFilter.id);
      } else if (filters.length > 0) {
        setActiveDialogFilterId(filters[0].id); // Fallback to first available filter
      } else {
        setActiveDialogFilterId(ALL_CHATS_FILTER_ID); // Default even if no server filters
      }
    } catch (error: any) {
      handleApiError(error, "Error Fetching Folders", "Could not load your chat folders.");
      // Ensure a default "All Chats" filter exists for UI consistency even on error
      if (!dialogFilters.some(f => f.id === ALL_CHATS_FILTER_ID)) {
        setDialogFilters([{ id: ALL_CHATS_FILTER_ID, title: "All Chats", _: 'dialogFilterDefault', flags:0, include_peers: [] }]);
      }
      setActiveDialogFilterId(ALL_CHATS_FILTER_ID);
    } finally {
      setIsLoadingDialogFilters(false);
    }
  }, [isConnected, handleApiError, dialogFilters]); // Added dialogFilters to dependencies

  const fetchInitialChats = useCallback(async () => {
    if (isProcessingChatsRef.current || !isConnected) {
        console.log("fetchInitialChats: Already processing, request in flight, or not connected. Exiting.");
        return;
    }

    isProcessingChatsRef.current = true;
    setIsProcessingChats(true);

    // Reset chat list and pagination for the current filter
    setAllChats([]);
    setAuthError(null);
    setChatsOffsetDate(0);
    setChatsOffsetId(0);
    setChatsOffsetPeer({ _: 'inputPeerEmpty' });
    setHasMoreChats(true);
    setIsLoadingMoreChats(false); // Ensure this is reset
    isLoadingMoreChatsRequestInFlightRef.current = false; // And this too

    toast({ title: "Fetching Chats...", description: `Loading conversations for selected folder.` });

    try {
      const response = await telegramService.getTelegramChats(
        INITIAL_CHATS_LOAD_LIMIT, 0, 0, { _: 'inputPeerEmpty' },
        activeDialogFilterId === ALL_CHATS_FILTER_ID ? undefined : activeDialogFilterId
      );
      setAllChats(response.folders);
      setChatsOffsetDate(response.nextOffsetDate);
      setChatsOffsetId(response.nextOffsetId);
      setChatsOffsetPeer(response.nextOffsetPeer);
      setHasMoreChats(response.hasMore);
      if (response.folders.length === 0 && !response.hasMore) {
        toast({ title: "No Chats Found", description: "This folder appears to be empty.", variant: "default" });
      } else if (response.folders.length > 0) {
        toast({ title: "Chats Loaded!", description: `Loaded ${response.folders.length} initial chats.` });
      }
    } catch (error: any) {
      handleApiError(error, "Error Fetching Chats", `Could not load your chats. ${error.message || 'Unknown error'}`);
      setHasMoreChats(false);
    } finally {
      isProcessingChatsRef.current = false;
      setIsProcessingChats(false);
    }
  }, [isConnected, activeDialogFilterId, handleApiError, toast]);


  const checkExistingConnection = useCallback(async () => {
    console.log("Checking existing connection...");
    try {
      const previouslyConnected = await telegramService.isUserConnected();
      if (previouslyConnected) {
        const storedUser = telegramService.getUserSessionDetails();
        if (storedUser && storedUser.phone) {
            setPhoneNumber(storedUser.phone);
        }
        console.log("User was previously connected. Setting state.");
        setIsConnected(true);
        setAuthStep('initial');
        setAuthError(null);
        // fetchInitialChats will be triggered by the useEffect that depends on isConnected & activeDialogFilterId
        // Fetch dialog filters as well
        fetchDialogFilters();
      } else {
        console.log("No existing connection found or session invalid.");
        setIsConnected(false);
        setPhoneNumber('');
        setAuthStep('initial');
        setAuthError(null);
        setAllChats([]);
        setDialogFilters([]);
        setActiveDialogFilterId(ALL_CHATS_FILTER_ID);
      }
    } catch (error: any) {
      console.warn("Error checking existing connection:", error.message, error.originalErrorObject || error);
      const errorMessage = error.message || (error.originalErrorObject?.error_message);
      if (errorMessage?.includes("Invalid hash in mt_dh_gen_ok")) {
        toast({
          title: "Connection Handshake Failed",
          description: "Could not establish a secure connection. Please verify your API ID/Hash in .env.local. If correct, try clearing localStorage for this site and restarting the server.",
          variant: "destructive",
          duration: 10000,
        });
        setAuthError("Connection handshake failed. Check API credentials & localStorage.");
      } else if (errorMessage === 'AUTH_RESTART') {
          toast({ title: "Authentication Expired", description: "Your session needs to be re-initiated. Please enter your phone number again.", variant: "destructive" });
          handleReset(false);
      } else {
         handleApiError(error, "Connection Check Error", `Failed to verify existing connection. ${errorMessage}`);
      }
      setIsConnected(false);
    }
  }, [toast, handleApiError, fetchDialogFilters]); // Removed handleReset to break dependency cycle

  useEffect(() => {
    checkExistingConnection();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Runs once on mount

  useEffect(() => {
    // This effect triggers fetching initial chats when connection is established OR when the active filter changes
    if (isConnected && (allChats.length === 0 || activeDialogFilterId !== undefined) && !isProcessingChatsRef.current ) {
      // When filter changes, reset selectedFolder as it might not be relevant to the new chat list
      if(selectedFolder) setSelectedFolder(null); 
      if(currentChatMedia.length > 0) setCurrentChatMedia([]);

      fetchInitialChats();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected, activeDialogFilterId, fetchInitialChats]); // Re-fetch when filter changes or connection established


  const handleReset = useCallback(async (performServerLogout = true) => {
    // This function should not depend on states it's trying to reset, or props that depend on those states
    // If it must use `isConnected`, ensure it's the value at the time of call, not a stale closure.

    const currentIsConnected = isConnected; // Capture current state

    if (performServerLogout && currentIsConnected) {
        toast({ title: "Disconnecting...", description: "Logging out from Telegram." });
        try {
            await telegramService.signOut();
            toast({ title: "Disconnected", description: "Successfully signed out." });
        } catch (error: any) {
            console.error("Error during server logout:", error);
            if(!(error.message && error.message.includes('AUTH_KEY_UNREGISTERED'))){
                 toast({ title: "Disconnection Error", description: error.message || "Could not sign out properly from server.", variant: "destructive" });
            }
        }
    }

    setIsConnected(false);
    isProcessingChatsRef.current = false;
    setAllChats([]);
    setSelectedFolder(null);
    setCurrentChatMedia([]);
    setIsConnecting(false);
    setAuthStep('initial');
    setPhoneNumber('');
    setPhoneCode('');
    setPassword('');
    setAuthError(null);

    isLoadingMoreChatsRequestInFlightRef.current = false;
    setHasMoreChats(true);
    setChatsOffsetDate(0);
    setChatsOffsetId(0);
    setChatsOffsetPeer({ _: 'inputPeerEmpty' });

    setIsLoadingChatMedia(false);
    setHasMoreChatMedia(true);
    setCurrentMediaOffsetId(0);

    // Clear dialog filters state
    setDialogFilters([]);
    setActiveDialogFilterId(ALL_CHATS_FILTER_ID);
    setIsLoadingDialogFilters(true);


    downloadQueueRef.current.forEach(item => {
      if (item.abortController && !item.abortController.signal.aborted) {
        item.abortController.abort("User reset application state");
      }
    });
    setDownloadQueue([]);
    activeDownloadsRef.current.clear();
    browserDownloadTriggeredRef.current.clear();

    if (videoStreamAbortControllerRef.current && !videoStreamAbortControllerRef.current.signal.aborted) {
        videoStreamAbortControllerRef.current.abort("User reset application state");
    }
    if (videoStreamUrl) {
        URL.revokeObjectURL(videoStreamUrl);
        setVideoStreamUrl(null);
    }
    setPlayingVideoUrl(null);
    setIsPreparingVideoStream(false);
    setPreparingVideoStreamForFileId(null);
    setIsChatSelectionDialogOpen(false);
    setIsUploadDialogOpen(false);
    setFilesToUpload([]);
    uploadAbortControllersRef.current.forEach((controller, id) => {
      console.log(`Aborting upload for ${id} due to reset`);
      controller.abort("User reset application state");
    });
    uploadAbortControllersRef.current.clear();
    setIsUploadingFiles(false);

  }, [toast, videoStreamUrl, isConnected]); // Added isConnected to dependencies of handleReset


  useEffect(() => {
    const processQueue = async () => {
      for (let i = 0; i < downloadQueueRef.current.length; i++) {
        const itemInLoop = downloadQueueRef.current[i];
        if (!itemInLoop) continue;

        const currentItemFromState = downloadQueueRef.current.find(q => q.id === itemInLoop.id);

        if (!currentItemFromState) {
            if(activeDownloadsRef.current.has(itemInLoop.id)) {
                activeDownloadsRef.current.delete(itemInLoop.id);
            }
            continue;
        }
        const upToDateItem = currentItemFromState;

        if (upToDateItem.abortController?.signal.aborted && upToDateItem.status !== 'cancelled' && upToDateItem.status !== 'failed' && upToDateItem.status !== 'completed') {
             setDownloadQueue(prevQ => prevQ.map(q => q.id === upToDateItem.id ? { ...q, status: 'cancelled', progress: 0, downloadedBytes: 0, error_message: "Aborted by user or system." } : q));
             if(activeDownloadsRef.current.has(upToDateItem.id)) {
                activeDownloadsRef.current.delete(upToDateItem.id);
             }
             continue;
        }

        if (upToDateItem.status === 'downloading' &&
            upToDateItem.location &&
            upToDateItem.totalSizeInBytes &&
            upToDateItem.downloadedBytes < upToDateItem.totalSizeInBytes &&
            !activeDownloadsRef.current.has(upToDateItem.id)
            ) {

          activeDownloadsRef.current.add(upToDateItem.id);

          try {
            if (upToDateItem.abortController?.signal.aborted) {
                activeDownloadsRef.current.delete(upToDateItem.id);
                if(upToDateItem.status !== 'cancelled') setDownloadQueue(prevQ => prevQ.map(q => q.id === upToDateItem.id ? { ...q, status: 'cancelled', error_message: "Aborted" } : q));
                continue;
            }

            const remainingBytes = upToDateItem.totalSizeInBytes - upToDateItem.downloadedBytes;
            let actualLimitForApi: number;
            let chunkResponse: telegramService.FileChunkResponse;

            if (remainingBytes <= 0) {
                if (!browserDownloadTriggeredRef.current.has(upToDateItem.id) && upToDateItem.chunks && upToDateItem.chunks.length > 0) {
                    browserDownloadTriggeredRef.current.add(upToDateItem.id);
                    const fullFileBlob = new Blob(upToDateItem.chunks, { type: upToDateItem.telegramMessage?.mime_type || 'application/octet-stream' });
                    const url = URL.createObjectURL(fullFileBlob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = upToDateItem.name;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                }
                setDownloadQueue(prevQ => prevQ.map(q => q.id === upToDateItem.id ? { ...q, status: 'completed', progress: 100, downloadedBytes: upToDateItem.totalSizeInBytes!, currentOffset: upToDateItem.totalSizeInBytes!, chunks: [] } : q));
                activeDownloadsRef.current.delete(upToDateItem.id);
                continue;
            }

            if (upToDateItem.cdnFileToken && upToDateItem.cdnDcId && upToDateItem.cdnFileHashes && upToDateItem.cdnEncryptionKey && upToDateItem.cdnEncryptionIv) {
                const currentHashBlockIndex = upToDateItem.cdnCurrentFileHashIndex || 0;
                if (currentHashBlockIndex >= upToDateItem.cdnFileHashes.length) {
                    if (upToDateItem.downloadedBytes >= upToDateItem.totalSizeInBytes) {
                        if (!browserDownloadTriggeredRef.current.has(upToDateItem.id) && upToDateItem.chunks && upToDateItem.chunks.length > 0) {
                            browserDownloadTriggeredRef.current.add(upToDateItem.id);
                            const fullFileBlob = new Blob(upToDateItem.chunks, { type: upToDateItem.telegramMessage?.mime_type || 'application/octet-stream' });
                            const url = URL.createObjectURL(fullFileBlob);
                            const a = document.createElement('a'); // Define 'a' here
                            a.href = url;
                            a.download = upToDateItem.name;
                            document.body.appendChild(a);
                            a.click();
                            document.body.removeChild(a);
                            URL.revokeObjectURL(url);
                        }
                        setDownloadQueue(prevQ => prevQ.map(q => q.id === upToDateItem.id ? { ...q, status: 'completed', progress: 100, downloadedBytes: upToDateItem.totalSizeInBytes!, chunks: [] } : q));
                    } else {
                        setDownloadQueue(prevQ => prevQ.map(q => q.id === upToDateItem.id ? { ...q, status: 'failed', error_message: 'CDN blocks exhausted before completion' } : q));
                    }
                    activeDownloadsRef.current.delete(upToDateItem.id);
                    continue;
                }
                const cdnBlock = upToDateItem.cdnFileHashes[currentHashBlockIndex];
                actualLimitForApi = cdnBlock.limit;

                chunkResponse = await telegramService.downloadCdnFileChunk(
                    {
                        dc_id: upToDateItem.cdnDcId,
                        file_token: upToDateItem.cdnFileToken,
                        encryption_key: upToDateItem.cdnEncryptionKey,
                        encryption_iv: upToDateItem.cdnEncryptionIv,
                        file_hashes: upToDateItem.cdnFileHashes,
                    },
                    cdnBlock.offset,
                    actualLimitForApi,
                    upToDateItem.abortController?.signal
                );

                if (chunkResponse?.bytes && upToDateItem.cdnFileHashes) {
                    const downloadedHash = await telegramService.calculateSHA256(chunkResponse.bytes);
                    if (!telegramService.areUint8ArraysEqual(downloadedHash, cdnBlock.hash)) {
                        console.error(`CDN Hash Mismatch for ${upToDateItem.name}, block index ${currentHashBlockIndex}. Expected:`, cdnBlock.hash, "Got:", downloadedHash);
                        setDownloadQueue(prevQ => prevQ.map(q => q.id === upToDateItem.id ? { ...q, status: 'failed', error_message: 'CDN Hash Mismatch' } : q));
                        activeDownloadsRef.current.delete(upToDateItem.id);
                        continue;
                    }
                     console.log(`CDN Hash OK for ${upToDateItem.name}, block ${currentHashBlockIndex}`);
                }
            } else {

                const bytesNeededForFileDirect = upToDateItem.totalSizeInBytes - upToDateItem.downloadedBytes;
                const offsetWithinCurrentBlockDirect = upToDateItem.currentOffset % ONE_MB;
                const bytesLeftInCurrentBlockDirect = ONE_MB - offsetWithinCurrentBlockDirect;

                let idealRequestSizeDirect = Math.min(bytesLeftInCurrentBlockDirect, DOWNLOAD_CHUNK_SIZE);

                if (bytesNeededForFileDirect <= 0) {
                     actualLimitForApi = 0;
                } else if (idealRequestSizeDirect <= 0) {
                    actualLimitForApi = bytesNeededForFileDirect > 0 ? KB_1 : 0;
                } else if (idealRequestSizeDirect < KB_1) {
                    actualLimitForApi = KB_1;
                } else {
                    actualLimitForApi = Math.floor(idealRequestSizeDirect / KB_1) * KB_1;
                }

                if (actualLimitForApi === 0 && bytesNeededForFileDirect > 0 && idealRequestSizeDirect > 0) {
                    actualLimitForApi = KB_1;
                }

                console.log(`Processing direct download for ${upToDateItem.name}, offset: ${upToDateItem.currentOffset}, API limit: ${actualLimitForApi}, idealRequestSize: ${idealRequestSizeDirect}, neededForFile: ${bytesNeededForFileDirect}, leftInBlock: ${bytesLeftInCurrentBlockDirect}, totalSize: ${upToDateItem.totalSizeInBytes}`);

                if (actualLimitForApi <= 0) {
                   if (upToDateItem.downloadedBytes >= upToDateItem.totalSizeInBytes) {
                        if (!browserDownloadTriggeredRef.current.has(upToDateItem.id) && upToDateItem.chunks && upToDateItem.chunks.length > 0) {
                            browserDownloadTriggeredRef.current.add(upToDateItem.id);
                            const fullFileBlob = new Blob(upToDateItem.chunks, { type: upToDateItem.telegramMessage?.mime_type || 'application/octet-stream' });
                            const url = URL.createObjectURL(fullFileBlob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = upToDateItem.name;
                            document.body.appendChild(a);
                            a.click();
                            document.body.removeChild(a);
                            URL.revokeObjectURL(url);
                        }
                       setDownloadQueue(prevQ => prevQ.map(q => q.id === upToDateItem.id ? { ...q, status: 'completed', progress: 100, downloadedBytes: upToDateItem.totalSizeInBytes!, currentOffset: upToDateItem.totalSizeInBytes!, chunks: [] } : q));
                   } else if (bytesNeededForFileDirect > 0) {
                        console.warn("Actual limit calc error for direct download:", { upToDateItem, bytesNeededForFileDirect, idealRequestSizeDirect, actualLimitForApi });
                        setDownloadQueue(prevQ => prevQ.map(q => q.id === upToDateItem.id ? { ...q, status: 'failed', error_message: 'Internal limit calc error' } : q));
                   }
                   activeDownloadsRef.current.delete(upToDateItem.id);
                   continue;
                }

                chunkResponse = await telegramService.downloadFileChunk(
                    upToDateItem.location!,
                    upToDateItem.currentOffset,
                    actualLimitForApi,
                    upToDateItem.abortController?.signal
                );
            }


            if (upToDateItem.abortController?.signal.aborted) {
              activeDownloadsRef.current.delete(upToDateItem.id);
              if(upToDateItem.status !== 'cancelled') setDownloadQueue(prevQ => prevQ.map(q => q.id === upToDateItem.id ? { ...q, status: 'cancelled', error_message: "Aborted" } : q));
              continue;
            }

            if (chunkResponse?.isCdnRedirect && chunkResponse.cdnRedirectData) {
                setDownloadQueue(prevQ => prevQ.map(q_item => q_item.id === upToDateItem.id ? {
                    ...q_item,
                    status: 'downloading', // Keep as downloading to re-trigger processing
                    cdnDcId: chunkResponse.cdnRedirectData!.dc_id,
                    cdnFileToken: chunkResponse.cdnRedirectData!.file_token,
                    cdnEncryptionKey: chunkResponse.cdnRedirectData!.encryption_key,
                    cdnEncryptionIv: chunkResponse.cdnRedirectData!.encryption_iv,
                    cdnFileHashes: chunkResponse.cdnRedirectData!.file_hashes.map(fh_raw => ({
                        offset: Number(fh_raw.offset),
                        limit: fh_raw.limit,
                        hash: fh_raw.hash,
                    })),
                    cdnCurrentFileHashIndex: 0, // Reset for CDN processing
                    currentOffset: 0, // Reset offset for CDN
                    downloadedBytes: 0, // Reset downloadedBytes for CDN
                    progress: 0, // Reset progress
                    chunks: [], // Clear existing chunks
                } : q_item));
            } else if (chunkResponse?.errorType === 'FILE_REFERENCE_EXPIRED') {
                setDownloadQueue(prevQ => prevQ.map(q_item => q_item.id === upToDateItem.id ? { ...q_item, status: 'refreshing_reference' } : q_item));

            } else if (chunkResponse?.bytes) {
              const chunkSize = chunkResponse.bytes.length;
              setDownloadQueue(prevQ =>
                prevQ.map(q_item => {
                  if (q_item.id === upToDateItem.id) {
                    const newDownloadedBytes = q_item.downloadedBytes + chunkSize;
                    const newProgress = Math.min(100, Math.floor((newDownloadedBytes / q_item.totalSizeInBytes!) * 100));
                    const newChunks = [...(q_item.chunks || []), chunkResponse.bytes!];

                    let nextReqOffset = q_item.currentOffset;
                    let nextCdnProcessingIndex = q_item.cdnCurrentFileHashIndex;

                    if(q_item.cdnFileToken && q_item.cdnFileHashes) {
                      // For CDN, offset is managed by cdnCurrentFileHashIndex and the block's offset
                      // We increment the index to move to the next hash block
                      nextCdnProcessingIndex = (q_item.cdnCurrentFileHashIndex || 0) + 1;
                      // The actual next request offset for CDN will be cdnFileHashes[nextCdnProcessingIndex].offset
                      // currentOffset here will track total bytes downloaded for CDN file for progress
                      nextReqOffset = newDownloadedBytes; 
                    } else {
                      // For direct download, increment offset by chunk size
                      nextReqOffset = q_item.currentOffset + chunkSize;
                    }

                    if (newDownloadedBytes >= q_item.totalSizeInBytes!) {
                      if (q_item.status !== 'completed' && !browserDownloadTriggeredRef.current.has(q_item.id)) {
                        browserDownloadTriggeredRef.current.add(q_item.id);
                        const fullFileBlob = new Blob(newChunks, { type: q_item.telegramMessage?.mime_type || 'application/octet-stream' });
                        const url = URL.createObjectURL(fullFileBlob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = q_item.name;
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        URL.revokeObjectURL(url);
                      }
                      return {
                        ...q_item,
                        status: 'completed',
                        progress: 100,
                        downloadedBytes: q_item.totalSizeInBytes!,
                        chunks: [], // Clear chunks after completion
                        cdnCurrentFileHashIndex: undefined, // Reset CDN index
                        currentOffset: q_item.totalSizeInBytes! // Ensure offset is at total size
                      };
                    }
                    return {
                      ...q_item,
                      downloadedBytes: newDownloadedBytes,
                      progress: newProgress,
                      currentOffset: nextReqOffset, // This is the offset for the *next* request for direct, or total downloaded for CDN
                      chunks: newChunks,
                      cdnCurrentFileHashIndex: q_item.cdnFileToken ? nextCdnProcessingIndex : undefined,
                      status: 'downloading', // Keep as downloading to process next chunk
                    };
                  }
                  return q_item;
                })
              );
            } else {
              console.error(`Failed to download chunk for ${upToDateItem.name} or no data returned. Response:`, chunkResponse);
              const errorMessage = chunkResponse?.errorType || (chunkResponse && Object.keys(chunkResponse).length === 0 ? 'Empty response object' : 'Unknown error or no data returned');
              setDownloadQueue(prevQ => prevQ.map(q_item => q_item.id === upToDateItem.id ? { ...q_item, status: 'failed', error_message: `Download error: ${errorMessage}` } : q_item));
            }
          } catch (error: any) {
             console.error(`Error processing download item ${upToDateItem.id} (${upToDateItem.name}):`, error);
             if (error.name === 'AbortError' || (error.message && error.message.toLowerCase().includes('aborted'))) {
                if(upToDateItem.status !== 'cancelled' && upToDateItem.status !== 'failed' && upToDateItem.status !== 'completed' ) {
                    setDownloadQueue(prevQ => prevQ.map(q_item => q_item.id === upToDateItem.id ? { ...q_item, status: 'cancelled', error_message: "Aborted by user or system." } : q_item));
                }
             } else {
                setDownloadQueue(prevQ => prevQ.map(q_item => q_item.id === upToDateItem.id ? { ...q_item, status: 'failed', error_message: error.message || 'Processing error' } : q_item));
             }
          } finally {
             activeDownloadsRef.current.delete(upToDateItem.id);
          }
        } else if (upToDateItem.status === 'refreshing_reference' && !activeDownloadsRef.current.has(upToDateItem.id)) {
            activeDownloadsRef.current.add(upToDateItem.id);
            try {
                if (upToDateItem.abortController?.signal.aborted) {
                    activeDownloadsRef.current.delete(upToDateItem.id);
                     if(upToDateItem.status !== 'cancelled') setDownloadQueue(prevQ => prevQ.map(q => q.id === upToDateItem.id ? { ...q, status: 'cancelled', error_message: "Aborted" } : q));
                    continue;
                }

                const updatedMediaObject = await telegramService.refreshFileReference(upToDateItem);
                if (updatedMediaObject && updatedMediaObject.file_reference) {
                    let newLocation;
                    // Reconstruct InputFileLocation based on the type of updatedMediaObject
                    if (updatedMediaObject._ === 'photo' && updatedMediaObject.id && updatedMediaObject.access_hash && updatedMediaObject.file_reference) {
                        const largestSize = updatedMediaObject.sizes?.find((s: any) => s.type === 'y') || updatedMediaObject.sizes?.sort((a: any, b: any) => (b.w * b.h) - (a.w * a.h))[0];
                        newLocation = {
                            _: 'inputPhotoFileLocation',
                            id: updatedMediaObject.id,
                            access_hash: updatedMediaObject.access_hash,
                            file_reference: updatedMediaObject.file_reference,
                            thumb_size: largestSize?.type || '', // Use the same thumb_size logic as in prepareFileDownloadInfo
                        };
                    } else if (updatedMediaObject._ === 'document' && updatedMediaObject.id && updatedMediaObject.access_hash && updatedMediaObject.file_reference) {
                         newLocation = {
                            _: 'inputDocumentFileLocation',
                            id: updatedMediaObject.id,
                            access_hash: updatedMediaObject.access_hash,
                            file_reference: updatedMediaObject.file_reference,
                            thumb_size: '', // For documents, thumb_size is usually empty for the main file
                        };
                    }

                    if (newLocation) {
                        setDownloadQueue(prevQ => prevQ.map(q_item => q_item.id === upToDateItem.id ? {
                            ...q_item,
                            status: 'downloading', // Ready to retry download
                            location: newLocation,
                            telegramMessage: { ...(q_item.telegramMessage || {}), ...updatedMediaObject } // Update the telegramMessage too
                        } : q_item));
                    } else {
                         setDownloadQueue(prevQ => prevQ.map(q_item => q_item.id === upToDateItem.id ? { ...q_item, status: 'failed', error_message: 'Refresh failed (new location error)' } : q_item));
                    }
                } else {
                    setDownloadQueue(prevQ => prevQ.map(q_item => q_item.id === upToDateItem.id ? { ...q_item, status: 'failed', error_message: 'Refresh failed (no reference)' } : q_item));
                }
            } catch (refreshError: any) {
                setDownloadQueue(prevQ => prevQ.map(q_item => q_item.id === upToDateItem.id ? { ...q_item, status: 'failed', error_message: refreshError.message || 'Refresh error' } : q_item));
            } finally {
                activeDownloadsRef.current.delete(upToDateItem.id);
            }
        } else if (['paused', 'completed', 'failed', 'cancelled'].includes(upToDateItem.status) ) {
            if(activeDownloadsRef.current.has(upToDateItem.id)){
                activeDownloadsRef.current.delete(upToDateItem.id);
            }
        }
      }
    };

    const intervalId = setInterval(processQueue, 750); // Process queue periodically

    return () => {
        clearInterval(intervalId);
        // Cleanup: Abort any ongoing downloads when the component unmounts or effect re-runs
        downloadQueueRef.current.forEach(item => {
            if (item.abortController && !item.abortController.signal.aborted &&
                (item.status === 'downloading' || item.status === 'refreshing_reference' || item.status === 'queued' || item.status === 'paused')) {
                item.abortController.abort("Component cleanup or effect re-run");
            }
        });
        activeDownloadsRef.current.clear(); // Clear active downloads on unmount
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty dependency array: set up interval once on mount


  useEffect(() => {
    // This effect is to reset isLoadingMoreChatsRequestInFlightRef after isLoadingMoreChats becomes false
    if (!isLoadingMoreChats && isConnected) {
      const timer = setTimeout(() => {
        // console.log("Resetting isLoadingMoreChatsRequestInFlightRef.current to false after delay");
        isLoadingMoreChatsRequestInFlightRef.current = false;
      }, 150); // A small delay to allow UI to settle
      return () => clearTimeout(timer);
    }
  }, [isLoadingMoreChats, isConnected]);


  const loadMoreChatsCallback = useCallback(async () => {
    if (
        isLoadingMoreChatsRequestInFlightRef.current ||
        isLoadingMoreChats || // Check the state variable
        isProcessingChatsRef.current || // Check the ref for initial processing
        !hasMoreChats ||
        !isConnected
        ) {
      // console.log("loadMoreChatsCallback: Skipped due to active flags or no more chats/connection.");
      return;
    }

    isLoadingMoreChatsRequestInFlightRef.current = true;
    setIsLoadingMoreChats(true); // Set state for UI feedback

    toast({ title: "Loading More Chats...", description: "Fetching the next batch of conversations." });
    try {
      const response = await telegramService.getTelegramChats(
        SUBSEQUENT_CHATS_LOAD_LIMIT,
        chatsOffsetDate,
        chatsOffsetId,
        chatsOffsetPeer,
        activeDialogFilterId === ALL_CHATS_FILTER_ID ? undefined : activeDialogFilterId
      );
      setAllChats(prev => [...prev, ...response.folders]);
      setChatsOffsetDate(response.nextOffsetDate);
      setChatsOffsetId(response.nextOffsetId);
      setChatsOffsetPeer(response.nextOffsetPeer);
      setHasMoreChats(response.hasMore);
       if (response.folders.length > 0) {
         toast({ title: "More Chats Loaded!", description: `Loaded ${response.folders.length} additional chats.` });
      } else if (!response.hasMore) {
         toast({ title: "All Chats Loaded", description: "You've reached the end of your chat list for this folder."});
      }
    } catch (error: any) {
      handleApiError(error, "Error Loading More Chats", `Could not load more chats. ${error.message}`);
      setHasMoreChats(false); // Stop further attempts on error
    } finally {
      // isLoadingMoreChatsRequestInFlightRef will be reset by the separate useEffect
      setIsLoadingMoreChats(false); // Reset UI loading state
    }
  }, [isConnected, hasMoreChats, chatsOffsetDate, chatsOffsetId, chatsOffsetPeer, activeDialogFilterId, toast, handleApiError, isLoadingMoreChats]); // Added isLoadingMoreChats


  const observerChats = useRef<IntersectionObserver | null>(null);
  const lastChatElementRef = useCallback((node: HTMLLIElement | null) => {
    if (isLoadingMoreChats || isProcessingChatsRef.current || isLoadingMoreChatsRequestInFlightRef.current) {
      // console.log("lastChatElementRef: Observer setup skipped due to active loading flags.");
      return;
    }
    if (observerChats.current) observerChats.current.disconnect();

    observerChats.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting &&
          hasMoreChats &&
          !isProcessingChatsRef.current && // Check ref
          !isLoadingMoreChats && // Check state
          !isLoadingMoreChatsRequestInFlightRef.current // Check ref for active request
        ) {
        // console.log("IntersectionObserver triggered for chats");
        loadMoreChatsCallback();
      }
    });
    if (node) observerChats.current.observe(node);
  }, [isLoadingMoreChats, hasMoreChats, loadMoreChatsCallback]); // Removed isProcessingChatsRef, isLoadingMoreChatsRequestInFlightRef as they are checked inside


  const fetchInitialChatMedia = useCallback(async (folder: CloudFolder) => {
    if (!folder.inputPeer) {
      toast({ title: "Error", description: "Cannot load media: InputPeer data is missing for this chat.", variant: "destructive" });
      return;
    }
    setIsLoadingChatMedia(true);
    setCurrentChatMedia([]); // Clear previous media
    setHasMoreChatMedia(true); // Assume there's more until API says otherwise
    setCurrentMediaOffsetId(0); // Reset offset for new folder
    toast({ title: `Loading Media for ${folder.name}`, description: "Fetching initial media items..." });

    try {
      const response = await telegramService.getChatMediaHistory(folder.inputPeer, INITIAL_MEDIA_LOAD_LIMIT, 0);
      setCurrentChatMedia(response.files);
      setCurrentMediaOffsetId(response.nextOffsetId || 0); // Ensure offsetId is a number
      setHasMoreChatMedia(response.hasMore);
      if (response.files.length === 0 && !response.hasMore) {
          toast({ title: "No Media Found", description: `No media items in ${folder.name}.`});
      } else if (response.files.length > 0) {
           toast({ title: "Media Loaded", description: `Loaded ${response.files.length} initial media items for ${folder.name}.`});
      }
    } catch (error: any) {
      handleApiError(error, `Error Fetching Media for ${folder.name}`, `Could not load media items. ${error.message}`);
    } finally {
      setIsLoadingChatMedia(false);
    }
  },[toast, handleApiError]);

  const loadMoreChatMediaCallback = useCallback(async () => {
    if (isLoadingChatMedia || !hasMoreChatMedia || !selectedFolder?.inputPeer) return;
    setIsLoadingChatMedia(true);
    toast({ title: `Loading More Media for ${selectedFolder.name}`, description: "Fetching next batch..." });
    try {
      const response = await telegramService.getChatMediaHistory(selectedFolder.inputPeer, SUBSEQUENT_MEDIA_LOAD_LIMIT, currentMediaOffsetId);
      setCurrentChatMedia(prev => [...prev, ...response.files]);
      setCurrentMediaOffsetId(response.nextOffsetId || 0);
      setHasMoreChatMedia(response.hasMore);
       if (response.files.length > 0) {
           toast({ title: "More Media Loaded", description: `Loaded ${response.files.length} additional media items.`});
      } else if (!response.hasMore) {
           toast({ title: "All Media Loaded", description: `No more media to load for ${selectedFolder.name}.`});
      }
    } catch (error: any) {
      handleApiError(error, "Error Loading More Media", `Could not load more media items. ${error.message}`);
      setHasMoreChatMedia(false); // Stop further attempts on error
    } finally {
      setIsLoadingChatMedia(false);
    }
  }, [isLoadingChatMedia, hasMoreChatMedia, selectedFolder, currentMediaOffsetId, toast, handleApiError]);

  const observerMedia = useRef<IntersectionObserver | null>(null);
  const lastMediaItemRef = useCallback((node: HTMLDivElement | null) => {
    if (isLoadingChatMedia) return;
    if (observerMedia.current) observerMedia.current.disconnect();
    observerMedia.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMoreChatMedia && !isLoadingChatMedia) {
        loadMoreChatMediaCallback();
      }
    });
    if (node) observerMedia.current.observe(node);
  }, [isLoadingChatMedia, hasMoreChatMedia, loadMoreChatMediaCallback]);

  const handleSelectFolder = (folderId: string) => { // This is for selecting a chat
    const folder = allChats.find(f => f.id === folderId);
    if (folder) {
      setSelectedFolder(folder);
      fetchInitialChatMedia(folder); // Load media for the selected chat
      setIsChatSelectionDialogOpen(false); // Close chat selection dialog
    } else {
      setSelectedFolder(null); // Clear selection if folder not found
      setCurrentChatMedia([]);
    }
  };


  const handleSendCode = async (fullPhoneNumberFromConnect: string) => {
    if (!fullPhoneNumberFromConnect || !fullPhoneNumberFromConnect.startsWith('+') || fullPhoneNumberFromConnect.length < 5) {
      setAuthError("Phone number is required and must be valid (e.g. +972501234567).");
      toast({ title: "Invalid Phone Number", description: "Please select a country and enter a valid number.", variant: "destructive" });
      return;
    }
    setIsConnecting(true);
    setAuthError(null);
    setPhoneNumber(fullPhoneNumberFromConnect); // Store the full number for later steps
    toast({ title: "Sending Code...", description: `Requesting verification code for ${fullPhoneNumberFromConnect}.` });

    try {
      await telegramService.sendCode(fullPhoneNumberFromConnect);
      setAuthStep('awaiting_code');
      toast({ title: "Code Sent!", description: "Please check Telegram for your verification code." });
    } catch (error: any) {
        if ((error as Error).message === 'AUTH_RESTART') {
             setAuthError("Authentication process needs to be restarted. Please try entering your phone number again.");
             toast({ title: "Authentication Restart Needed", description: "Please try entering your phone number again.", variant: "destructive" });
             handleReset(false);
        } else if (error.message?.includes("Invalid hash in mt_dh_gen_ok")) {
             handleApiError(error, "Connection Handshake Failed", "Could not establish a secure connection.");
        } else {
            handleApiError(error, "Error Sending Code", `Could not send verification code. ${error.message}`);
        }
    } finally {
      setIsConnecting(false);
    }
  };

  const handleSignIn = async (currentPhoneCode: string) => {
    if (!currentPhoneCode) {
      setAuthError("Verification code is required.");
      toast({ title: "Verification Code Required", description: "Please enter the code sent to you.", variant: "destructive" });
      return;
    }
    setIsConnecting(true);
    setAuthError(null);
    setPhoneCode(currentPhoneCode); // Store for potential display/retry, though typically not needed after submission
    toast({ title: "Verifying Code...", description: "Checking your verification code with Telegram." });
    try {
      const result = await telegramService.signIn(phoneNumber, currentPhoneCode); // Use phoneNumber stored in state
      if (result.user) {
        setIsConnected(true);
        setAuthStep('initial'); // Reset auth flow
        setPhoneCode(''); // Clear code
        setPassword('');   // Clear password field too
        toast({ title: "Sign In Successful!", description: "Connected to Telegram." });
        fetchDialogFilters(); // Fetch folders after successful sign-in
      } else {
        // This case should ideally not happen if signIn throws errors for failures
        setAuthError("Sign in failed. Unexpected response from server.");
        toast({ title: "Sign In Failed", description: "Unexpected response from server.", variant: "destructive" });
      }
    } catch (error: any) {
      if (error.message === '2FA_REQUIRED' && (error as any).srp_id) {
        // This error is thrown by signIn service function if 2FA is needed
        setAuthStep('awaiting_password');
        setAuthError(null); // Clear previous errors
        toast({ title: "2FA Required", description: "Please enter your two-factor authentication password." });
      } else {
        handleApiError(error, "Sign In Failed", `Could not sign in. ${error.message}`);
      }
    } finally {
      setIsConnecting(false);
    }
  };

  const handleCheckPassword = async (currentPassword: string) => {
    if (!currentPassword) {
      setAuthError("Password is required.");
      toast({ title: "Password Required", description: "Please enter your 2FA password.", variant: "destructive" });
      return;
    }
    setIsConnecting(true);
    setAuthError(null);
    setPassword(currentPassword); // Store for potential display/retry
    toast({ title: "Verifying Password...", description: "Checking your 2FA password." });
    try {
      const user = await telegramService.checkPassword(currentPassword);
      if (user) {
        setIsConnected(true);
        setAuthStep('initial'); // Reset auth flow
        setPhoneCode('');   // Clear code field
        setPassword('');   // Clear password
        toast({ title: "2FA Successful!", description: "Connected to Telegram." });
        fetchDialogFilters(); // Fetch folders after successful 2FA
      } else {
        setAuthError("2FA failed. Unexpected response from server.");
        toast({ title: "2FA Failed", description: "Unexpected response from server.", variant: "destructive" });
      }
    } catch (error: any) {
      handleApiError(error, "2FA Failed", `Could not verify password. ${error.message}`);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleOpenFileDetails = useCallback((file: CloudFile) => {
    setSelectedFileForDetails(file);
    setIsDetailsPanelOpen(true);
  }, []);

  const handleCloseFileDetails = () => {
    setIsDetailsPanelOpen(false);
    setSelectedFileForDetails(null); // Clear selection on close
  };

  const handleQueueDownload = useCallback(async (file: CloudFile) => {
    // Check if item is already in queue and in a non-final state
    const existingItem = downloadQueueRef.current.find(item => item.id === file.id);
    if (existingItem && ['downloading', 'queued', 'paused', 'refreshing_reference'].includes(existingItem.status)) {
      toast({ title: "Already in Queue", description: `${file.name} is already being processed or queued.` });
      setIsDownloadManagerOpen(true);
      return;
    }
    if (existingItem && existingItem.status === 'completed') {
        toast({ title: "Already Downloaded", description: `${file.name} has already been downloaded. If you want to download again, clear it from the list or retry.`});
        setIsDownloadManagerOpen(true);
        return;
    }

    // If retrying a failed/cancelled download, remove the old entry first
    if (existingItem && ['failed', 'cancelled'].includes(existingItem.status)) {
        browserDownloadTriggeredRef.current.delete(file.id); // Clear browser download trigger flag for this file
        setDownloadQueue(prevQ => prevQ.filter(q => q.id !== file.id));
        // Wait a tick for state to update before re-adding
        await new Promise(resolve => setTimeout(resolve, 50));
    }

    toast({ title: "Preparing Download...", description: `Getting details for ${file.name}.` });
    const downloadInfo = await telegramService.prepareFileDownloadInfo(file);

    if (downloadInfo && downloadInfo.location && downloadInfo.totalSize > 0 && file.totalSizeInBytes) {
      const controller = new AbortController();
      const newItem: DownloadQueueItemType = {
        ...file, // Spread all properties from CloudFile
        status: 'downloading', // Start download immediately
        progress: 0,
        downloadedBytes: 0,
        currentOffset: 0,
        chunks: [],
        location: downloadInfo.location, // From prepareFileDownloadInfo
        totalSizeInBytes: file.totalSizeInBytes, // Ensure this is populated from CloudFile
        abortController: controller,
        // CDN fields will be populated if a CDN redirect occurs
        cdnDcId: undefined,
        cdnFileToken: undefined,
        cdnEncryptionKey: undefined,
        cdnEncryptionIv: undefined,
        cdnFileHashes: undefined,
        cdnCurrentFileHashIndex: undefined,
        error_message: undefined,
      };
      setDownloadQueue(prevQueue => {
        // Ensure no duplicates if re-adding after a failure/cancellation
        const filteredQueue = prevQueue.filter(item => item.id !== file.id);
        return [...filteredQueue, newItem];
      });
      setIsDownloadManagerOpen(true); // Open manager when new download starts
      toast({ title: "Download Started", description: `${file.name} added to queue and started.` });
    } else {
      toast({ title: "Download Failed", description: `Could not prepare ${file.name} for download. File info missing or invalid. Size: ${file.totalSizeInBytes}, downloadInfo: ${JSON.stringify(downloadInfo)}`, variant: "destructive" });
    }
  }, [toast]); // downloadQueueRef is used, but not a state dependency here


  const handleCancelDownload = useCallback((itemId: string) => {
    setDownloadQueue(prevQueue =>
      prevQueue.map(item => {
        if (item.id === itemId && item.abortController && !item.abortController.signal.aborted) {
          item.abortController.abort("User cancelled download");
          // The useEffect managing downloads will see the aborted signal and update status
          return { ...item, status: 'cancelled', progress: 0, downloadedBytes: 0, error_message: "Cancelled by user." }; // Tentative status
        }
        return item;
      })
    );
    toast({ title: "Download Cancelled", description: `Download for item has been cancelled.`});
  }, [toast]);


  const handlePauseDownload = useCallback((itemId: string) => {
    setDownloadQueue(prevQueue =>
        prevQueue.map(item =>
            item.id === itemId && item.status === 'downloading' ?
            {...item, status: 'paused'} : item
        )
    );
    toast({ title: "Download Paused", description: `Download for item has been paused.`});
  }, [toast]);

  const handleResumeDownload = useCallback((itemId: string) => {
    const itemToResume = downloadQueueRef.current.find(item => item.id === itemId);

    if (itemToResume && (itemToResume.status === 'failed' || itemToResume.status === 'cancelled')) {
        // For failed/cancelled, we re-queue it.
        // This involves removing it and then calling handleQueueDownload again.
        // browserDownloadTriggeredRef is handled within handleQueueDownload for retries.
        
        // Create a plain CloudFile object from the DownloadQueueItemType
        const originalFileProps: CloudFile = {
            id: itemToResume.id,
            name: itemToResume.name,
            type: itemToResume.type,
            size: itemToResume.size,
            timestamp: itemToResume.timestamp,
            url: itemToResume.url, // May be undefined
            dataAiHint: itemToResume.dataAiHint,
            messageId: itemToResume.messageId,
            telegramMessage: itemToResume.telegramMessage,
            totalSizeInBytes: itemToResume.totalSizeInBytes,
            inputPeer: itemToResume.inputPeer,
        };
        // Remove the old item first to ensure it's re-processed fresh by handleQueueDownload
        setDownloadQueue(prevQ => prevQ.filter(q => q.id !== itemId));
        // Give a tick for state update before re-queueing
        setTimeout(() => {
            handleQueueDownload(originalFileProps); // This re-adds and starts download
        }, 50);
        return;
    }

    // For paused items, just change status back to downloading
    setDownloadQueue(prevQueue =>
        prevQueue.map(item =>
            item.id === itemId && item.status === 'paused' ?
            {...item, status: 'downloading'} : item
        )
    );
    toast({ title: "Download Resumed", description: `Download for item has been resumed.`});
  }, [handleQueueDownload, toast]); // downloadQueueRef is used but not a state dependency here


  const handleViewImage = useCallback((file: CloudFile) => {
    if (file.type === 'image' && file.url) { // TODO: Later, handle generation of blob URL if no direct url
      setViewingImageUrl(file.url);
      setViewingImageName(file.name);
      setIsImageViewerOpen(true);
    } else if (file.type === 'image' && !file.url) {
      // Placeholder for future: attempt to download and create blob URL for viewing
      toast({ title: "Preview Not Available", description: "Image URL not available for preview. Try downloading first.", variant: "default"});
    } else if (file.type !== 'image') {
      toast({ title: "Not an Image", description: "This file is not an image and cannot be viewed here.", variant: "default"});
    }
  }, [toast]);

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

        // Use the same robust limit calculation as in the main download useEffect
        const bytesNeededForVideo = totalSize - downloadedBytes;
        const offsetWithinCurrentMBBlockVideo = currentOffset % ONE_MB;
        const bytesLeftInCurrentMBBlockVideo = ONE_MB - offsetWithinCurrentMBBlockVideo;

        let idealBytesToRequestVideo = Math.min(bytesLeftInCurrentMBBlockVideo, DOWNLOAD_CHUNK_SIZE, bytesNeededForVideo);
        let limitForApiCallVideo: number;


        if (bytesNeededForVideo <= 0) {
            limitForApiCallVideo = 0;
        } else if (idealBytesToRequestVideo <= 0) {
             // This state should be rare if offset management is correct. If hit, and bytes are needed, request 1KB.
             limitForApiCallVideo = bytesNeededForVideo > 0 ? KB_1 : 0;
        } else if (idealBytesToRequestVideo < KB_1) {
            // If ideal is < 1KB (e.g. end of 1MB block), request 1KB. Server returns what's available.
            limitForApiCallVideo = KB_1;
        } else {
            // Round down to nearest 1KB multiple.
            limitForApiCallVideo = Math.floor(idealBytesToRequestVideo / KB_1) * KB_1;
        }
        // Ensure limit is at least 1KB if positive bytes are needed and ideal was positive.
        if (limitForApiCallVideo === 0 && bytesNeededForVideo > 0 && idealBytesToRequestVideo > 0) {
            limitForApiCallVideo = KB_1;
        }


        if (limitForApiCallVideo <= 0) break; // Stop if no more bytes can be requested


        const chunkResponse = await telegramService.downloadFileChunk(downloadInfo.location, currentOffset, limitForApiCallVideo, signal);

        if (signal.aborted) throw new Error("Video preparation aborted during chunk download.");

        if (chunkResponse?.bytes && chunkResponse.bytes.length > 0) {
          chunks.push(chunkResponse.bytes);
          downloadedBytes += chunkResponse.bytes.length;
          currentOffset += chunkResponse.bytes.length;
        } else if (chunkResponse?.errorType) {
          // Handle specific errors like FILE_REFERENCE_EXPIRED if needed for video streaming
          throw new Error(`Failed to download video chunk: ${chunkResponse.errorType}`);
        } else if (chunkResponse?.isCdnRedirect){
            // CDN redirect during video stream prep is complex. For now, fail.
            console.warn("CDN Redirect encountered during video stream prep. This path is not fully handled for video streaming yet. Try regular download.");
            throw new Error("CDN Redirect not fully handled during video stream preparation. Try regular download.");
        } else {
          // If no bytes and no error, assume end or issue
          if (downloadedBytes < totalSize) { // Log if it stopped prematurely
            console.warn(`Video chunk download for ${file.name} returned empty/unexpected bytes before completion. Downloaded: ${downloadedBytes}/${totalSize}. Resp:`, chunkResponse);
          }
          break; // Exit loop
        }
      }

      if (signal.aborted) throw new Error("Video preparation aborted after download loop.");

      const mimeType = file.telegramMessage?.mime_type || 'video/mp4'; // Get MIME type from original message
      const videoBlob = new Blob(chunks, { type: mimeType });
      const objectURL = URL.createObjectURL(videoBlob);

      setVideoStreamUrl(objectURL); // Store the blob URL
      setPlayingVideoUrl(objectURL); // Set it for the player
      toast({ title: "Video Ready", description: `${file.name} is ready for playback.` });

    } catch (error: any) {
      if (error.message?.includes("aborted")) {
        toast({ title: "Video Preparation Cancelled", description: `Preparation for ${file.name} was cancelled.`, variant: "default" });
      } else {
        toast({ title: "Video Preparation Failed", description: `Could not prepare ${file.name}: ${error.message}`, variant: "destructive" });
      }
      setPlayingVideoUrl(null); // Clear URL on error
      setIsVideoPlayerOpen(false); // Close player on error
    }
  }, [toast]); // ONE_MB, DOWNLOAD_CHUNK_SIZE, KB_1 are constants


  const prepareAndPlayVideoStream = useCallback(async (file: CloudFile) => {
    if (isPreparingVideoStream && preparingVideoStreamForFileId === file.id) {
      toast({ title: "Already Preparing", description: `Still preparing ${file.name}. Please wait.`, variant: "default" });
      setIsVideoPlayerOpen(true); // Ensure player is open if prep is ongoing for this file
      return;
    }

    // Abort any previous stream preparation
    if (videoStreamAbortControllerRef.current && !videoStreamAbortControllerRef.current.signal.aborted) {
      videoStreamAbortControllerRef.current.abort("New video stream preparation requested");
    }
    // Revoke old blob URL if it exists
    if (videoStreamUrl) {
      URL.revokeObjectURL(videoStreamUrl);
      setVideoStreamUrl(null);
    }

    setPlayingVideoUrl(null); // Ensure player shows loading state
    setPlayingVideoName(file.name);
    setIsPreparingVideoStream(true);
    setPreparingVideoStreamForFileId(file.id);
    setIsVideoPlayerOpen(true); // Open the player to show loading state

    const newController = new AbortController();
    videoStreamAbortControllerRef.current = newController;

    try {
        await fetchVideoAndCreateStreamUrl(file, newController.signal);
    } catch (error) { // Errors from fetchVideoAndCreateStreamUrl are handled within it (toasts, etc.)
         if (!newController.signal.aborted) { // Log if it's an unexpected error not due to abort
            console.error("Unexpected error during video stream preparation orchestrator:", error);
        }
    } finally {
        // Only reset these if the current controller is the one that finished/aborted
        if (videoStreamAbortControllerRef.current === newController) {
            setIsPreparingVideoStream(false);
            setPreparingVideoStreamForFileId(null);
        }
    }
  }, [isPreparingVideoStream, preparingVideoStreamForFileId, videoStreamUrl, fetchVideoAndCreateStreamUrl, toast]);


  const handlePlayVideo = useCallback((file: CloudFile) => {
     if (file.type === 'video') {
        if (file.url) { // If direct URL is available (e.g., from placeholder or future CDN link)
            setPlayingVideoUrl(file.url);
            setPlayingVideoName(file.name);
            setIsPreparingVideoStream(false); // Not preparing if direct URL
            setPreparingVideoStreamForFileId(null);
            setIsVideoPlayerOpen(true);
        } else if (file.totalSizeInBytes && file.totalSizeInBytes > 0) { // If no direct URL, attempt to fetch and stream
            prepareAndPlayVideoStream(file);
        } else {
            toast({ title: "Playback Not Possible", description: "Video data or size is missing, cannot play.", variant: "default"});
        }
    } else {
      toast({ title: "Not a Video", description: "This file is not a video and cannot be played here.", variant: "default"});
    }
  }, [prepareAndPlayVideoStream, toast]);

  const handleCloseVideoPlayer = useCallback(() => {
    setIsVideoPlayerOpen(false);
    // Abort ongoing preparation if player is closed
    if (isPreparingVideoStream && videoStreamAbortControllerRef.current && !videoStreamAbortControllerRef.current.signal.aborted) {
        videoStreamAbortControllerRef.current.abort("Video player closed during preparation");
    }
    setIsPreparingVideoStream(false); // Reset preparation state
    setPreparingVideoStreamForFileId(null);

    // Clean up Blob URL
    if (videoStreamUrl) {
        URL.revokeObjectURL(videoStreamUrl);
        setVideoStreamUrl(null);
    }
    setPlayingVideoUrl(null); // Clear current playing URL
  }, [isPreparingVideoStream, videoStreamUrl]);

  // Effect for cleaning up Blob URL on component unmount
  useEffect(() => {
    return () => {
        if (videoStreamUrl) {
            URL.revokeObjectURL(videoStreamUrl);
        }
        // Abort any stream preparation if component unmounts
        if (videoStreamAbortControllerRef.current && !videoStreamAbortControllerRef.current.signal.aborted) {
            videoStreamAbortControllerRef.current.abort("Component unmounting");
        }
    };
  }, [videoStreamUrl]);


  const handleOpenDownloadManager = () => setIsDownloadManagerOpen(true);
  const handleCloseDownloadManager = () => setIsDownloadManagerOpen(false);
  const handleOpenChatSelectionDialog = () => setIsChatSelectionDialogOpen(true);

  const handleOpenUploadDialog = () => {
    if (!selectedFolder) {
      toast({ title: "No Chat Selected", description: "Please select a chat first to upload files to.", variant: "default" });
      return;
    }
    setIsUploadDialogOpen(true);
  };
  const handleCloseUploadDialog = () => {
     if (isUploadingFiles) {
      toast({ title: "Upload in Progress", description: "Please wait for uploads to complete or cancel them before closing.", variant: "default" });
      return;
    }
    setIsUploadDialogOpen(false);
    setFilesToUpload([]); // Clear selected files on close
    // Abort any uploads that might have been "stuck" if dialog was closed forcefully (though UI prevents this)
    uploadAbortControllersRef.current.forEach((controller, id) => {
      if (!controller.signal.aborted) {
        console.log(`Aborting upload for ${id} due to dialog close (if not already finished)`);
        controller.abort("Upload dialog closed");
      }
    });
    uploadAbortControllersRef.current.clear();
  };

  const handleFilesSelectedForUpload = (selectedNativeFiles: FileList | null) => {
    if (selectedNativeFiles) {
      const newExtendedFiles: ExtendedFile[] = Array.from(selectedNativeFiles).map((file, index) => ({
        id: `${file.name}-${file.lastModified}-${Date.now()}-${index}`, // Unique ID
        originalFile: file,
        name: file.name,
        size: file.size,
        type: file.type,
        lastModified: file.lastModified,
        uploadProgress: 0,
        uploadStatus: 'pending',
      }));
      setFilesToUpload(prevFiles => [...prevFiles, ...newExtendedFiles]);
      if(newExtendedFiles.length > 0) {
        toast({ title: "Files Ready", description: `${newExtendedFiles.length} file(s) added to upload list.`});
      }
    }
  };

const handleStartUpload = async () => {
  const filesToAttemptUpload = filesToUpload.filter(f => f.uploadStatus === 'pending' || f.uploadStatus === 'failed' || f.uploadStatus === 'cancelled');
  
  if (filesToAttemptUpload.length === 0) {
    toast({ title: "No New Files", description: "No new files or files marked for retry to upload.", variant: "default" });
    return;
  }
  if (!selectedFolder || !selectedFolder.inputPeer) {
    toast({ title: "Upload Target Missing", description: "No target chat selected or inputPeer is missing.", variant: "destructive" });
    return;
  }

  setIsUploadingFiles(true);

  for (const fileToUpload of filesToAttemptUpload) {
    // Skip if already completed or actively uploading/processing by another call (though filter should prevent this)
    if (fileToUpload.uploadStatus === 'completed' || fileToUpload.uploadStatus === 'uploading' || fileToUpload.uploadStatus === 'processing') {
        continue;
    }

    const controller = new AbortController();
    uploadAbortControllersRef.current.set(fileToUpload.id, controller);

    const updateUiForFile = (progress: number, status: ExtendedFile['uploadStatus']) => {
      setFilesToUpload(prev =>
        prev.map(f =>
          f.id === fileToUpload.id
            ? { ...f, uploadProgress: progress, uploadStatus: status }
            : f
        )
      );
    };

    updateUiForFile(0, 'uploading'); // Set initial status to uploading

    try {
      console.log(`Starting upload for: ${fileToUpload.name}. Big file: ${fileToUpload.originalFile.size > 10 * 1024 * 1024}`);
      await telegramService.uploadFile(
        selectedFolder.inputPeer,
        fileToUpload.originalFile, // Pass the original File object
        (percent) => {
          // This progress is for chunk uploads. messages.sendMedia is separate.
          // When percent is 100 from uploadFile, it means chunks are done, now processing sendMedia.
          updateUiForFile(percent, percent === 100 ? 'processing' : 'uploading');
        },
        controller.signal
      );
      // If uploadFile resolves, it means messages.sendMedia was successful
      updateUiForFile(100, 'completed');
      toast({ title: "Upload Successful!", description: `${fileToUpload.name} uploaded to ${selectedFolder.name}.` });
      
      // Refresh media list for the current folder if it's the one we uploaded to
      if (selectedFolder && selectedFolder.id === selectedFolder?.id) { // Check if selectedFolder still matches
         fetchInitialChatMedia(selectedFolder); 
      }
    } catch (error: any) {
      if (controller.signal.aborted || error.name === 'AbortError' || error.message?.includes('aborted')) {
        updateUiForFile(fileToUpload.uploadProgress || 0, 'cancelled');
        toast({ title: "Upload Cancelled", description: `${fileToUpload.name} upload was cancelled.`, variant: "default" });
      } else {
        updateUiForFile(fileToUpload.uploadProgress || 0, 'failed');
        toast({ title: "Upload Failed", description: `Could not upload ${fileToUpload.name}: ${error.message}`, variant: "destructive" });
      }
      console.error(`Error uploading ${fileToUpload.name} (ID: ${fileToUpload.id}):`, error);
    } finally {
      uploadAbortControllersRef.current.delete(fileToUpload.id); // Remove controller once done (success, fail, cancel)
    }
  }
  setIsUploadingFiles(false); // Reset overall uploading state when all attempts are done
};

  const handleSelectDialogFilter = (filterId: number) => {
    setActiveDialogFilterId(filterId);
    // fetchInitialChats will be triggered by the useEffect watching activeDialogFilterId
  };


  if (!isConnected) {
    return (
      <>
        <Header ref={headerRef} isConnected={false} />
        <main className="flex-grow container mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col items-center justify-center">
          <TelegramConnect
            authStep={authStep}
            onSendCode={handleSendCode}
            onSignIn={handleSignIn}
            onCheckPassword={handleCheckPassword}
            isLoading={isConnecting}
            error={authError}
            phoneNumber={phoneNumber}
            setPhoneNumber={setPhoneNumber} // Pass down for display if needed
            phoneCode={phoneCode}
            setPhoneCode={setPhoneCode}
            password={password}
            setPassword={setPassword}
            onReset={() => handleReset(authStep !== 'initial')} // Pass handleReset
          />
        </main>
        <footer ref={footerRef} className="py-4 px-4 sm:px-6 lg:px-8 text-center border-t">
          <p className="text-sm text-muted-foreground">
            Telegram Cloudifier &copy; {new Date().getFullYear()}
          </p>
        </footer>
      </>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header
        ref={headerRef}
        isConnected={isConnected}
        onDisconnect={() => handleReset(true)} // Pass handleReset
        onOpenDownloadManager={handleOpenDownloadManager}
        onOpenChatSelectionDialog={handleOpenChatSelectionDialog}
      />
      <FolderTabsBar
        filters={dialogFilters}
        activeFilterId={activeDialogFilterId}
        onSelectFilter={handleSelectDialogFilter}
        isLoading={isLoadingDialogFilters}
      />
      <div className="flex-1 flex overflow-hidden min-h-0">
        <main className="flex-1 overflow-y-auto bg-background">
           <div className="container mx-auto h-full px-4 sm:px-6 lg:px-8 py-4 md:py-6 lg:py-8">
            {selectedFolder ? (
                <MainContentView
                folderName={selectedFolder.name}
                files={currentChatMedia}
                isLoading={isLoadingChatMedia && currentChatMedia.length === 0}
                hasMore={hasMoreChatMedia}
                lastItemRef={lastMediaItemRef}
                onFileDetailsClick={handleOpenFileDetails}
                onQueueDownloadClick={handleQueueDownload}
                onFileViewImageClick={handleViewImage}
                onFilePlayVideoClick={handlePlayVideo}
                onOpenUploadDialog={handleOpenUploadDialog}
                isPreparingStream={isPreparingVideoStream}
                preparingStreamForFileId={preparingVideoStreamForFileId}
                />
            ) : (
                <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
                  <LayoutPanelLeft className="w-16 h-16 mb-4 opacity-50" />
                  <p className="text-lg mb-2">No chat selected.</p>
                  <Button onClick={handleOpenChatSelectionDialog}>
                    <MessageSquare className="mr-2 h-5 w-5" /> Select a Chat
                  </Button>
                  {isProcessingChats && allChats.length === 0 && ( // Show loading for initial chats if no folder selected yet
                    <div className="mt-4 flex items-center">
                      <Loader2 className="animate-spin h-5 w-5 text-primary mr-2" />
                      <span>Loading initial chat list for current folder...</span>
                    </div>
                  )}
                   { !isProcessingChats && allChats.length === 0 && !authError && isConnected && (
                     <div className="mt-4 flex items-center text-sm">
                        <MessageSquare className="mr-2 h-5 w-5 text-muted-foreground" />
                        <span>Your chat list for the current folder appears to be empty or still loading. Click "Select a Chat".</span>
                    </div>
                    )}
                </div>
            )}
          </div>
        </main>
      </div>
      <footer ref={footerRef} className="py-3 px-4 sm:px-6 lg:px-8 text-center border-t text-xs">
        <p className="text-muted-foreground">
          Telegram Cloudifier &copy; {new Date().getFullYear()}
        </p>
      </footer>

      <ChatSelectionDialog
        isOpen={isChatSelectionDialogOpen}
        onOpenChange={setIsChatSelectionDialogOpen}
        folders={allChats} // Pass the current list of chats (which depends on activeDialogFilterId)
        selectedFolderId={selectedFolder?.id || null}
        onSelectFolder={handleSelectFolder}
        lastItemRef={lastChatElementRef} // For infinite scroll within the dialog
        isLoading={isProcessingChats && allChats.length === 0} // Loading for initial batch of chats for current filter
        isLoadingMore={isLoadingMoreChats} // Loading for subsequent batches
        hasMore={hasMoreChats}
        onLoadMore={loadMoreChatsCallback} // Function to load more chats for current filter
        onRefresh={fetchInitialChats} // Function to refresh chats for current filter
      />

      <FileDetailsPanel
        file={selectedFileForDetails}
        isOpen={isDetailsPanelOpen}
        onClose={handleCloseFileDetails}
        onQueueDownload={handleQueueDownload} // Pass download handler
      />
      <ImageViewer
        isOpen={isImageViewerOpen}
        onClose={() => setIsImageViewerOpen(false)}
        imageUrl={viewingImageUrl}
        imageName={viewingImageName}
      />
      <VideoPlayer
        isOpen={isVideoPlayerOpen}
        onClose={handleCloseVideoPlayer} // Use the specific close handler
        videoUrl={playingVideoUrl}
        videoName={playingVideoName}
        isLoading={isPreparingVideoStream && playingVideoUrl === null} // Loading state for video prep
      />
      <DownloadManagerDialog
        isOpen={isDownloadManagerOpen}
        onClose={handleCloseDownloadManager}
        queue={downloadQueue}
        onCancel={handleCancelDownload}
        onPause={handlePauseDownload}
        onResume={handleResumeDownload}
      />
      <UploadDialog
        isOpen={isUploadDialogOpen}
        onClose={handleCloseUploadDialog}
        onFilesSelected={handleFilesSelectedForUpload}
        onUpload={handleStartUpload}
        selectedFiles={filesToUpload}
        isLoading={isUploadingFiles} // Pass overall uploading state
      />
    </div>
  );
}
