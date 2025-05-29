
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
import type { CloudFolder, CloudFile, DownloadQueueItemType, FileHash } from "@/types";
import { Button } from "@/components/ui/button";
import { RefreshCw, Loader2, LayoutPanelLeft, FolderClosed, Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import * as telegramService from "@/services/telegramService";
import { formatFileSize } from "@/lib/utils";

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

  const [isDownloadManagerOpen, setIsDownloadManagerOpen] = useState(false);
  const [downloadQueue, setDownloadQueue] = useState<DownloadQueueItemType[]>([]);

  const activeDownloadsRef = useRef<Set<string>>(new Set());


  const { toast } = useToast();

  const [authStep, setAuthStep] = useState<AuthStep>('initial');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [phoneCode, setPhoneCode] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);

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
        handleReset(false); 
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
      }
      setIsConnected(false);
      handleReset(false);
    }
  }, [toast]);

  useEffect(() => {
    checkExistingConnection();
  }, [checkExistingConnection]);


  useEffect(() => {
    const processQueue = async () => {
      for (let i = 0; i < downloadQueue.length; i++) { 
        const itemInLoop = downloadQueue[i]; // Use a new variable for the item in the current loop iteration

        if (itemInLoop.status === 'downloading' &&
            itemInLoop.location && 
            itemInLoop.totalSizeInBytes && 
            itemInLoop.downloadedBytes < itemInLoop.totalSizeInBytes &&
            !activeDownloadsRef.current.has(itemInLoop.id) 
            ) {

          activeDownloadsRef.current.add(itemInLoop.id); 

          try {
            const currentOffset = itemInLoop.currentOffset || 0;
            const remainingBytes = itemInLoop.totalSizeInBytes - currentOffset;

            if (remainingBytes <= 0) {
                setDownloadQueue(prevQ => prevQ.map(q => q.id === itemInLoop.id ? { ...q, status: 'completed', progress: 100, downloadedBytes: itemInLoop.totalSizeInBytes, currentOffset: itemInLoop.totalSizeInBytes } : q));
                activeDownloadsRef.current.delete(itemInLoop.id);
                continue;
            }
            
            let actualLimitForApi: number;
            let chunkResponse: telegramService.FileChunkResponse;

            if (itemInLoop.cdnFileToken && itemInLoop.cdnDcId && itemInLoop.cdnFileHashes && itemInLoop.cdnEncryptionKey && itemInLoop.cdnEncryptionIv) {
                const currentHashBlockIndex = itemInLoop.cdnCurrentFileHashIndex || 0;
                if (currentHashBlockIndex >= itemInLoop.cdnFileHashes.length) {
                    // All CDN blocks downloaded, should already be marked completed if downloadedBytes matches totalSize
                     if (itemInLoop.downloadedBytes >= itemInLoop.totalSizeInBytes) {
                        setDownloadQueue(prevQ => prevQ.map(q => q.id === itemInLoop.id ? { ...q, status: 'completed', progress: 100, downloadedBytes: itemInLoop.totalSizeInBytes } : q));
                    } else {
                        // This case implies an issue, perhaps cdnFileHashes was exhausted but file not fully downloaded
                        console.error(`CDN download for ${itemInLoop.name}: All hash blocks processed, but file not complete. Downloaded: ${itemInLoop.downloadedBytes}, Total: ${itemInLoop.totalSizeInBytes}`);
                        setDownloadQueue(prevQ => prevQ.map(q => q.id === itemInLoop.id ? { ...q, status: 'failed', error_message: 'CDN blocks exhausted before completion' } : q));
                    }
                    activeDownloadsRef.current.delete(itemInLoop.id);
                    continue;
                }
                const cdnBlock = itemInLoop.cdnFileHashes[currentHashBlockIndex];
                actualLimitForApi = cdnBlock.limit; 
                
                console.log(`Processing CDN download for ${itemInLoop.name}, DC: ${itemInLoop.cdnDcId}, Block ${currentHashBlockIndex}, Offset: ${cdnBlock.offset}, Limit: ${actualLimitForApi}`);
                chunkResponse = await telegramService.downloadCdnFileChunk(
                    {
                        dc_id: itemInLoop.cdnDcId,
                        file_token: itemInLoop.cdnFileToken,
                        encryption_key: itemInLoop.cdnEncryptionKey, 
                        encryption_iv: itemInLoop.cdnEncryptionIv,  
                        file_hashes: itemInLoop.cdnFileHashes, 
                    },
                    cdnBlock.offset, 
                    actualLimitForApi, 
                    itemInLoop.abortController?.signal
                );

                if (chunkResponse?.bytes) {
                    const downloadedHash = await telegramService.calculateSHA256(chunkResponse.bytes);
                    if (!telegramService.areUint8ArraysEqual(downloadedHash, cdnBlock.hash)) {
                        console.error(`CDN Hash mismatch for ${itemInLoop.name}, block ${currentHashBlockIndex}. Expected:`, cdnBlock.hash, "Got:", downloadedHash);
                        setDownloadQueue(prevQ => prevQ.map(q => q.id === itemInLoop.id ? { ...q, status: 'failed', progress: q.progress, error_message: 'CDN Hash Mismatch' } : q));
                        activeDownloadsRef.current.delete(itemInLoop.id);
                        continue;
                    }
                    console.log(`CDN Hash verified for ${itemInLoop.name}, block ${currentHashBlockIndex}`);
                }
            } else {
                // Direct Download Path
                const bytesNeededForFile = itemInLoop.totalSizeInBytes - itemInLoop.downloadedBytes;
                const offsetWithinCurrentBlock = itemInLoop.currentOffset % ONE_MB;
                const bytesLeftInCurrentBlock = ONE_MB - offsetWithinCurrentBlock;
                const dataToRequest = Math.min(bytesNeededForFile, bytesLeftInCurrentBlock, DOWNLOAD_CHUNK_SIZE);

                if (dataToRequest <= 0) {
                    actualLimitForApi = 0;
                } else {
                    actualLimitForApi = Math.floor(dataToRequest / KB_1) * KB_1;
                }
                
                console.log(`Processing direct download for ${itemInLoop.name}, offset: ${itemInLoop.currentOffset}, API limit: ${actualLimitForApi}, dataToRequest: ${dataToRequest}, neededForFile: ${bytesNeededForFile}, leftInBlock: ${bytesLeftInCurrentBlock}, totalSize: ${itemInLoop.totalSizeInBytes}`);
                
                if (actualLimitForApi <= 0) { 
                   if (itemInLoop.downloadedBytes >= itemInLoop.totalSizeInBytes) {
                       setDownloadQueue(prevQ => prevQ.map(q => q.id === itemInLoop.id ? { ...q, status: 'completed', progress: 100, downloadedBytes: itemInLoop.totalSizeInBytes, currentOffset: itemInLoop.totalSizeInBytes } : q));
                   } else if (bytesNeededForFile > 0) { // If limit is 0 but file not done
                        console.error(`Stalled download for ${itemInLoop.name}: Calculated API limit is 0, but ${bytesNeededForFile} bytes remaining. dataToRequest was ${dataToRequest}. Check DOWNLOAD_CHUNK_SIZE vs KB_1 alignment.`);
                        setDownloadQueue(prevQ => prevQ.map(q => q.id === itemInLoop.id ? { ...q, status: 'failed', error_message: 'Internal limit calc error (cannot form 1KB chunk)' } : q));
                   }
                   activeDownloadsRef.current.delete(itemInLoop.id);
                   continue;
                }

                chunkResponse = await telegramService.downloadFileChunk(
                    itemInLoop.location,
                    itemInLoop.currentOffset, // Use itemInLoop's currentOffset
                    actualLimitForApi,
                    itemInLoop.abortController?.signal
                );
            }


            if (itemInLoop.abortController?.signal.aborted) {
              console.log(`Download for ${itemInLoop.name} was aborted during chunk fetch.`);
              activeDownloadsRef.current.delete(itemInLoop.id); 
              continue;
            }

            if (chunkResponse?.isCdnRedirect && chunkResponse.cdnRedirectData) {
                console.log(`CDN Redirect for ${itemInLoop.name}. Updating queue item.`);
                setDownloadQueue(prevQ => prevQ.map(q_item => q_item.id === itemInLoop.id ? {
                    ...q_item,
                    status: 'downloading', 
                    cdnDcId: chunkResponse.cdnRedirectData!.dc_id,
                    cdnFileToken: chunkResponse.cdnRedirectData!.file_token,
                    cdnEncryptionKey: chunkResponse.cdnRedirectData!.encryption_key,
                    cdnEncryptionIv: chunkResponse.cdnRedirectData!.encryption_iv,
                    cdnFileHashes: chunkResponse.cdnRedirectData!.file_hashes.map(fh => ({ 
                        offset: Number(fh.offset), 
                        limit: fh.limit,
                        hash: fh.hash,
                    })),
                    cdnCurrentFileHashIndex: 0, 
                    currentOffset: 0, // Reset offset for CDN download
                    downloadedBytes: 0, // Reset downloaded bytes for CDN
                    progress: 0, 
                    chunks: [], 
                } : q_item));
            } else if (chunkResponse?.errorType === 'FILE_REFERENCE_EXPIRED') {
                console.log(`File reference expired for ${itemInLoop.name}. Attempting to refresh.`);
                setDownloadQueue(prevQ => prevQ.map(q_item => q_item.id === itemInLoop.id ? { ...q_item, status: 'refreshing_reference' } : q_item));

            } else if (chunkResponse?.bytes) {
              const chunkSize = chunkResponse.bytes.length;
              
              setDownloadQueue(prevQ =>
                prevQ.map(q_item => {
                  if (q_item.id === itemInLoop.id) {
                    const newDownloadedBytes = q_item.downloadedBytes + chunkSize; 
                    const newProgress = Math.min(100, Math.floor((newDownloadedBytes / q_item.totalSizeInBytes!) * 100));
                    const newChunks = [...(q_item.chunks || []), chunkResponse.bytes!]; // chunkResponse.bytes is checked
                    
                    let nextReqOffset = q_item.currentOffset;
                    let nextCdnProcessingIndex = q_item.cdnCurrentFileHashIndex;

                    if(q_item.cdnFileToken && q_item.cdnFileHashes) { 
                      // For CDN, next offset is the START of the NEXT block, or total size if done with blocks.
                      // Progress and downloadedBytes accumulate across blocks.
                      // currentOffset for the item itself should reflect total downloaded bytes.
                      nextCdnProcessingIndex = (q_item.cdnCurrentFileHashIndex || 0) + 1;
                      nextReqOffset = newDownloadedBytes; // The 'currentOffset' field of the item tracks total progress
                    } else { 
                      // For direct download, next offset is current + chunk size
                      nextReqOffset = q_item.currentOffset + chunkSize;
                    }

                    if (newDownloadedBytes >= q_item.totalSizeInBytes!) {
                      const fullFileBlob = new Blob(newChunks, { type: q_item.telegramMessage?.mime_type || 'application/octet-stream' });
                      const url = URL.createObjectURL(fullFileBlob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = q_item.name;
                      document.body.appendChild(a);
                      a.click();
                      document.body.removeChild(a);
                      URL.revokeObjectURL(url);
                      console.log(`File ${q_item.name} downloaded and saved.`);
                      return { 
                        ...q_item, 
                        status: 'completed', 
                        progress: 100, 
                        downloadedBytes: newDownloadedBytes, 
                        chunks: [], 
                        cdnCurrentFileHashIndex: undefined, // Clear CDN specific index
                        currentOffset: q_item.totalSizeInBytes // Set offset to total size
                      };
                    }
                    return {
                      ...q_item,
                      downloadedBytes: newDownloadedBytes,
                      progress: newProgress,
                      currentOffset: nextReqOffset, 
                      chunks: newChunks,
                      cdnCurrentFileHashIndex: q_item.cdnFileToken ? nextCdnProcessingIndex : undefined,
                      status: 'downloading', // Ensure status stays 'downloading'
                    };
                  }
                  return q_item;
                })
              );
            } else {
              const errorMessage = chunkResponse?.errorType || 'Unknown error or no data';
              console.error(`Failed to download chunk for ${itemInLoop.name} or no data returned. Response:`, chunkResponse);
              setDownloadQueue(prevQ => prevQ.map(q_item => q_item.id === itemInLoop.id ? { ...q_item, status: 'failed', error_message: `Download error: ${errorMessage}` } : q_item));
            }
          } catch (error: any) {
             if (error.name === 'AbortError') {
                console.log(`Download for ${itemInLoop.name} aborted by user (caught in processQueue).`);
             } else {
                console.error(`Error processing download for ${itemInLoop.name}:`, error);
                setDownloadQueue(prevQ => prevQ.map(q_item => q_item.id === itemInLoop.id ? { ...q_item, status: 'failed', error_message: error.message || 'Processing error' } : q_item));
             }
          } finally {
             activeDownloadsRef.current.delete(itemInLoop.id); 
          }
        } else if (itemInLoop.status === 'refreshing_reference' && !activeDownloadsRef.current.has(itemInLoop.id)) {
            activeDownloadsRef.current.add(itemInLoop.id);
            console.log(`Refreshing file reference for ${itemInLoop.name}...`);
            try {
                const updatedMediaObject = await telegramService.refreshFileReference(itemInLoop); 
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
                        setDownloadQueue(prevQ => prevQ.map(q_item => q_item.id === itemInLoop.id ? {
                            ...q_item,
                            status: 'downloading', 
                            location: newLocation,
                            telegramMessage: { ...(q_item.telegramMessage || {}), ...updatedMediaObject } 
                        } : q_item));
                        console.log(`File reference for ${itemInLoop.name} refreshed. Resuming download.`);
                    } else {
                         console.error(`Failed to construct new location after refreshing file reference for ${itemInLoop.name}. Media Object:`, updatedMediaObject);
                         setDownloadQueue(prevQ => prevQ.map(q_item => q_item.id === itemInLoop.id ? { ...q_item, status: 'failed', error_message: 'Refresh failed (new location error)' } : q_item));
                    }
                } else {
                    console.error(`Failed to refresh file reference for ${itemInLoop.name}. Setting to failed. Response:`, updatedMediaObject);
                    setDownloadQueue(prevQ => prevQ.map(q_item => q_item.id === itemInLoop.id ? { ...q_item, status: 'failed', error_message: 'Refresh failed (no reference)' } : q_item));
                }
            } catch (refreshError: any) {
                console.error(`Error during file reference refresh for ${itemInLoop.name}:`, refreshError);
                setDownloadQueue(prevQ => prevQ.map(q_item => q_item.id === itemInLoop.id ? { ...q_item, status: 'failed', error_message: refreshError.message || 'Refresh error' } : q_item));
            } finally {
                activeDownloadsRef.current.delete(itemInLoop.id);
            }
        } else if (['paused', 'completed', 'failed', 'cancelled'].includes(itemInLoop.status) ) {
            if(activeDownloadsRef.current.has(itemInLoop.id)){
                activeDownloadsRef.current.delete(itemInLoop.id);
            }
        }
      }
    };

    const intervalId = setInterval(processQueue, 750); 

    return () => {
        clearInterval(intervalId);
        // Abort any ongoing downloads when component unmounts or downloadQueue changes significantly
        downloadQueue.forEach(item => {
            if (item.status === 'downloading' && item.abortController && !item.abortController.signal.aborted) {
                item.abortController.abort();
            }
        });
        activeDownloadsRef.current.clear(); 
    };
  }, [downloadQueue]); 


  const fetchInitialChats = async () => {
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
      handleApiError(error, "Error Fetching Chats", `Could not load your chats. ${error.message}`);
    } finally {
      setIsProcessingChats(false);
    }
  };

  const loadMoreChatsCallback = useCallback(async () => {
    if (isLoadingMoreChats || !hasMoreChats || !isConnected || isProcessingChats) return;
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
    }
  }, [isConnected, isProcessingChats, isLoadingMoreChats, hasMoreChats, chatsOffsetDate, chatsOffsetId, chatsOffsetPeer, toast]);

  const lastChatElementRef = useCallback((node: HTMLLIElement | null) => {
    if (isLoadingMoreChats || isProcessingChats) return;
    if (observerChats.current) observerChats.current.disconnect();
    observerChats.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMoreChats && !isLoadingMoreChats && !isProcessingChats) {
        loadMoreChatsCallback();
      }
    });
    if (node) observerChats.current.observe(node);
  }, [isLoadingMoreChats, isProcessingChats, hasMoreChats, loadMoreChatsCallback]);
  const observerChats = useRef<IntersectionObserver | null>(null);


  const fetchInitialChatMedia = async (folder: CloudFolder) => {
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
  };

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
  }, [isLoadingChatMedia, hasMoreChatMedia, selectedFolder, currentMediaOffsetId, toast]);

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
  const observerMedia = useRef<IntersectionObserver | null>(null);

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

  const handleApiError = (error: any, title: string, defaultMessage: string) => {
    console.error(`${title}:`, error.message, error.originalErrorObject || error);
    let description = error.message || defaultMessage;
    if (error.message && error.message.includes("Invalid hash in mt_dh_gen_ok")) {
      description = "Connection handshake failed. Please check your API ID/Hash in .env.local, ensure it's correct, restart the server, and try clearing your browser's localStorage for this site.";
      setAuthError(description);
    } else if (error.message === 'AUTH_RESTART') {
        description = "Authentication process needs to be restarted. Please try entering your phone number again.";
        setAuthError(description); 
        handleReset(false); 
    } else {
        setAuthError(description); 
    }
    toast({ title, description, variant: "destructive", duration: error.message && error.message.includes("Invalid hash") ? 10000 : 5000 });
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
            handleApiError(error, "Authentication Restart Needed", `Please try entering your phone number again.`);
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

  const handleReset = async (performServerLogout = true) => {
    if (performServerLogout && isConnected) { 
        toast({ title: "Disconnecting...", description: "Logging out from Telegram." });
        try {
            await telegramService.signOut();
            toast({ title: "Disconnected", description: "Successfully signed out." });
        } catch (error: any) {
            toast({ title: "Disconnection Error", description: error.message || "Could not sign out properly from server.", variant: "destructive" });
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
    setHasMoreChats(true);
    setChatsOffsetDate(0);
    setChatsOffsetId(0);
    setChatsOffsetPeer({ _: 'inputPeerEmpty' });

    setIsLoadingChatMedia(false);
    setHasMoreChatMedia(true);
    setCurrentMediaOffsetId(0);

    downloadQueue.forEach(item => {
      if (item.abortController && !item.abortController.signal.aborted) {
        item.abortController.abort();
      }
    });
    setDownloadQueue([]);
    activeDownloadsRef.current.clear();
  };

  const handleOpenFileDetails = (file: CloudFile) => {
    setSelectedFileForDetails(file);
    setIsDetailsPanelOpen(true);
  };

  const handleCloseFileDetails = () => {
    setIsDetailsPanelOpen(false);
    setSelectedFileForDetails(null);
  };

  const handleQueueDownload = async (file: CloudFile) => {
    const existingItem = downloadQueue.find(item => item.id === file.id);
    if (existingItem && ['downloading', 'queued', 'paused', 'refreshing_reference'].includes(existingItem.status)) {
      toast({ title: "Already in Queue", description: `${file.name} is already being processed or queued.` });
      setIsDownloadManagerOpen(true); 
      return;
    }
    if (existingItem && existingItem.status === 'completed') {
        toast({ title: "Already Downloaded", description: `${file.name} has already been downloaded. If you want to download again, clear it from the list.`});
        setIsDownloadManagerOpen(true);
        return;
    }


    toast({ title: "Preparing Download...", description: `Getting details for ${file.name}.` });
    const downloadInfo = await telegramService.prepareFileDownloadInfo(file);

    if (downloadInfo && downloadInfo.location && downloadInfo.totalSize > 0 && file.totalSizeInBytes) {
      const controller = new AbortController();
      const newItem: DownloadQueueItemType = {
        id: file.id,
        name: file.name,
        type: file.type,
        size: formatFileSize(downloadInfo.totalSize),
        lastModified: file.lastModified,
        url: file.url,
        dataAiHint: file.dataAiHint,
        messageId: file.messageId,
        telegramMessage: file.telegramMessage,
        inputPeer: file.inputPeer,
        status: 'downloading', 
        progress: 0,
        downloadedBytes: 0,
        currentOffset: 0,
        chunks: [],
        location: downloadInfo.location,
        totalSizeInBytes: file.totalSizeInBytes, 
        abortController: controller,
      };
      setDownloadQueue(prevQueue => {
        const filteredQueue = prevQueue.filter(item => item.id !== file.id);
        return [...filteredQueue, newItem];
      });
      setIsDownloadManagerOpen(true); 
      toast({ title: "Download Started", description: `${file.name} added to queue and started.` });
    } else {
      toast({ title: "Download Failed", description: `Could not prepare ${file.name} for download. File info missing or invalid. Size: ${file.totalSizeInBytes}`, variant: "destructive" });
    }
  };

  const handleCancelDownload = (itemId: string) => {
    setDownloadQueue(prevQueue =>
      prevQueue.map(item => {
        if (item.id === itemId) {
          if (item.abortController && !item.abortController.signal.aborted) {
            item.abortController.abort(); 
            console.log(`Abort signal sent for item ${itemId}`);
          }
          return { ...item, status: 'cancelled', progress: 0, downloadedBytes: 0, chunks: [], currentOffset: 0 };
        }
        return item;
      })
    );
    toast({ title: "Download Cancelled", description: `Download for item has been cancelled.`});
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
    const itemToResume = downloadQueue.find(item => item.id === itemId);
    if (itemToResume && (itemToResume.status === 'failed' || itemToResume.status === 'cancelled')) {
        console.log(`Retrying download for ${itemToResume.name}`);
        // Remove the failed/cancelled item and re-queue
        setDownloadQueue(prevQ => prevQ.filter(q => q.id !== itemId));
        // Wait for state to update then re-queue to ensure it's a fresh start
        setTimeout(() => {
            const originalFileProps: CloudFile = {
                id: itemToResume.id,
                name: itemToResume.name,
                type: itemToResume.type,
                size: itemToResume.size,
                lastModified: itemToResume.lastModified,
                url: itemToResume.url, 
                dataAiHint: itemToResume.dataAiHint,
                messageId: itemToResume.messageId,
                telegramMessage: itemToResume.telegramMessage,
                totalSizeInBytes: itemToResume.totalSizeInBytes, 
                inputPeer: itemToResume.inputPeer,
            };
            handleQueueDownload(originalFileProps); 
        }, 100);
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

  const handlePlayVideo = (file: CloudFile) => {
     if (file.type === 'video' && file.url) { 
      setPlayingVideoUrl(file.url);
      setPlayingVideoName(file.name);
      setIsVideoPlayerOpen(true);
    } else if (file.type === 'video' && !file.url) {
      toast({ title: "Playback Not Available", description: "Video URL not available for playback. Try downloading first.", variant: "default"});
    } else if (file.type !== 'video') {
      toast({ title: "Not a Video", description: "This file is not a video and cannot be played here.", variant: "default"});
    }
  };

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
            setPhoneNumber={setPhoneNumber} 
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
      <div className="flex-grow flex container mx-auto px-0 sm:px-2 lg:px-4 py-4 overflow-hidden">
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
          {!isLoadingMoreChats && !hasMoreChats && allChats.length > 0 && ( 
            <p className="text-center text-xs text-muted-foreground py-2 mt-2">No more chats to load.</p>
          )}
        </aside>

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
        onClose={() => setIsVideoPlayerOpen(false)}
        videoUrl={playingVideoUrl}
        videoName={playingVideoName}
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

    