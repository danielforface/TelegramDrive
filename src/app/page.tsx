
"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Header } from "@/components/layout/header";
import { TelegramConnect } from "@/components/telegram-connect";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import { MainContentView } from "@/components/main-content-view/main-content-view";
import { FileDetailsPanel } from "@/components/file-details-panel";
import { ImageViewer } from "@/components/image-viewer";
import { VideoPlayer } from "@/components/video-player";
import { DownloadManagerDialog } from "@/components/download-manager-dialog";
import type { CloudFolder, CloudFile, DownloadQueueItemType } from "@/types";
import { Button } from "@/components/ui/button";
import { RefreshCw, Loader2, LayoutPanelLeft, FolderClosed, Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import * as telegramService from "@/services/telegramService";


const INITIAL_CHATS_LOAD_LIMIT = 20;
const SUBSEQUENT_CHATS_LOAD_LIMIT = 5;
const INITIAL_MEDIA_LOAD_LIMIT = 20;
const SUBSEQUENT_MEDIA_LOAD_LIMIT = 20;
const DOWNLOAD_CHUNK_SIZE = 512 * 1024; // 512KB per chunk
const KB_1 = 1024;
const ONE_MB = 1024 * 1024;


type AuthStep = 'initial' | 'awaiting_code' | 'awaiting_password';

export default function Home() {
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);

  const [isProcessingChats, setIsProcessingChats] = useState(false);
  const [allChats, setAllChats] = useState<CloudFolder[]>([]);
  const [isLoadingMoreChats, setIsLoadingMoreChats] = useState(false);
  const isLoadingMoreChatsRequestInFlightRef = useRef(false); // Prevents flood requests
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
  const [videoStreamUrl, setVideoStreamUrl] = useState<string | null>(null); // For Blob URL cleanup
  const [preparingVideoStreamForFileId, setPreparingVideoStreamForFileId] = useState<string | null>(null);
  const videoStreamAbortControllerRef = useRef<AbortController | null>(null);


  const [isDownloadManagerOpen, setIsDownloadManagerOpen] = useState(false);
  const [downloadQueue, setDownloadQueue] = useState<DownloadQueueItemType[]>([]);

  const activeDownloadsRef = useRef<Set<string>>(new Set());
  const downloadQueueRef = useRef<DownloadQueueItemType[]>([]); // Ref to hold the latest queue for interval
  const browserDownloadTriggeredRef = useRef(new Set<string>());


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
        setAuthError(description);
        // Directly call reset logic or set states instead of relying on handleReset in this scope
        setIsConnected(false);
        setPhoneNumber('');
        setAuthStep('initial');
        setAuthError(null);
        setAllChats([]);
        setSelectedFolder(null);
        setCurrentChatMedia([]);
    } else {
        setAuthError(description);
    }
    toast({ title, description, variant: "destructive", duration: error.message && error.message.includes("Invalid hash") ? 10000 : 5000 });
  }, [toast]);


  const fetchInitialChats = useCallback(async () => {
    if (isProcessingChats || isLoadingMoreChats) return;
    setIsProcessingChats(true);
    setAllChats([]);
    setSelectedFolder(null);
    setCurrentChatMedia([]);
    setAuthError(null);
    setChatsOffsetDate(0);
    setChatsOffsetId(0);
    setChatsOffsetPeer({ _: 'inputPeerEmpty' });
    setHasMoreChats(true);
    isLoadingMoreChatsRequestInFlightRef.current = false;
    toast({ title: "Fetching Chats...", description: "Loading your Telegram conversations." });

    try {
      const response = await telegramService.getTelegramChats(INITIAL_CHATS_LOAD_LIMIT, 0, 0, { _: 'inputPeerEmpty' });
      setAllChats(response.folders);
      setChatsOffsetDate(response.nextOffsetDate);
      setChatsOffsetId(response.nextOffsetId);
      setChatsOffsetPeer(response.nextOffsetPeer);
      setHasMoreChats(response.hasMore);
      if (response.folders.length === 0 && !response.hasMore) {
        toast({ title: "No Chats Found", description: "Your Telegram chat list appears to be empty.", variant: "default" });
      } else if (response.folders.length > 0) {
        toast({ title: "Chats Loaded!", description: `Loaded ${response.folders.length} initial chats.` });
      }
    } catch (error: any) {
      handleApiError(error, "Error Fetching Chats", `Could not load your chats. ${error.message || 'Unknown error'}`);
    } finally {
      setIsProcessingChats(false);
    }
  }, [toast, handleApiError, isProcessingChats, isLoadingMoreChats]);


  const checkExistingConnection = useCallback(async () => {
    console.log("Checking existing connection...");
    try {
      const previouslyConnected = await telegramService.isUserConnected();
      if (previouslyConnected) {
        const storedUser = telegramService.getUserSessionDetails();
        if (storedUser && storedUser.phone) {
            setPhoneNumber(storedUser.phone); 
        }
        console.log("User was previously connected. Setting state and fetching chats.");
        setIsConnected(true);
        setAuthStep('initial'); 
        setAuthError(null);
        fetchInitialChats();
      } else {
        console.log("No existing connection found or session invalid.");
        setIsConnected(false);
        setPhoneNumber(''); 
        setAuthStep('initial');
        setAuthError(null);
      }
    } catch (error: any) {
      console.warn("Error checking existing connection:", error.message, error.originalErrorObject || error);
      if (error.message?.includes("Invalid hash in mt_dh_gen_ok")) {
        toast({
          title: "Connection Handshake Failed",
          description: "Could not establish a secure connection. Please verify your API ID/Hash in .env.local. If correct, try clearing localStorage for this site and restarting the server.",
          variant: "destructive",
          duration: 10000,
        });
        setAuthError("Connection handshake failed. Check API credentials & localStorage.");
      } else if (error.message === 'AUTH_RESTART') {
          toast({ title: "Authentication Expired", description: "Your session needs to be re-initiated. Please enter your phone number again.", variant: "destructive" });
          setIsConnected(false);
          setPhoneNumber('');
          setAuthStep('initial');
          setAuthError(null);
          setAllChats([]); 
      }
      setIsConnected(false); 
    }
  }, [toast, fetchInitialChats]); 

  useEffect(() => {
    checkExistingConnection();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleReset = useCallback(async (performServerLogout = true) => {
    if (performServerLogout && isConnected) {
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
    setIsProcessingChats(false);
    setAllChats([]);
    setSelectedFolder(null);
    setCurrentChatMedia([]);
    setIsConnecting(false);
    setAuthStep('initial');
    setPhoneNumber('');
    setPhoneCode('');
    setPassword('');
    setAuthError(null);

    setIsLoadingMoreChats(false);
    isLoadingMoreChatsRequestInFlightRef.current = false;
    setHasMoreChats(true);
    setChatsOffsetDate(0);
    setChatsOffsetId(0);
    setChatsOffsetPeer({ _: 'inputPeerEmpty' });

    setIsLoadingChatMedia(false);
    setHasMoreChatMedia(true);
    setCurrentMediaOffsetId(0);

    downloadQueueRef.current.forEach(item => {
      if (item.abortController && !item.abortController.signal.aborted) {
        console.log(`Reset: Aborting download for ${item.name}`);
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

  }, [isConnected, toast, videoStreamUrl]); 

  useEffect(() => {
    const processQueue = async () => {
      for (let i = 0; i < downloadQueueRef.current.length; i++) {
        const itemInLoop = downloadQueueRef.current[i];
        const currentItemFromState = downloadQueueRef.current.find(q => q.id === itemInLoop.id);

        if (!currentItemFromState) {
            console.warn(`Item ${itemInLoop.id} no longer in queue, skipping processing.`);
            if(activeDownloadsRef.current.has(itemInLoop.id)) {
                activeDownloadsRef.current.delete(itemInLoop.id);
            }
            continue;
        }
        const upToDateItem = currentItemFromState;

        if (upToDateItem.abortController?.signal.aborted && upToDateItem.status !== 'cancelled' && upToDateItem.status !== 'failed' && upToDateItem.status !== 'completed') {
             console.log(`Download for ${upToDateItem.name} was already aborted (found in processQueue start), status: ${upToDateItem.status}. Ensuring it's marked cancelled.`);
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
                console.log(`Download for ${upToDateItem.name} was aborted before chunk fetch logic.`);
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
                        console.error(`CDN download for ${upToDateItem.name}: All hash blocks processed, but file not complete. Downloaded: ${upToDateItem.downloadedBytes}, Total: ${upToDateItem.totalSizeInBytes}`);
                        setDownloadQueue(prevQ => prevQ.map(q => q.id === upToDateItem.id ? { ...q, status: 'failed', error_message: 'CDN blocks exhausted before completion' } : q));
                    }
                    activeDownloadsRef.current.delete(upToDateItem.id);
                    continue;
                }
                const cdnBlock = upToDateItem.cdnFileHashes[currentHashBlockIndex];
                actualLimitForApi = cdnBlock.limit;

                console.log(`Processing CDN download for ${upToDateItem.name}, DC: ${upToDateItem.cdnDcId}, Block ${currentHashBlockIndex}, Offset: ${cdnBlock.offset}, Limit: ${actualLimitForApi}`);
                
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
                        console.error(`CDN Hash mismatch for ${upToDateItem.name}, block ${currentHashBlockIndex}. Expected:`, cdnBlock.hash, "Got:", downloadedHash);
                        setDownloadQueue(prevQ => prevQ.map(q => q.id === upToDateItem.id ? { ...q, status: 'failed', error_message: 'CDN Hash Mismatch' } : q));
                        activeDownloadsRef.current.delete(upToDateItem.id);
                        continue;
                    }
                    console.log(`CDN Hash verified for ${upToDateItem.name}, block ${currentHashBlockIndex}`);
                }
            } else { 
                const bytesNeededForFile = upToDateItem.totalSizeInBytes - upToDateItem.downloadedBytes;
                const offsetWithinCurrentBlock = upToDateItem.currentOffset % ONE_MB;
                const bytesLeftInCurrentBlock = ONE_MB - offsetWithinCurrentBlock;
    
                let idealRequestSize = Math.min(bytesLeftInCurrentBlock, DOWNLOAD_CHUNK_SIZE);
                
                if (bytesNeededForFile <= 0) {
                    actualLimitForApi = 0;
                } else if (idealRequestSize <= 0) {
                    actualLimitForApi = bytesNeededForFile > 0 ? KB_1 : 0;
                } else if (idealRequestSize < KB_1) {
                     actualLimitForApi = KB_1;
                } else {
                    actualLimitForApi = Math.floor(idealRequestSize / KB_1) * KB_1;
                }
                
                if (actualLimitForApi === 0 && bytesNeededForFile > 0 && idealRequestSize > 0) {
                    actualLimitForApi = KB_1;
                }

                console.log(`Processing direct download for ${upToDateItem.name}, offset: ${upToDateItem.currentOffset}, API limit: ${actualLimitForApi}, idealRequest: ${idealRequestSize}, neededForFile: ${bytesNeededForFile}, leftInBlock: ${bytesLeftInCurrentBlock}, totalSize: ${upToDateItem.totalSizeInBytes}`);
                
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
                   } else if (bytesNeededForFile > 0) {
                        console.error(`Stalled download for ${upToDateItem.name}: Calculated API limit is ${actualLimitForApi}, but ${bytesNeededForFile} bytes remaining. idealRequestSize was ${idealRequestSize}.`);
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
              console.log(`Download for ${upToDateItem.name} was aborted during or immediately after chunk fetch call.`);
              activeDownloadsRef.current.delete(upToDateItem.id);
              if(upToDateItem.status !== 'cancelled') setDownloadQueue(prevQ => prevQ.map(q => q.id === upToDateItem.id ? { ...q, status: 'cancelled', error_message: "Aborted" } : q));
              continue;
            }

            if (chunkResponse?.isCdnRedirect && chunkResponse.cdnRedirectData) {
                console.log(`CDN Redirect for ${upToDateItem.name}. Updating queue item.`);
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
                console.log(`File reference expired for ${upToDateItem.name}. Attempting to refresh.`);
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
                        console.log(`File ${q_item.name} downloaded and saved via setDownloadQueue (id: ${q_item.id}).`);
                      } else if (browserDownloadTriggeredRef.current.has(q_item.id) && q_item.status !== 'completed') {
                         console.log(`File ${q_item.name} (id: ${q_item.id}) already triggered browser download, marking as completed.`);
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
              const errorMessage = chunkResponse?.errorType || (chunkResponse && Object.keys(chunkResponse).length === 0 ? 'Empty response object' : 'Unknown error or no data returned');
              console.error(`Failed to download chunk for ${upToDateItem.name} or no data returned. Response:`, chunkResponse, "Error Message:", errorMessage);
              setDownloadQueue(prevQ => prevQ.map(q_item => q_item.id === upToDateItem.id ? { ...q_item, status: 'failed', error_message: `Download error: ${errorMessage}` } : q_item));
            }
          } catch (error: any) {
             if (error.name === 'AbortError' || (error.message && error.message.toLowerCase().includes('aborted'))) {
                console.log(`Download for ${upToDateItem.name} aborted (caught in processQueue's main try-catch). Status: ${upToDateItem.status}`);
                if(upToDateItem.status !== 'cancelled' && upToDateItem.status !== 'failed' && upToDateItem.status !== 'completed' ) {
                    setDownloadQueue(prevQ => prevQ.map(q_item => q_item.id === upToDateItem.id ? { ...q_item, status: 'cancelled', error_message: "Aborted by user or system." } : q_item));
                }
             } else {
                console.error(`Error processing download for ${upToDateItem.name}:`, error);
                setDownloadQueue(prevQ => prevQ.map(q_item => q_item.id === upToDateItem.id ? { ...q_item, status: 'failed', error_message: error.message || 'Processing error' } : q_item));
             }
          } finally {
             activeDownloadsRef.current.delete(upToDateItem.id); 
          }
        } else if (upToDateItem.status === 'refreshing_reference' && !activeDownloadsRef.current.has(upToDateItem.id)) {
            activeDownloadsRef.current.add(upToDateItem.id);
            console.log(`Refreshing file reference for ${upToDateItem.name}...`);
            try {
                if (upToDateItem.abortController?.signal.aborted) {
                    console.log(`Download for ${upToDateItem.name} was aborted before reference refresh.`);
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
                        console.log(`File reference for ${upToDateItem.name} refreshed. Resuming download.`);
                    } else {
                         console.error(`Failed to construct new location after refreshing file reference for ${upToDateItem.name}. Media Object:`, updatedMediaObject);
                         setDownloadQueue(prevQ => prevQ.map(q_item => q_item.id === upToDateItem.id ? { ...q_item, status: 'failed', error_message: 'Refresh failed (new location error)' } : q_item));
                    }
                } else {
                    console.error(`Failed to refresh file reference for ${upToDateItem.name}. Setting to failed. Response:`, updatedMediaObject);
                    setDownloadQueue(prevQ => prevQ.map(q_item => q_item.id === upToDateItem.id ? { ...q_item, status: 'failed', error_message: 'Refresh failed (no reference)' } : q_item));
                }
            } catch (refreshError: any) {
                console.error(`Error during file reference refresh for ${upToDateItem.name}:`, refreshError);
                setDownloadQueue(prevQ => prevQ.map(q_item => q_item.id === upToDateItem.id ? { ...q_item, status: 'failed', error_message: refreshError.message || 'Refresh error' } : q_item));
            } finally {
                activeDownloadsRef.current.delete(upToDateItem.id);
            }
        } else if (['paused', 'completed', 'failed', 'cancelled'].includes(upToDateItem.status) ) {
            if(activeDownloadsRef.current.has(upToDateItem.id)){
                console.warn(`Item ${upToDateItem.name} was in activeDownloadsRef but has status ${upToDateItem.status}. Removing from active.`);
                activeDownloadsRef.current.delete(upToDateItem.id);
            }
        }
      }
    };

    const intervalId = setInterval(processQueue, 750); 

    return () => {
        clearInterval(intervalId);
        console.log("Home component unmounting or main download effect re-running. Aborting downloads for items still in resumable states.");
        downloadQueueRef.current.forEach(item => {
            if (item.abortController && !item.abortController.signal.aborted &&
                (item.status === 'downloading' || item.status === 'refreshing_reference' || item.status === 'queued' || item.status === 'paused')) {
                console.log(`Cleanup: Aborting download for ${item.name} (status: ${item.status})`);
                item.abortController.abort("Component cleanup or effect re-run");
            }
        });
        activeDownloadsRef.current.clear(); 
    };
  }, []); 


  const loadMoreChatsCallback = useCallback(async () => {
    if (isLoadingMoreChats || isProcessingChats || !hasMoreChats || !isConnected || isLoadingMoreChatsRequestInFlightRef.current) {
      return;
    }

    isLoadingMoreChatsRequestInFlightRef.current = true;
    setIsLoadingMoreChats(true);
    toast({ title: "Loading More Chats...", description: "Fetching the next batch of conversations." });
    try {
      const response = await telegramService.getTelegramChats(SUBSEQUENT_CHATS_LOAD_LIMIT, chatsOffsetDate, chatsOffsetId, chatsOffsetPeer);
      setAllChats(prev => [...prev, ...response.folders]);
      setChatsOffsetDate(response.nextOffsetDate);
      setChatsOffsetId(response.nextOffsetId);
      setChatsOffsetPeer(response.nextOffsetPeer);
      setHasMoreChats(response.hasMore);
       if (response.folders.length > 0) {
         toast({ title: "More Chats Loaded!", description: `Loaded ${response.folders.length} additional chats.` });
      } else if (!response.hasMore) {
         toast({ title: "All Chats Loaded", description: "You've reached the end of your chat list."});
      }
    } catch (error: any) {
      handleApiError(error, "Error Loading More Chats", `Could not load more chats. ${error.message}`);
      setHasMoreChats(false); 
    } finally {
      setIsLoadingMoreChats(false);
      isLoadingMoreChatsRequestInFlightRef.current = false;
    }
  }, [isConnected, isProcessingChats, isLoadingMoreChats, hasMoreChats, chatsOffsetDate, chatsOffsetId, chatsOffsetPeer, toast, handleApiError]);

  const observerChats = useRef<IntersectionObserver | null>(null);
  const lastChatElementRef = useCallback((node: HTMLLIElement | null) => {
    if (isLoadingMoreChats || isProcessingChats || isLoadingMoreChatsRequestInFlightRef.current) return;
    if (observerChats.current) observerChats.current.disconnect();
    observerChats.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMoreChats && !isLoadingMoreChats && !isProcessingChats && !isLoadingMoreChatsRequestInFlightRef.current) {
        loadMoreChatsCallback();
      }
    });
    if (node) observerChats.current.observe(node);
  }, [isLoadingMoreChats, isProcessingChats, hasMoreChats, loadMoreChatsCallback]); 


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
      setHasMoreChatMedia(false); 
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

  const handleSelectFolder = (folderId: string) => {
    const folder = allChats.find(f => f.id === folderId);
    if (folder) {
      setSelectedFolder(folder);
      fetchInitialChatMedia(folder);
    } else {
      setSelectedFolder(null);
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
    setPhoneNumber(fullPhoneNumberFromConnect); 
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
    setPhoneCode(currentPhoneCode); 
    toast({ title: "Verifying Code...", description: "Checking your verification code with Telegram." });
    try {
      const result = await telegramService.signIn(phoneNumber, currentPhoneCode); 
      if (result.user) {
        setIsConnected(true);
        setAuthStep('initial'); 
        setPhoneCode(''); 
        setPassword(''); 
        fetchInitialChats();
        toast({ title: "Sign In Successful!", description: "Connected to Telegram." });
      } else { 
        setAuthError("Sign in failed. Unexpected response from server.");
        toast({ title: "Sign In Failed", description: "Unexpected response from server.", variant: "destructive" });
      }
    } catch (error: any) {
      if (error.message === '2FA_REQUIRED' && (error as any).srp_id) {
        console.log("2FA required for sign in, srp_id received:", (error as any).srp_id);
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
        fetchInitialChats();
        toast({ title: "2FA Successful!", description: "Connected to Telegram." });
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

  const handleOpenFileDetails = (file: CloudFile) => {
    setSelectedFileForDetails(file);
    setIsDetailsPanelOpen(true);
  };

  const handleCloseFileDetails = () => {
    setIsDetailsPanelOpen(false);
  };

  const handleQueueDownload = async (file: CloudFile) => {
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
        await new Promise(resolve => setTimeout(resolve, 50)); 
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
  };

  const handleCancelDownload = (itemId: string) => {
    const itemToCancel = downloadQueueRef.current.find(item => item.id === itemId);
    if (itemToCancel && itemToCancel.abortController && !itemToCancel.abortController.signal.aborted) {
        console.log(`User cancelling download for ${itemToCancel.name}`);
        itemToCancel.abortController.abort("User cancelled download"); 
    }
    setDownloadQueue(prevQueue =>
      prevQueue.map(item =>
        item.id === itemId ? { ...item, status: 'cancelled', progress: 0, downloadedBytes: 0, error_message: "User cancelled" } : item
      )
    );
    toast({ title: "Download Cancelled", description: `Download for ${itemToCancel?.name || 'item'} has been cancelled.`});
  };

  const handlePauseDownload = (itemId: string) => {
    setDownloadQueue(prevQueue =>
        prevQueue.map(item =>
            item.id === itemId && item.status === 'downloading' ? 
            {...item, status: 'paused'} : item
        )
    );
    toast({ title: "Download Paused", description: `Download for item has been paused.`});
  };

  const handleResumeDownload = (itemId: string) => {
    const itemToResume = downloadQueueRef.current.find(item => item.id === itemId);

    if (itemToResume && (itemToResume.status === 'failed' || itemToResume.status === 'cancelled')) {
        console.log(`Retrying download for ${itemToResume.name}`);
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
        return;
    }

    setDownloadQueue(prevQueue =>
        prevQueue.map(item =>
            item.id === itemId && item.status === 'paused' ? 
            {...item, status: 'downloading'} : item 
        )
    );
    toast({ title: "Download Resumed", description: `Download for item has been resumed.`});
  };


  const handleViewImage = (file: CloudFile) => {
    if (file.type === 'image' && file.url) {
      setViewingImageUrl(file.url);
      setViewingImageName(file.name);
      setIsImageViewerOpen(true);
    } else if (file.type === 'image' && !file.url) {
      toast({ title: "Preview Not Available", description: "Image URL not available for preview. Try downloading first.", variant: "default"});
    } else if (file.type !== 'image') {
      toast({ title: "Not an Image", description: "This file is not an image and cannot be viewed here.", variant: "default"});
    }
  };

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
        
        const remainingInFile = totalSize - downloadedBytes;
        const offsetInCurrentMBBlock = currentOffset % ONE_MB;
        const bytesLeftInCurrentMBBlock = ONE_MB - offsetInCurrentMBBlock;
        
        let idealBytesToRequest = Math.min(DOWNLOAD_CHUNK_SIZE, bytesLeftInCurrentMBBlock, remainingInFile);
        let limitForApiCall;

        if (idealBytesToRequest <= 0 && remainingInFile > 0) {
            limitForApiCall = KB_1; 
        } else if (idealBytesToRequest < KB_1 && idealBytesToRequest > 0) {
            limitForApiCall = KB_1; 
        } else if (idealBytesToRequest >= KB_1) {
            limitForApiCall = Math.floor(idealBytesToRequest / KB_1) * KB_1;
        } else { 
            break; 
        }
        if (limitForApiCall === 0 && remainingInFile > 0) limitForApiCall = KB_1; 

        console.log(`Fetching video chunk for ${file.name}: offset=${currentOffset}, limit=${limitForApiCall}`);
        const chunkResponse = await telegramService.downloadFileChunk(downloadInfo.location, currentOffset, limitForApiCall, signal);

        if (signal.aborted) throw new Error("Video preparation aborted during chunk download.");

        if (chunkResponse?.bytes && chunkResponse.bytes.length > 0) {
          chunks.push(chunkResponse.bytes);
          downloadedBytes += chunkResponse.bytes.length;
          currentOffset += chunkResponse.bytes.length;
        } else if (chunkResponse?.errorType) {
          throw new Error(`Failed to download video chunk: ${chunkResponse.errorType}`);
        } else if (chunkResponse?.isCdnRedirect){
            throw new Error("CDN Redirect not handled during video stream preparation.");
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
        console.error("Error in prepareAndPlayVideoStream directly (should be handled by fetchVideo):", error);
    } finally {
        if (videoStreamAbortControllerRef.current === newController) {
            setIsPreparingVideoStream(false);
            setPreparingVideoStreamForFileId(null);
        }
    }
  }, [isPreparingVideoStream, preparingVideoStreamForFileId, videoStreamUrl, fetchVideoAndCreateStreamUrl, toast]);


  const handlePlayVideo = (file: CloudFile) => {
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
            toast({ title: "Playback Not Possible", description: "Video data or size is missing.", variant: "default"});
        }
    } else {
      toast({ title: "Not a Video", description: "This file is not a video and cannot be played here.", variant: "default"});
    }
  };
  
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
  }, [videoStreamUrl]);


  const handleOpenDownloadManager = () => setIsDownloadManagerOpen(true);
  const handleCloseDownloadManager = () => setIsDownloadManagerOpen(false);


  if (!isConnected) {
    return (
      <>
        <Header />
        <main className="flex-grow container mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col items-center justify-center">
          <TelegramConnect
            authStep={authStep}
            onSendCode={handleSendCode}
            onSignIn={handleSignIn}
            onCheckPassword={handleCheckPassword}
            isLoading={isConnecting}
            error={authError}
            phoneNumber={phoneNumber} 
            setPhoneNumberProp={setPhoneNumber} 
            phoneCode={phoneCode}
            setPhoneCode={setPhoneCode}
            password={password}
            setPassword={setPassword}
            onReset={() => handleReset(authStep !== 'initial')} 
          />
        </main>
        <footer className="py-4 px-4 sm:px-6 lg:px-8 text-center border-t">
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
        isConnected={isConnected}
        onDisconnect={() => handleReset(true)} 
        onOpenDownloadManager={handleOpenDownloadManager}
      />
      <div className="flex-1 flex container mx-auto px-0 sm:px-2 lg:px-4 py-4 overflow-hidden">
        {/* Sidebar for Chats */}
        <aside className="w-64 md:w-72 lg:w-80 p-4 border-r bg-card overflow-y-auto flex-shrink-0">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold text-primary">Chats</h2>
          </div>
          {isProcessingChats && allChats.length === 0 ? (
            <div className="flex flex-col items-center p-4">
              <Loader2 className="animate-spin h-8 w-8 text-primary mb-2" />
              <p className="text-muted-foreground">Loading chats...</p>
            </div>
          ) : allChats.length === 0 && !isProcessingChats && !authError ? (
             <div className="text-center py-4">
                <FolderClosed className="mx-auto h-12 w-12 text-muted-foreground mb-2" />
                <p className="text-muted-foreground">No chats found.</p>
                <Button onClick={fetchInitialChats} variant="link" className="mt-2">Try Refreshing</Button>
            </div>
          ) : authError && allChats.length === 0 && !isProcessingChats ? (
            <div className="text-center py-4 text-destructive">
              <p>{authError}</p>
              <Button onClick={fetchInitialChats} variant="link" className="mt-2">Try Refreshing</Button>
            </div>
          ) : (
            <SidebarNav
              folders={allChats}
              selectedFolderId={selectedFolder?.id || null}
              onSelectFolder={handleSelectFolder}
              lastItemRef={lastChatElementRef}
            />
          )}
          {isLoadingMoreChats && (
            <div className="flex justify-center items-center p-2 mt-2">
              <Loader2 className="animate-spin h-5 w-5 text-primary" />
              <p className="ml-2 text-sm text-muted-foreground">Loading more chats...</p>
            </div>
          )}
          {!isLoadingMoreChats && !hasMoreChats && allChats.length > 0 && !isLoadingMoreChatsRequestInFlightRef.current && (
            <p className="text-center text-xs text-muted-foreground py-2 mt-2">No more chats to load.</p>
          )}
        </aside>

        {/* Main Content Area for Media */}
        <main className="flex-grow p-4 md:p-6 lg:p-8 overflow-y-auto">
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
              isPreparingStream={isPreparingVideoStream}
              preparingStreamForFileId={preparingVideoStreamForFileId}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
              <LayoutPanelLeft className="w-16 h-16 mb-4 opacity-50" />
              <p className="text-lg">Select a chat from the sidebar to view its media.</p>
              {allChats.length > 0 && <p className="text-sm mt-1">Or scroll the chat list to load more chats.</p>}
            </div>
          )}
        </main>
      </div>
      <footer className="py-3 px-4 sm:px-6 lg:px-8 text-center border-t text-xs">
        <p className="text-muted-foreground">
          Telegram Cloudifier &copy; {new Date().getFullYear()}
        </p>
      </footer>
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
    </div>
  );
}

    
