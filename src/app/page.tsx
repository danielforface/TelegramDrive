
"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { Header } from "@/components/layout/header";
import { TelegramConnect } from "@/components/telegram-connect";
import { MainContentView } from "@/components/main-content-view/main-content-view";
import { FileDetailsPanel } from "@/components/file-details-panel";
import { ImageViewer } from "@/components/image-viewer";
import { VideoPlayer } from "@/components/video-player";
import { DownloadManagerDialog } from "@/components/download-manager-dialog";
import { ChatSelectionDialog } from "@/components/chat-selection-dialog";
import { UploadDialog } from "@/components/upload-dialog";
import type { CloudFolder, CloudFile, DownloadQueueItemType, ExtendedFile, DialogFilter } from "@/types";
import { Button } from "@/components/ui/button";
import { RefreshCw, Loader2, LayoutPanelLeft, MessageSquare, UploadCloud } from "lucide-react"; 
import { useToast } from "@/hooks/use-toast";
import * as telegramService from "@/services/telegramService";

const INITIAL_CHATS_LOAD_LIMIT = 20;
const SUBSEQUENT_CHATS_LOAD_LIMIT = 10;
const INITIAL_MEDIA_LOAD_LIMIT = 20;
const SUBSEQUENT_MEDIA_LOAD_LIMIT = 20;
const DOWNLOAD_CHUNK_SIZE = 512 * 1024; 
const KB_1 = 1024;
const ONE_MB = 1024 * 1024;
const ALL_CHATS_FILTER_ID = 0; 

type AuthStep = 'initial' | 'awaiting_code' | 'awaiting_password';

export default function Home() {
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);

  const [dialogFilters, setDialogFilters] = useState<DialogFilter[]>([]);
  const [activeDialogFilterId, setActiveDialogFilterId] = useState<number>(ALL_CHATS_FILTER_ID);
  const [isLoadingDialogFilters, setIsLoadingDialogFilters] = useState(true);
  const [isReorderingFolders, setIsReorderingFolders] = useState(false);

  const isProcessingChatsRef = useRef(false); 
  const [isProcessingChats, setIsProcessingChatsState] = useState(false); 
  const setIsProcessingChats = (val: boolean) => { // Helper to also update ref
    isProcessingChatsRef.current = val;
    setIsProcessingChatsState(val);
  };


  const [allChats, setAllChats] = useState<CloudFolder[]>([]); 
  const [isLoadingMoreChats, setIsLoadingMoreChats] = useState(false);
  const isLoadingMoreChatsRequestInFlightRef = useRef(false); 
  const [hasMoreChats, setHasMoreChats] = useState(true);
  const [chatsOffsetDate, setChatsOffsetDate] = useState(0);
  const [chatsOffsetId, setChatsOffsetId] = useState(0);
  const [chatsOffsetPeer, setChatsOffsetPeer] = useState<any>({ _: 'inputPeerEmpty' });

  const [selectedFolder, setSelectedFolder] = useState<CloudFolder | null>(null); 
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
    console.error(`${title} (handleApiError):`, error.message, error.originalErrorObject || error);
    let description = error.message || defaultMessage;

    if (error.message && error.message.includes("Invalid hash in mt_dh_gen_ok")) {
      description = "Connection handshake failed. Please check your API ID/Hash in .env.local, ensure it's correct, restart the server, and try clearing your browser's localStorage for this site.";
      setAuthError(description); 
      toast({ title: "Connection Handshake Failed", description, variant: "destructive", duration: 10000 });
    } else if (error.message === 'AUTH_RESTART') {
        description = "Authentication process needs to be restarted. Please try entering your phone number again.";
        setAuthError(description);
        toast({ title: "Authentication Restart Needed", description, variant: "destructive" });
        handleReset(false); 
    } else {
        setAuthError(description); 
        toast({ title, description, variant: "destructive", duration: 5000 });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast]); // handleReset is not included to prevent potential loops if handleReset itself causes an API error

  const fetchDialogFilters = useCallback(async () => {
    setIsLoadingDialogFilters(true);
    try {
      const filtersFromServer = await telegramService.getDialogFilters();
      console.log("Filters received in page.tsx from service:", filtersFromServer); 

      const processedFilters: DialogFilter[] = [];
      let allChatsFilterExists = false;

      if (filtersFromServer && filtersFromServer.length > 0) {
          filtersFromServer.forEach(filter => {
            if (filter._ === 'dialogFilterDefault') {
              processedFilters.push({ 
                ...filter, 
                id: ALL_CHATS_FILTER_ID, 
                title: "All Chats", 
                pinned_peers: [], // Ensure these exist for type consistency
                include_peers: [],
                exclude_peers: []
              });
              allChatsFilterExists = true;
            } else if (filter._ === 'dialogFilter' || filter._ === 'dialogFilterChatlist') {
              processedFilters.push({
                ...filter, // Spread all original properties
                pinned_peers: filter.pinned_peers || [],
                include_peers: filter.include_peers || [], 
                exclude_peers: filter.exclude_peers || [],
              });
            }
          });
      }
      
      if (!allChatsFilterExists) {
         const alreadyAdded = processedFilters.some(f => f.id === ALL_CHATS_FILTER_ID);
         if (!alreadyAdded) {
            console.log("fetchDialogFilters: No 'dialogFilterDefault' from server or list was empty, ensuring 'All Chats' is present.");
            processedFilters.unshift({ _:'dialogFilterDefault', id: ALL_CHATS_FILTER_ID, title: "All Chats", flags:0, pinned_peers: [], include_peers: [], exclude_peers: [] });
         }
      }
      
      processedFilters.sort((a, b) => {
        if (a.id === ALL_CHATS_FILTER_ID) return -1;
        if (b.id === ALL_CHATS_FILTER_ID) return 1;
        return 0; 
      });

      setDialogFilters(processedFilters);
      if (!processedFilters.some(f => f.id === activeDialogFilterId)) { // check if current active is still valid
         setActiveDialogFilterId(ALL_CHATS_FILTER_ID);
      }

    } catch (error: any) {
      handleApiError(error, "Error Fetching Folders", "Could not load your chat folders.");
      const defaultFilters: DialogFilter[] = [{ _:'dialogFilterDefault', id: ALL_CHATS_FILTER_ID, title: "All Chats", flags:0, pinned_peers: [], include_peers: [], exclude_peers: [] }];
      setDialogFilters(defaultFilters);
      setActiveDialogFilterId(ALL_CHATS_FILTER_ID);
    } finally {
      console.log("fetchDialogFilters: Setting isLoadingDialogFilters to false.");
      setIsLoadingDialogFilters(false);
    }
  }, [handleApiError, activeDialogFilterId]); 


  const fetchInitialChats = useCallback(async () => {
    if (isProcessingChatsRef.current || !isConnected) {
        console.log("fetchInitialChats: Skipped due to processing, not connected, or invalid activeDialogFilterId.", {
          isProcessing: isProcessingChatsRef.current,
          connected: isConnected,
          activeFilter: activeDialogFilterId,
        });
        return;
    }
    if (activeDialogFilterId === undefined || activeDialogFilterId === null) {
        console.warn("fetchInitialChats: activeDialogFilterId is undefined or null, cannot fetch chats.");
        setIsProcessingChats(false);
        return;
    }

    setIsProcessingChats(true); 

    setAllChats([]);
    setAuthError(null);
    setChatsOffsetDate(0);
    setChatsOffsetId(0);
    setChatsOffsetPeer({ _: 'inputPeerEmpty' });
    setHasMoreChats(true);
    setIsLoadingMoreChats(false); 
    isLoadingMoreChatsRequestInFlightRef.current = false; 

    toast({ title: "Fetching Chats...", description: `Loading conversations for the selected folder.` });

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
      setIsProcessingChats(false);
    }
  }, [isConnected, activeDialogFilterId, handleApiError, toast]); 

  const checkExistingConnection = useCallback(async () => {
    try {
      const previouslyConnected = await telegramService.isUserConnected();
      if (previouslyConnected) {
        const storedUser = telegramService.getUserSessionDetails();
        if (storedUser && storedUser.phone) {
            setPhoneNumber(storedUser.phone); 
        }
        setIsConnected(true);
        setAuthStep('initial'); 
        setAuthError(null);
        await fetchDialogFilters(); 
      } else {
        setIsConnected(false);
        setPhoneNumber('');
        setAuthStep('initial');
        setAuthError(null);
        setAllChats([]); 
        const defaultFilters: DialogFilter[] = [{ _:'dialogFilterDefault', id: ALL_CHATS_FILTER_ID, title: "All Chats", flags:0, pinned_peers: [], include_peers: [], exclude_peers: [] }];
        setDialogFilters(defaultFilters);
        setActiveDialogFilterId(ALL_CHATS_FILTER_ID);
        setIsLoadingDialogFilters(false); 
      }
    } catch (error: any) {
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
          handleApiError(error, "Authentication Expired", "Your session needs to be re-initiated.");
      } else {
         handleApiError(error, "Connection Check Error", `Failed to verify existing connection. ${errorMessage}`);
      }
      setIsConnected(false); 
      const defaultFilters: DialogFilter[] = [{ _:'dialogFilterDefault', id: ALL_CHATS_FILTER_ID, title: "All Chats", flags:0, pinned_peers: [], include_peers: [], exclude_peers: [] }];
      setDialogFilters(defaultFilters);
      setActiveDialogFilterId(ALL_CHATS_FILTER_ID);
      setIsLoadingDialogFilters(false); 
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast, handleApiError, fetchDialogFilters]);  

  const handleReset = useCallback(async (performServerLogout = true) => {
    const currentIsConnected = isConnected; 
    setIsProcessingChats(false); // Reset processing state on full reset

    if (performServerLogout && currentIsConnected) {
        toast({ title: "Disconnecting...", description: "Logging out from Telegram." });
        try {
            await telegramService.signOut();
            toast({ title: "Disconnected", description: "Successfully signed out." });
        } catch (error: any) {
            if(!(error.message && error.message.includes('AUTH_KEY_UNREGISTERED'))){
                 toast({ title: "Disconnection Error", description: error.message || "Could not sign out properly from server.", variant: "destructive" });
            }
        }
    }

    setIsConnected(false);
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
    setIsLoadingMoreChats(false);
    setHasMoreChats(true);
    setChatsOffsetDate(0);
    setChatsOffsetId(0);
    setChatsOffsetPeer({ _: 'inputPeerEmpty' });

    setIsLoadingChatMedia(false);
    setHasMoreChatMedia(true);
    setCurrentMediaOffsetId(0);
    
    const defaultFilters: DialogFilter[] = [{ _:'dialogFilterDefault', id: ALL_CHATS_FILTER_ID, title: "All Chats", flags:0, pinned_peers: [], include_peers: [], exclude_peers: [] }];
    setDialogFilters(defaultFilters);
    setActiveDialogFilterId(ALL_CHATS_FILTER_ID);
    setIsLoadingDialogFilters(true); // Will be set to false after fetch or if connection fails

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
    uploadAbortControllersRef.current.forEach((controller) => {
      if (!controller.signal.aborted) controller.abort("User reset application state");
    });
    uploadAbortControllersRef.current.clear();
    setIsUploadingFiles(false);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected, toast, videoStreamUrl]); 

  useEffect(() => {
    checkExistingConnection();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Runs once on mount

  useEffect(() => {
    if (isConnected && (activeDialogFilterId !== undefined && activeDialogFilterId !== null)) {
      if(selectedFolder) setSelectedFolder(null); 
      if(currentChatMedia.length > 0) setCurrentChatMedia([]);
      fetchInitialChats();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected, activeDialogFilterId]); // fetchInitialChats is memoized with its own deps


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
            
            let actualLimitForApi: number;
            let chunkResponse: telegramService.FileChunkResponse;

            if (upToDateItem.cdnFileToken && upToDateItem.cdnDcId && upToDateItem.cdnFileHashes && upToDateItem.cdnEncryptionKey && upToDateItem.cdnEncryptionIv) {
                const currentHashBlockIndex = upToDateItem.cdnCurrentFileHashIndex || 0;
                if (currentHashBlockIndex >= upToDateItem.cdnFileHashes.length) {
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
                }

            } else { // Direct download path
                const bytesNeededForFileDirect = upToDateItem.totalSizeInBytes - upToDateItem.downloadedBytes;
                const offsetWithinCurrentBlockDirect = upToDateItem.currentOffset % ONE_MB;
                const bytesLeftInCurrentBlockDirect = ONE_MB - offsetWithinCurrentBlockDirect;
                
                let idealRequestSizeDirect = Math.min(bytesLeftInCurrentBlockDirect, DOWNLOAD_CHUNK_SIZE, bytesNeededForFileDirect);

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
                        console.error(`Logic error: actualLimitForApi is ${actualLimitForApi}, but ${bytesNeededForFileDirect} bytes still needed for ${upToDateItem.name}. Ideal: ${idealRequestSizeDirect}`);
                        setDownloadQueue(prevQ => prevQ.map(q => q.id === upToDateItem.id ? { ...q, status: 'failed', error_message: 'Internal limit calculation error' } : q));
                   }
                   activeDownloadsRef.current.delete(upToDateItem.id);
                   continue;
                }
                console.log(`Processing direct download for ${upToDateItem.name}, offset: ${upToDateItem.currentOffset}, API limit: ${actualLimitForApi}, dataToRequest: ${idealRequestSizeDirect}, neededForFile: ${bytesNeededForFileDirect}, leftInBlock: ${bytesLeftInCurrentBlockDirect}, totalSize: ${upToDateItem.totalSizeInBytes}`);

                chunkResponse = await telegramService.downloadFileChunk(
                    upToDateItem.location!, 
                    upToDateItem.currentOffset,
                    actualLimitForApi, 
                    upToDateItem.abortController?.signal
                );
            }

            if (upToDateItem.abortController?.signal.aborted) {
              activeDownloadsRef.current.delete(upToDateItem.id);
              if(upToDateItem.status !== 'cancelled') setDownloadQueue(prevQ => prevQ.map(q_item => q_item.id === upToDateItem.id ? { ...q_item, status: 'cancelled', error_message: "Aborted" } : q_item));
              continue;
            }

            if (chunkResponse?.isCdnRedirect && chunkResponse.cdnRedirectData) {
                setDownloadQueue(prevQ => prevQ.map(q_item => q_item.id === upToDateItem.id ? {
                    ...q_item,
                    status: 'downloading', 
                    cdnDcId: chunkResponse.cdnRedirectData!.dc_id,
                    cdnFileToken: chunkResponse.cdnRedirectData!.file_token,
                    cdnEncryptionKey: chunkResponse.cdnRedirectData!.encryption_key,
                    cdnEncryptionIv: chunkResponse.cdnRedirectData!.encryption_iv,
                    cdnFileHashes: chunkResponse.cdnRedirectData!.file_hashes.map(fh_raw => ({
                        offset: Number(fh_raw.offset), 
                        limit: fh_raw.limit,
                        hash: fh_raw.hash, 
                    })),
                    cdnCurrentFileHashIndex: 0, 
                    currentOffset: 0, 
                    downloadedBytes: 0, 
                    progress: 0, 
                    chunks: [], 
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
                      nextCdnProcessingIndex = (q_item.cdnCurrentFileHashIndex || 0) + 1;
                      nextReqOffset = newDownloadedBytes; 
                    } else { 
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
                        chunks: [], 
                        cdnCurrentFileHashIndex: undefined, 
                        currentOffset: q_item.totalSizeInBytes! 
                      };
                    }
                    return {
                      ...q_item,
                      downloadedBytes: newDownloadedBytes,
                      progress: newProgress,
                      currentOffset: nextReqOffset, 
                      chunks: newChunks,
                      cdnCurrentFileHashIndex: q_item.cdnFileToken ? nextCdnProcessingIndex : undefined,
                      status: 'downloading', 
                    };
                  }
                  return q_item;
                })
              );
            } else { 
              const errorMessage = chunkResponse?.errorType || (chunkResponse && Object.keys(chunkResponse).length === 0 ? 'Empty response object from service' : 'Unknown error or no data returned from service');
              console.error(`Failed to download chunk for ${upToDateItem.name} or no data returned. Response:`, chunkResponse, "Error Message:", errorMessage);
              setDownloadQueue(prevQ => prevQ.map(q_item => q_item.id === upToDateItem.id ? { ...q_item, status: 'failed', error_message: `Download error: ${errorMessage}` } : q_item));
            }
          } catch (error: any) {
             if (error.name === 'AbortError' || (error.message && error.message.toLowerCase().includes('aborted'))) {
                if(upToDateItem.status !== 'cancelled' && upToDateItem.status !== 'failed' && upToDateItem.status !== 'completed' ) { 
                    setDownloadQueue(prevQ => prevQ.map(q_item => q_item.id === upToDateItem.id ? { ...q_item, status: 'cancelled', error_message: "Aborted by user or system." } : q_item));
                }
             } else {
                console.error(`Error processing download for ${upToDateItem.name}:`, error);
                setDownloadQueue(prevQ => prevQ.map(q_item => q_item.id === upToDateItem.id ? { ...q_item, status: 'failed', error_message: error.message || 'Processing error during chunk download' } : q_item));
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
                    if (updatedMediaObject._ === 'photo' && updatedMediaObject.id && updatedMediaObject.access_hash && updatedMediaObject.file_reference) {
                        const largestSize = updatedMediaObject.sizes?.find((s: any) => s.type === 'y') || updatedMediaObject.sizes?.sort((a: any, b: any) => (b.w * b.h) - (a.w * a.h))[0];
                        newLocation = {
                            _: 'inputPhotoFileLocation',
                            id: updatedMediaObject.id,
                            access_hash: updatedMediaObject.access_hash,
                            file_reference: updatedMediaObject.file_reference,
                            thumb_size: largestSize?.type || '', 
                        };
                    } else if (updatedMediaObject._ === 'document' && updatedMediaObject.id && updatedMediaObject.access_hash && updatedMediaObject.file_reference) {
                         newLocation = {
                            _: 'inputDocumentFileLocation',
                            id: updatedMediaObject.id,
                            access_hash: updatedMediaObject.access_hash,
                            file_reference: updatedMediaObject.file_reference,
                            thumb_size: '', 
                        };
                    }

                    if (newLocation) {
                        setDownloadQueue(prevQ => prevQ.map(q_item => q_item.id === upToDateItem.id ? {
                            ...q_item,
                            status: 'downloading', 
                            location: newLocation, 
                            telegramMessage: { ...(q_item.telegramMessage || {}), ...updatedMediaObject } 
                        } : q_item));
                    } else {
                         console.error("Failed to construct new location after refreshing reference for", upToDateItem.name, "Updated Media:", updatedMediaObject);
                         setDownloadQueue(prevQ => prevQ.map(q_item => q_item.id === upToDateItem.id ? { ...q_item, status: 'failed', error_message: 'Refresh failed (new location construction error)' } : q_item));
                    }
                } else {
                    console.warn("File reference refresh failed for", upToDateItem.name, "No new reference or media object returned.");
                    setDownloadQueue(prevQ => prevQ.map(q_item => q_item.id === upToDateItem.id ? { ...q_item, status: 'failed', error_message: 'Refresh failed (no new file_reference)' } : q_item));
                }
            } catch (refreshError: any) {
                 console.error(`Error refreshing file reference for ${upToDateItem.name}:`, refreshError);
                setDownloadQueue(prevQ => prevQ.map(q_item => q_item.id === upToDateItem.id ? { ...q_item, status: 'failed', error_message: refreshError.message || 'File reference refresh error' } : q_item));
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

    const intervalId = setInterval(processQueue, 750); 

    return () => {
        clearInterval(intervalId);
        downloadQueueRef.current.forEach(item => {
            if (item.abortController && !item.abortController.signal.aborted &&
                (item.status === 'downloading' || item.status === 'refreshing_reference' || item.status === 'queued' || item.status === 'paused')) {
                item.abortController.abort("Component cleanup or effect re-run");
            }
        });
        activeDownloadsRef.current.clear(); 
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Main download processing effect, runs once

  useEffect(() => {
    if (!isLoadingMoreChats && isConnected) {
      const timer = setTimeout(() => {
        isLoadingMoreChatsRequestInFlightRef.current = false;
      }, 150); 
      return () => clearTimeout(timer);
    }
  }, [isLoadingMoreChats, isConnected]);


  const loadMoreChatsCallback = useCallback(async () => {
    if (
        isLoadingMoreChatsRequestInFlightRef.current || 
        isLoadingMoreChats || 
        isProcessingChatsRef.current || 
        !hasMoreChats || 
        !isConnected 
        ) {
      return;
    }

    isLoadingMoreChatsRequestInFlightRef.current = true; 
    setIsLoadingMoreChats(true); 

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
      setHasMoreChats(false); 
    } finally {
      setIsLoadingMoreChats(false); 
      // isLoadingMoreChatsRequestInFlightRef is reset by the useEffect listening to isLoadingMoreChats
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected, hasMoreChats, chatsOffsetDate, chatsOffsetId, chatsOffsetPeer, activeDialogFilterId, toast, handleApiError]);


  const observerChats = useRef<IntersectionObserver | null>(null);
  const lastChatElementRef = useCallback((node: HTMLLIElement | null) => {
    if (isLoadingMoreChats || isProcessingChatsRef.current || isLoadingMoreChatsRequestInFlightRef.current) {
      return;
    }
    if (observerChats.current) observerChats.current.disconnect(); 

    observerChats.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting &&
          hasMoreChats &&
          !isProcessingChatsRef.current && 
          !isLoadingMoreChats && 
          !isLoadingMoreChatsRequestInFlightRef.current 
        ) {
        loadMoreChatsCallback();
      }
    });
    if (node) observerChats.current.observe(node); 
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasMoreChats, loadMoreChatsCallback]); 


  const fetchInitialChatMedia = useCallback(async (folder: CloudFolder) => {
    if (!folder.inputPeer) {
      toast({ title: "Error", description: "Cannot load media: InputPeer data is missing for this chat.", variant: "destructive" });
      return;
    }
    setIsLoadingChatMedia(true);
    setCurrentChatMedia([]); 
    setHasMoreChatMedia(true); 
    setCurrentMediaOffsetId(0); 
    toast({ title: `Loading Media for ${folder.name}`, description: "Fetching initial media items..." });

    try {
      const response = await telegramService.getChatMediaHistory(folder.inputPeer, INITIAL_MEDIA_LOAD_LIMIT, 0);
      setCurrentChatMedia(response.files);
      setCurrentMediaOffsetId(response.nextOffsetId || 0); 
      setHasMoreChatMedia(response.hasMore);
      if (response.files.length === 0 && !response.hasMore) {
          toast({ title: "No Media Found", description: `No media items in ${folder.name}.`});
      } else if (response.files.length > 0) {
           toast({ title: "Media Loaded", description: `Loaded ${response.files.length} initial media items for ${folder.name}.`});
      }
    } catch (error: any) {
      handleApiError(error, `Error Fetching Media for ${folder.name}`, `Could not load media items. ${error.message}`);
      setHasMoreChatMedia(false); 
    } finally {
      setIsLoadingChatMedia(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
      setHasMoreChatMedia(false); 
    } finally {
      setIsLoadingChatMedia(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasMoreChatMedia, loadMoreChatMediaCallback]); 

  const handleSelectFolder = (folderId: string) => { 
    const folder = allChats.find(f => f.id === folderId);
    if (folder) {
      setSelectedFolder(folder); 
      fetchInitialChatMedia(folder); 
      setIsChatSelectionDialogOpen(false); 
    } else {
      setSelectedFolder(null); 
      setCurrentChatMedia([]);
    }
  };

  const handleSendCode = async (fullPhoneNumberFromConnect: string) => {
    if (!fullPhoneNumberFromConnect || !fullPhoneNumberFromConnect.startsWith('+') || fullPhoneNumberFromConnect.length < 5) { 
      setAuthError("Phone number is required and must be valid (e.g. +1234567890).");
      toast({ title: "Invalid Phone Number", description: "Please select a country and enter a valid number.", variant: "destructive" });
      return;
    }
    setIsConnecting(true);
    setAuthError(null);
    setPhoneNumber(fullPhoneNumberFromConnect); 
    toast({ title: "Sending Code...", description: `Requesting verification code for ${fullPhoneNumberFromConnect}.` });

    try {
      await telegramService.sendCode(fullPhoneNumberFromConnect);
      setAuthStep('awaiting_code'); 
      toast({ title: "Code Sent!", description: "Please check Telegram for your verification code." });
    } catch (error: any) {
        if ((error as Error).message === 'AUTH_RESTART') {
             handleApiError(error, "Authentication Restart Needed", "Please try entering your phone number again.");
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
    setPhoneCode(currentPhoneCode); 
    toast({ title: "Verifying Code...", description: "Checking your verification code with Telegram." });
    try {
      const result = await telegramService.signIn(phoneNumber, currentPhoneCode); 
      if (result.user) {
        setIsConnected(true); 
        setAuthStep('initial'); 
        setPhoneCode('');   
        setPassword('');    
        toast({ title: "Sign In Successful!", description: "Connected to Telegram." });
        await fetchDialogFilters(); 
      } else {
        setAuthError("Sign in failed. Unexpected response from server.");
        toast({ title: "Sign In Failed", description: "Unexpected response from server.", variant: "destructive" });
      }
    } catch (error: any) {
      if (error.message === '2FA_REQUIRED' && (error as any).srp_id) {
        setAuthStep('awaiting_password');
        setAuthError(null); 
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
    setPassword(currentPassword); 
    toast({ title: "Verifying Password...", description: "Checking your 2FA password." });
    try {
      const user = await telegramService.checkPassword(currentPassword);
      if (user) {
        setIsConnected(true);
        setAuthStep('initial'); 
        setPhoneCode('');   
        setPassword('');   
        toast({ title: "2FA Successful!", description: "Connected to Telegram." });
        await fetchDialogFilters(); 
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
    setTimeout(() => setSelectedFileForDetails(null), 300); 
  };

  const handleQueueDownload = useCallback(async (file: CloudFile) => {
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

    if (existingItem && ['failed', 'cancelled'].includes(existingItem.status)) {
        browserDownloadTriggeredRef.current.delete(file.id); 
        setDownloadQueue(prevQ => prevQ.filter(q => q.id !== file.id));
        await new Promise(resolve => setTimeout(resolve, 50)); // Wait for state to update before re-queueing
    }

    toast({ title: "Preparing Download...", description: `Getting details for ${file.name}.` });
    const downloadInfo = await telegramService.prepareFileDownloadInfo(file);

    if (downloadInfo && downloadInfo.location && downloadInfo.totalSize > 0 && file.totalSizeInBytes) {
      const controller = new AbortController(); 
      const newItem: DownloadQueueItemType = {
        ...file, 
        status: 'downloading', 
        progress: 0,
        downloadedBytes: 0,
        currentOffset: 0, 
        chunks: [],
        location: downloadInfo.location, 
        totalSizeInBytes: file.totalSizeInBytes, 
        abortController: controller,
        cdnDcId: undefined,
        cdnFileToken: undefined,
        cdnEncryptionKey: undefined,
        cdnEncryptionIv: undefined,
        cdnFileHashes: undefined,
        cdnCurrentFileHashIndex: undefined,
        error_message: undefined, 
      };
      setDownloadQueue(prevQueue => {
        const filteredQueue = prevQueue.filter(item => item.id !== file.id);
        return [...filteredQueue, newItem];
      });
      setIsDownloadManagerOpen(true); 
      toast({ title: "Download Started", description: `${file.name} added to queue and started.` });
    } else {
      toast({ title: "Download Failed", description: `Could not prepare ${file.name} for download. File info missing or invalid. Size: ${file.totalSizeInBytes}, downloadInfo: ${JSON.stringify(downloadInfo)}`, variant: "destructive" });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast]); 


  const handleCancelDownload = useCallback((itemId: string) => {
    setDownloadQueue(prevQueue =>
      prevQueue.map(item => {
        if (item.id === itemId && item.abortController && !item.abortController.signal.aborted) {
          item.abortController.abort("User cancelled download");
          return { ...item, status: 'cancelled', progress: 0, downloadedBytes: 0, error_message: "Cancelled by user." }; 
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
        browserDownloadTriggeredRef.current.delete(itemId); 
        const originalFileProps: CloudFile = {
            id: itemToResume.id,
            name: itemToResume.name,
            type: itemToResume.type,
            size: itemToResume.size, 
            timestamp: itemToResume.timestamp,
            url: itemToResume.url, 
            dataAiHint: itemToResume.dataAiHint,
            messageId: itemToResume.messageId,
            telegramMessage: itemToResume.telegramMessage, 
            totalSizeInBytes: itemToResume.totalSizeInBytes, 
            inputPeer: itemToResume.inputPeer, 
        };
        setDownloadQueue(prevQ => prevQ.filter(q => q.id !== itemId));
        setTimeout(() => {
            handleQueueDownload(originalFileProps); 
        }, 50);
        toast({ title: "Retrying Download", description: `Retrying download for ${itemToResume.name}.`});
        return;
    }

    setDownloadQueue(prevQueue =>
        prevQueue.map(item =>
            item.id === itemId && item.status === 'paused' ?
            {...item, status: 'downloading', error_message: undefined } : item 
        )
    );
    toast({ title: "Download Resumed", description: `Download for item has been resumed.`});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast]); 


  const handleViewImage = useCallback((file: CloudFile) => {
    if (file.type === 'image' && file.url) { 
      setViewingImageUrl(file.url);
      setViewingImageName(file.name);
      setIsImageViewerOpen(true);
    } else if (file.type === 'image' && !file.url) {
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
        
        const bytesNeededForVideo = totalSize - downloadedBytes;
        const offsetWithinCurrentMBBlockVideo = currentOffset % ONE_MB;
        const bytesLeftInCurrentMBBlockVideo = ONE_MB - offsetWithinCurrentMBBlockVideo;
        let idealBytesToRequestVideo = Math.min(bytesLeftInCurrentMBBlockVideo, DOWNLOAD_CHUNK_SIZE, bytesNeededForVideo);
        let limitForApiCallVideo: number;

        if (bytesNeededForVideo <= 0) {
            limitForApiCallVideo = 0;
        } else if (idealBytesToRequestVideo <= 0) { 
             limitForApiCallVideo = bytesNeededForVideo > 0 ? KB_1 : 0;
        } else if (idealBytesToRequestVideo < KB_1) {
            limitForApiCallVideo = KB_1; 
        } else {
            limitForApiCallVideo = Math.floor(idealBytesToRequestVideo / KB_1) * KB_1; 
        }
        if (limitForApiCallVideo === 0 && bytesNeededForVideo > 0 && idealBytesToRequestVideo > 0) { 
            limitForApiCallVideo = KB_1;
        }

        if (limitForApiCallVideo <= 0) break; 

        const chunkResponse = await telegramService.downloadFileChunk(downloadInfo.location, currentOffset, limitForApiCallVideo, signal);

        if (signal.aborted) throw new Error("Video preparation aborted during chunk download.");

        if (chunkResponse?.bytes && chunkResponse.bytes.length > 0) {
          chunks.push(chunkResponse.bytes);
          downloadedBytes += chunkResponse.bytes.length;
          currentOffset += chunkResponse.bytes.length;
        } else if (chunkResponse?.errorType) {
          console.error("Error during video chunk download:", chunkResponse.errorType);
          throw new Error(`Failed to download video chunk: ${chunkResponse.errorType}`);
        } else if (chunkResponse?.isCdnRedirect){
            console.warn("CDN Redirect encountered during video stream prep. This path is not fully handled for video streaming yet. Try regular download.");
            throw new Error("CDN Redirect not fully handled during video stream preparation. Try regular download.");
        } else {
          if (downloadedBytes < totalSize) { 
            console.warn(`Video chunk download for ${file.name} returned empty/unexpected bytes before completion. Downloaded: ${downloadedBytes}/${totalSize}. Resp:`, chunkResponse);
          }
          break; 
        }
      }

      if (signal.aborted) throw new Error("Video preparation aborted after download loop.");

      const mimeType = file.telegramMessage?.mime_type || 'video/mp4'; 
      const videoBlob = new Blob(chunks, { type: mimeType });
      const objectURL = URL.createObjectURL(videoBlob);

      setVideoStreamUrl(objectURL); 
      setPlayingVideoUrl(objectURL); 
      toast({ title: "Video Ready", description: `${file.name} is ready for playback.` });

    } catch (error: any) {
      if (error.message?.includes("aborted")) {
        toast({ title: "Video Preparation Cancelled", description: `Preparation for ${file.name} was cancelled.`, variant: "default" });
      } else {
        toast({ title: "Video Preparation Failed", description: `Could not prepare ${file.name}: ${error.message}`, variant: "destructive" });
      }
      setPlayingVideoUrl(null); 
      setIsVideoPlayerOpen(false); 
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast]); 

  const prepareAndPlayVideoStream = useCallback(async (file: CloudFile) => {
    if (isPreparingVideoStream && preparingVideoStreamForFileId === file.id) {
      toast({ title: "Already Preparing", description: `Still preparing ${file.name}. Please wait.`, variant: "default" });
      setIsVideoPlayerOpen(true); 
      return;
    }

    if (videoStreamAbortControllerRef.current && !videoStreamAbortControllerRef.current.signal.aborted) {
      videoStreamAbortControllerRef.current.abort("New video stream preparation requested");
    }
    if (videoStreamUrl) {
      URL.revokeObjectURL(videoStreamUrl);
      setVideoStreamUrl(null);
    }

    setPlayingVideoUrl(null); 
    setPlayingVideoName(file.name);
    setIsPreparingVideoStream(true);
    setPreparingVideoStreamForFileId(file.id);
    setIsVideoPlayerOpen(true); 

    const newController = new AbortController();
    videoStreamAbortControllerRef.current = newController;

    try {
        await fetchVideoAndCreateStreamUrl(file, newController.signal);
    } catch (error) { 
         if (!newController.signal.aborted) { 
            console.error("Unexpected error during video stream preparation orchestrator:", error);
        }
    } finally {
        if (videoStreamAbortControllerRef.current === newController) {
            setIsPreparingVideoStream(false);
            setPreparingVideoStreamForFileId(null);
        }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPreparingVideoStream, preparingVideoStreamForFileId, videoStreamUrl, fetchVideoAndCreateStreamUrl, toast]);


  const handlePlayVideo = useCallback((file: CloudFile) => {
     if (file.type === 'video') {
        if (file.url) { 
            setPlayingVideoUrl(file.url);
            setPlayingVideoName(file.name);
            setIsPreparingVideoStream(false); 
            setPreparingVideoStreamForFileId(null);
            setIsVideoPlayerOpen(true);
        } else if (file.totalSizeInBytes && file.totalSizeInBytes > 0) { 
            prepareAndPlayVideoStream(file);
        } else {
            toast({ title: "Playback Not Possible", description: "Video data or size is missing, cannot play.", variant: "default"});
        }
    } else {
      toast({ title: "Not a Video", description: "This file is not a video and cannot be played here.", variant: "default"});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prepareAndPlayVideoStream, toast]);

  const handleCloseVideoPlayer = useCallback(() => {
    setIsVideoPlayerOpen(false);
    if (isPreparingVideoStream && videoStreamAbortControllerRef.current && !videoStreamAbortControllerRef.current.signal.aborted) {
        videoStreamAbortControllerRef.current.abort("Video player closed during preparation");
    }
    setIsPreparingVideoStream(false); 
    setPreparingVideoStreamForFileId(null);

    if (videoStreamUrl) {
        URL.revokeObjectURL(videoStreamUrl);
        setVideoStreamUrl(null);
    }
    setPlayingVideoUrl(null); 
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPreparingVideoStream, videoStreamUrl]);

  useEffect(() => {
    return () => {
        if (videoStreamUrl) {
            URL.revokeObjectURL(videoStreamUrl);
        }
        if (videoStreamAbortControllerRef.current && !videoStreamAbortControllerRef.current.signal.aborted) {
            videoStreamAbortControllerRef.current.abort("Component unmounting");
        }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); 


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
    setFilesToUpload([]); 
    uploadAbortControllersRef.current.forEach((controller, id) => {
      if (!controller.signal.aborted) {
        console.log(`Upload dialog closed, aborting upload for file ID: ${id}`);
        controller.abort("Upload dialog closed by user");
      }
    });
    uploadAbortControllersRef.current.clear();
  };

  const handleFilesSelectedForUpload = (selectedNativeFiles: FileList | null) => {
    if (selectedNativeFiles) {
      const newExtendedFiles: ExtendedFile[] = Array.from(selectedNativeFiles).map((file, index) => ({
        id: `${file.name}-${file.lastModified}-${Date.now()}-${index}`, 
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
    if (fileToUpload.uploadStatus === 'completed' || fileToUpload.uploadStatus === 'uploading' || fileToUpload.uploadStatus === 'processing') {
        console.log(`Skipping upload for ${fileToUpload.name}, status: ${fileToUpload.uploadStatus}`);
        continue;
    }

    const controller = new AbortController();
    uploadAbortControllersRef.current.set(fileToUpload.id, controller);

    const updateUiForFile = (fileId: string, progress: number, status: ExtendedFile['uploadStatus']) => {
      setFilesToUpload(prev =>
        prev.map(f =>
          f.id === fileId
            ? { ...f, uploadProgress: progress, uploadStatus: status }
            : f
        )
      );
    };

    updateUiForFile(fileToUpload.id, 0, 'uploading'); 

    try {
      toast({ title: `Starting Upload: ${fileToUpload.name}`, description: `Size: ${telegramService.formatFileSize(fileToUpload.size)}` });
      await telegramService.uploadFile(
        selectedFolder.inputPeer,
        fileToUpload.originalFile, 
        (percent) => { 
          const currentStatus = percent === 100 ? 'processing' : 'uploading';
          updateUiForFile(fileToUpload.id, percent, currentStatus);
        },
        controller.signal 
      );
      updateUiForFile(fileToUpload.id, 100, 'completed');
      toast({ title: "Upload Successful!", description: `${fileToUpload.name} uploaded to ${selectedFolder.name}.` });
      
      if (selectedFolder && selectedFolder.id === selectedFolder?.id) { 
         fetchInitialChatMedia(selectedFolder); 
      }
    } catch (error: any) {
      if (controller.signal.aborted || error.name === 'AbortError' || error.message?.includes('aborted')) {
        updateUiForFile(fileToUpload.id, fileToUpload.uploadProgress || 0, 'cancelled');
        toast({ title: "Upload Cancelled", description: `${fileToUpload.name} upload was cancelled.`, variant: "default" });
      } else {
        updateUiForFile(fileToUpload.id, fileToUpload.uploadProgress || 0, 'failed');
        toast({ title: "Upload Failed", description: `Could not upload ${fileToUpload.name}: ${error.message}`, variant: "destructive" });
        console.error(`Upload failed for ${fileToUpload.name}:`, error);
      }
    } finally {
      uploadAbortControllersRef.current.delete(fileToUpload.id); 
    }
  }
  setIsUploadingFiles(false); 
};

  const handleSelectDialogFilter = (filterId: number) => {
    console.log("Selected DialogFilter ID in page.tsx:", filterId);
    if (activeDialogFilterId === filterId && !isReorderingFolders) return; 
    setActiveDialogFilterId(filterId);
  };

  const handleToggleReorderFolders = async () => {
    if (isReorderingFolders) {
      const newOrder = dialogFilters
        .filter(f => f.id !== ALL_CHATS_FILTER_ID) 
        .map(f => f.id); 
      
      console.log("Attempting to save new folder order:", newOrder);
      try {
        await telegramService.updateDialogFiltersOrder(newOrder);
        toast({ title: "Folder Order Saved", description: "The new folder order has been saved to Telegram." });
      } catch (error: any) {
        handleApiError(error, "Error Saving Order", "Could not save the folder order.");
        fetchDialogFilters(); 
      }
    }
    setIsReorderingFolders(prev => !prev);
  };

  const handleMoveFilter = (dragIndex: number, hoverIndex: number) => {
    const draggedFilter = dialogFilters[dragIndex];
    if (draggedFilter.id === ALL_CHATS_FILTER_ID || (dialogFilters[hoverIndex] && dialogFilters[hoverIndex].id === ALL_CHATS_FILTER_ID && hoverIndex === 0)) {
        return; 
    }

    setDialogFilters(prevFilters => {
      const updatedFilters = [...prevFilters];
      const [movedItem] = updatedFilters.splice(dragIndex, 1); 
      updatedFilters.splice(hoverIndex, 0, movedItem); 
      return updatedFilters;
    });
  };
  
  const handleShareFilter = async (filterId: number) => {
    if (filterId === ALL_CHATS_FILTER_ID) {
      toast({ title: "Cannot Share", description: "The 'All Chats' view cannot be shared." });
      return;
    }
    
    setDialogFilters(prev => prev.map(f => f.id === filterId ? { ...f, isLoading: true, inviteLink: undefined } : f));
    try {
      const result = await telegramService.exportChatlistInvite(filterId);
      if (result && result.link) {
        setDialogFilters(prev => prev.map(f => f.id === filterId ? { ...f, isLoading: false, inviteLink: result.link } : f));
        toast({
          title: "Folder Invite Link Created",
          description: `Link: ${result.link} (Copied to console)`,
        });
        console.log(`Invite link for folder ID ${filterId}: ${result.link}`);
      } else {
        throw new Error("No link returned from server.");
      }
    } catch (error: any) {
      handleApiError(error, "Error Sharing Folder", "Could not create an invite link for this folder.");
      setDialogFilters(prev => prev.map(f => f.id === filterId ? { ...f, isLoading: false } : f)); 
    }
  };

  const handleAddFilterPlaceholder = () => {
    toast({ title: "Add New Folder", description: "This feature (adding a new folder) is not yet implemented." });
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
            setPhoneNumber={setPhoneNumber} 
            phoneCode={phoneCode}
            setPhoneCode={setPhoneCode}
            password={password}
            setPassword={setPassword}
            onReset={() => handleReset(authStep !== 'initial')} 
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
        onDisconnect={() => handleReset(true)} 
        onOpenDownloadManager={handleOpenDownloadManager}
        onOpenChatSelectionDialog={handleOpenChatSelectionDialog}
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
                  <p className="text-sm mb-4">Select a folder tab in the chat selection dialog, then choose a chat.</p>
                  <Button onClick={handleOpenChatSelectionDialog}>
                    <MessageSquare className="mr-2 h-5 w-5" /> Select a Chat
                  </Button>
                  {isProcessingChats && allChats.length === 0 && ( 
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
        // Folder management props
        dialogFilters={dialogFilters}
        activeDialogFilterId={activeDialogFilterId}
        onSelectDialogFilter={handleSelectDialogFilter}
        isLoadingDialogFilters={isLoadingDialogFilters}
        isReorderingFolders={isReorderingFolders}
        onToggleReorderFolders={handleToggleReorderFolders}
        onMoveFilter={handleMoveFilter}
        onShareFilter={handleShareFilter}
        onAddFilterPlaceholder={handleAddFilterPlaceholder}
        // Chat list props
        folders={allChats} 
        selectedFolderId={selectedFolder?.id || null}
        onSelectFolder={handleSelectFolder} 
        lastItemRef={lastChatElementRef} 
        isLoading={isProcessingChats && allChats.length === 0} 
        isLoadingMore={isLoadingMoreChats} 
        hasMore={hasMoreChats}
        onLoadMore={loadMoreChatsCallback} 
        onRefresh={fetchInitialChats} 
      />

      <FileDetailsPanel
        file={selectedFileForDetails}
        isOpen={isDetailsPanelOpen}
        onClose={handleCloseFileDetails}
        onQueueDownload={handleQueueDownload} 
      />
      <ImageViewer
        isOpen={isImageViewerOpen}
        onClose={() => setIsImageViewerOpen(false)}
        imageUrl={viewingImageUrl}
        imageName={viewingImageName}
      />
      <VideoPlayer
        isOpen={isVideoPlayerOpen}
        onClose={handleCloseVideoPlayer} 
        videoUrl={playingVideoUrl}
        videoName={playingVideoName}
        isLoading={isPreparingVideoStream && playingVideoUrl === null} 
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
        isLoading={isUploadingFiles} 
      />
    </div>
  );
}

    

    