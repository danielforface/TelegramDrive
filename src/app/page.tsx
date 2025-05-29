
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
import { RefreshCw, Loader2, LayoutPanelLeft, FolderClosed } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import * as telegramService from "@/services/telegramService";

const INITIAL_CHATS_LOAD_LIMIT = 20;
const SUBSEQUENT_CHATS_LOAD_LIMIT = 5;
const INITIAL_MEDIA_LOAD_LIMIT = 20;
const SUBSEQUENT_MEDIA_LOAD_LIMIT = 20;
const DOWNLOAD_CHUNK_SIZE = 512 * 1024; // 512KB per chunk


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
            setPhoneNumber(storedUser.phone); // Restore phone number for display if needed
        }
        console.log("User was previously connected. Setting state and fetching chats.");
        setIsConnected(true);
        setAuthStep('initial'); // Reset auth flow
        setAuthError(null);
        fetchInitialChats(); // Fetch chats for already connected user
      } else {
        console.log("No existing connection found or session invalid.");
        setIsConnected(false);
        handleReset(false); // Reset local state without server logout if not truly connected
      }
    } catch (error: any) {
      console.warn("Error checking existing connection:", error.message, error.originalErrorObject || error);
      setIsConnected(false);
      handleReset(false);
    }
  }, []); // Add dependencies if they are used from outer scope and can change

  useEffect(() => {
    checkExistingConnection();
  }, [checkExistingConnection]);


  useEffect(() => {
    const processQueue = async () => {
      for (const item of downloadQueue) {
        if (item.status === 'downloading' &&
            item.location && // Ensure location is set
            item.totalSizeInBytes && // Ensure total size is known
            item.downloadedBytes < item.totalSizeInBytes &&
            !activeDownloadsRef.current.has(item.id) // Not already being processed
            ) {

          activeDownloadsRef.current.add(item.id); // Mark as active

          try {
            const currentOffset = item.currentOffset || 0;
            const remainingBytes = item.totalSizeInBytes - currentOffset;
            let limit = Math.min(DOWNLOAD_CHUNK_SIZE, remainingBytes);

            if (limit <= 0) { // Should not happen if downloadedBytes < totalSizeInBytes
               setDownloadQueue(prevQ => prevQ.map(q => q.id === item.id ? { ...q, status: 'completed', progress: 100 } : q));
               activeDownloadsRef.current.delete(item.id);
               continue;
            }

            let chunkResponse: telegramService.FileChunkResponse;

            if (item.cdnFileToken && item.cdnDcId && item.cdnFileHashes && item.cdnEncryptionKey && item.cdnEncryptionIv) {
                // CDN Download Path
                // For simplicity, we'll try to download CDN blocks as defined by cdnFileHashes
                // A more robust solution would handle partial block downloads if DOWNLOAD_CHUNK_SIZE is smaller than CDN block limits
                const currentHashBlockIndex = item.cdnCurrentFileHashIndex || 0;
                if (currentHashBlockIndex >= item.cdnFileHashes.length) {
                    console.log(`All CDN blocks processed for ${item.name}. Finalizing.`);
                    // This state should ideally be caught by downloadedBytes >= totalSizeInBytes
                    setDownloadQueue(prevQ => prevQ.map(q => q.id === item.id ? { ...q, status: 'completed', progress: 100 } : q));
                    activeDownloadsRef.current.delete(item.id);
                    continue;
                }
                const cdnBlock = item.cdnFileHashes[currentHashBlockIndex];
                // Here, we assume we download the whole CDN block. A more advanced implementation
                // would use item.currentOffset relative to cdnBlock.offset and manage smaller chunks.
                // For this iteration, we use cdnBlock.offset and cdnBlock.limit.
                // Ensure item.currentOffset matches cdnBlock.offset for this simplified approach.
                if (item.currentOffset !== cdnBlock.offset) {
                    console.warn(`CDN download for ${item.name}: currentOffset ${item.currentOffset} does not match CDN block offset ${cdnBlock.offset}. Adjusting or this might be an issue.`);
                    // This indicates a mismatch in logic. For now, we'll proceed assuming we download the whole block.
                }

                console.log(`Processing CDN download for ${item.name}, DC: ${item.cdnDcId}, Block ${currentHashBlockIndex}, Offset: ${cdnBlock.offset}, Limit: ${cdnBlock.limit}`);
                chunkResponse = await telegramService.downloadCdnFileChunk(
                    {
                        dc_id: item.cdnDcId,
                        file_token: item.cdnFileToken,
                        encryption_key: item.cdnEncryptionKey, // For decryption (not implemented)
                        encryption_iv: item.cdnEncryptionIv,   // For decryption (not implemented)
                        file_hashes: item.cdnFileHashes,
                    },
                    cdnBlock.offset, // Use CDN block's offset
                    cdnBlock.limit,  // Use CDN block's limit
                    item.abortController?.signal
                );
                // After fetching chunkResponse.bytes:
                // 1. Decrypt if needed (not implemented)
                // 2. Verify hash:
                if (chunkResponse.bytes) {
                    const downloadedHash = await telegramService.calculateSHA256(chunkResponse.bytes);
                    if (!telegramService.areUint8ArraysEqual(downloadedHash, cdnBlock.hash)) {
                        console.error(`CDN Hash mismatch for ${item.name}, block ${currentHashBlockIndex}. Expected ${cdnBlock.hash}, got ${downloadedHash}`);
                        setDownloadQueue(prevQ => prevQ.map(q => q.id === item.id ? { ...q, status: 'failed', progress: item.progress } : q)); // Keep current progress
                        activeDownloadsRef.current.delete(item.id);
                        continue;
                    }
                    console.log(`CDN Hash verified for ${item.name}, block ${currentHashBlockIndex}`);
                }


            } else {
                // Direct Download Path
                console.log(`Processing direct download for ${item.name}, offset: ${currentOffset}, limit: ${limit}`);
                chunkResponse = await telegramService.downloadFileChunk(
                    item.location,
                    currentOffset,
                    limit,
                    item.abortController?.signal
                );
            }


            if (item.abortController?.signal.aborted) {
              console.log(`Download for ${item.name} was aborted during chunk fetch.`);
              activeDownloadsRef.current.delete(item.id); // Ensure it's removed if aborted
              continue;
            }

            if (chunkResponse?.isCdnRedirect && chunkResponse.cdnRedirectData) {
                console.log(`CDN Redirect for ${item.name}. Updating queue item.`);
                setDownloadQueue(prevQ => prevQ.map(q => q.id === item.id ? {
                    ...q,
                    status: 'downloading', // Stay in downloading to re-process with CDN info
                    cdnDcId: chunkResponse.cdnRedirectData!.dc_id,
                    cdnFileToken: chunkResponse.cdnRedirectData!.file_token,
                    cdnEncryptionKey: chunkResponse.cdnRedirectData!.encryption_key,
                    cdnEncryptionIv: chunkResponse.cdnRedirectData!.encryption_iv,
                    cdnFileHashes: chunkResponse.cdnRedirectData!.file_hashes.map(fh => ({ // Map to our FileHash type
                        offset: Number(fh.offset), // Ensure number
                        limit: fh.limit,
                        hash: fh.hash,
                    })),
                    cdnCurrentFileHashIndex: 0, // Start with the first hash block
                    currentOffset: 0, // Reset offset for CDN block processing
                    downloadedBytes: 0, // Reset downloaded bytes for CDN
                    progress: 0, // Reset progress
                    chunks: [], // Clear previous chunks if any
                } : q));
            } else if (chunkResponse?.errorType === 'FILE_REFERENCE_EXPIRED') {
                console.log(`File reference expired for ${item.name}. Attempting to refresh.`);
                setDownloadQueue(prevQ => prevQ.map(q => q.id === item.id ? { ...q, status: 'refreshing_reference' } : q));

            } else if (chunkResponse?.bytes) {
              // Determine if this was a CDN block download or a regular chunk
              const chunkSize = chunkResponse.bytes.length;
              const newDownloadedBytes = (item.cdnFileToken ? item.downloadedBytes : currentOffset) + chunkSize;
              const newProgress = Math.min(100, Math.floor((newDownloadedBytes / item.totalSizeInBytes) * 100));
              const newChunks = [...(item.chunks || []), chunkResponse.bytes];
              let nextCdnHashIndex = item.cdnCurrentFileHashIndex;

              if(item.cdnFileToken) { // If it was a CDN download
                nextCdnHashIndex = (item.cdnCurrentFileHashIndex || 0) + 1;
              }

              setDownloadQueue(prevQ =>
                prevQ.map(q => {
                  if (q.id === item.id) {
                    if (newDownloadedBytes >= item.totalSizeInBytes!) {
                      // Download complete
                      const fullFileBlob = new Blob(newChunks, { type: item.telegramMessage?.mime_type || 'application/octet-stream' });
                      const url = URL.createObjectURL(fullFileBlob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = item.name;
                      document.body.appendChild(a);
                      a.click();
                      document.body.removeChild(a);
                      URL.revokeObjectURL(url);
                      console.log(`File ${item.name} downloaded and saved.`);
                      return { ...q, status: 'completed', progress: 100, downloadedBytes: newDownloadedBytes, chunks: [], cdnCurrentFileHashIndex: undefined };
                    }
                    // Continue download
                    return {
                      ...q,
                      downloadedBytes: newDownloadedBytes,
                      progress: newProgress,
                      currentOffset: item.cdnFileToken ? (item.cdnFileHashes && nextCdnHashIndex < item.cdnFileHashes.length ? item.cdnFileHashes[nextCdnHashIndex].offset : item.totalSizeInBytes) : newDownloadedBytes,
                      chunks: newChunks,
                      cdnCurrentFileHashIndex: item.cdnFileToken ? nextCdnHashIndex : undefined,
                    };
                  }
                  return q;
                })
              );
            } else {
              // Handle other errors or empty responses
              console.error(`Failed to download chunk for ${item.name} or no data returned and not a known error. Response:`, chunkResponse);
              setDownloadQueue(prevQ => prevQ.map(q => q.id === item.id ? { ...q, status: 'failed' } : q));
            }
          } catch (error: any) {
             if (error.name === 'AbortError') {
                console.log(`Download for ${item.name} aborted by user (caught in processQueue).`);
                // Status might have already been set to 'cancelled' by handleCancelDownload
             } else {
                console.error(`Error processing download for ${item.name}:`, error);
                setDownloadQueue(prevQ => prevQ.map(q => q.id === item.id ? { ...q, status: 'failed' } : q));
             }
          } finally {
             activeDownloadsRef.current.delete(item.id); // Remove from active processing
          }
        } else if (item.status === 'refreshing_reference' && !activeDownloadsRef.current.has(item.id)) {
            activeDownloadsRef.current.add(item.id);
            console.log(`Refreshing file reference for ${item.name}...`);
            try {
                const updatedMediaObject = await telegramService.refreshFileReference(item); // Pass the whole item
                if (updatedMediaObject && updatedMediaObject.file_reference) {
                    // Construct a new location object based on the type of updatedMediaObject
                    let newLocation;
                    if (updatedMediaObject._ === 'photo') {
                        const largestSize = updatedMediaObject.sizes?.find((s: any) => s.type === 'y') || updatedMediaObject.sizes?.sort((a: any, b: any) => (b.w * b.h) - (a.w * a.h))[0];
                        newLocation = {
                            _: 'inputPhotoFileLocation',
                            id: updatedMediaObject.id,
                            access_hash: updatedMediaObject.access_hash,
                            file_reference: updatedMediaObject.file_reference,
                            thumb_size: largestSize?.type || '',
                        };
                    } else if (updatedMediaObject._ === 'document') {
                        newLocation = {
                            _: 'inputDocumentFileLocation',
                            id: updatedMediaObject.id,
                            access_hash: updatedMediaObject.access_hash,
                            file_reference: updatedMediaObject.file_reference,
                            thumb_size: '',
                        };
                    }

                    if (newLocation) {
                        setDownloadQueue(prevQ => prevQ.map(q => q.id === item.id ? {
                            ...q,
                            status: 'downloading', // Back to downloading
                            location: newLocation,
                            telegramMessage: { ...item.telegramMessage, ...updatedMediaObject } // Update the stored message
                        } : q));
                        console.log(`File reference for ${item.name} refreshed. Resuming download.`);
                    } else {
                         console.error(`Failed to construct new location after refreshing file reference for ${item.name}.`);
                         setDownloadQueue(prevQ => prevQ.map(q => q.id === item.id ? { ...q, status: 'failed' } : q));
                    }
                } else {
                    console.error(`Failed to refresh file reference for ${item.name}. Setting to failed.`);
                    setDownloadQueue(prevQ => prevQ.map(q => q.id === item.id ? { ...q, status: 'failed' } : q));
                }
            } catch (refreshError: any) {
                console.error(`Error during file reference refresh for ${item.name}:`, refreshError);
                setDownloadQueue(prevQ => prevQ.map(q => q.id === item.id ? { ...q, status: 'failed' } : q));
            } finally {
                activeDownloadsRef.current.delete(item.id);
            }
        } else if (item.status === 'paused' || item.status === 'completed' || item.status === 'failed' || item.status === 'cancelled' ) {
            // Ensure inactive items are not in activeDownloadsRef
            if(activeDownloadsRef.current.has(item.id)){
                activeDownloadsRef.current.delete(item.id);
            }
        }
      }
    };

    // More frequent interval for faster UI updates and processing, but be mindful of performance
    const intervalId = setInterval(processQueue, 500); 

    return () => {
        clearInterval(intervalId);
        // Abort any ongoing downloads when the component unmounts
        downloadQueue.forEach(item => {
            if (item.status === 'downloading' && item.abortController && !item.abortController.signal.aborted) {
                item.abortController.abort();
            }
        });
        activeDownloadsRef.current.clear(); // Clear all active downloads on unmount
    };
  }, [downloadQueue]); // Re-run effect if downloadQueue changes


  const fetchInitialChats = async () => {
    if (isProcessingChats || isLoadingMoreChats) return;
    setIsProcessingChats(true);
    setAllChats([]);
    setSelectedFolder(null);
    setCurrentChatMedia([]);
    setAuthError(null);
    // Reset pagination for chats
    setChatsOffsetDate(0);
    setChatsOffsetId(0);
    setChatsOffsetPeer({ _: 'inputPeerEmpty' });
    setHasMoreChats(true); // Assume there are more chats until API confirms otherwise
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
      handleApiError(error, "Error Fetching Chats", `Could not load your chats. Check API keys in .env.local & restart server. ${error.message}`);
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
      setHasMoreChats(false); // Stop trying if there's an error
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
    setCurrentChatMedia([]); // Clear previous media
    setHasMoreChatMedia(true); // Assume more media
    setCurrentMediaOffsetId(0); // Reset offset for new folder
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
      setHasMoreChatMedia(false); // Stop trying if error
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
      fetchInitialChatMedia(folder); // Fetch media for the newly selected folder
    } else {
      setSelectedFolder(null);
      setCurrentChatMedia([]); // Clear media if no folder is selected
    }
  };

  const handleApiError = (error: any, title: string, defaultMessage: string) => {
    console.error(`${title}:`, error.message, error.originalErrorObject || error);
    const description = error.message || defaultMessage;
    toast({ title, description, variant: "destructive" });
    setAuthError(description); // Also set authError for display in connect screen if relevant
  };

  const handleSendCode = async (fullPhoneNumberFromConnect: string) => {
    if (!fullPhoneNumberFromConnect || !fullPhoneNumberFromConnect.startsWith('+') || fullPhoneNumberFromConnect.length < 5) { // Basic validation
      setAuthError("Phone number is required and must be valid (e.g. +972501234567).");
      toast({ title: "Invalid Phone Number", description: "Please select a country and enter a valid number.", variant: "destructive" });
      return;
    }
    setIsConnecting(true);
    setAuthError(null);
    setPhoneNumber(fullPhoneNumberFromConnect); // Store the full number for use in signIn/checkPassword
    toast({ title: "Sending Code...", description: `Requesting verification code for ${fullPhoneNumberFromConnect}.` });

    try {
      await telegramService.sendCode(fullPhoneNumberFromConnect);
      setAuthStep('awaiting_code');
      toast({ title: "Code Sent!", description: "Please check Telegram for your verification code." });
    } catch (error: any) {
      const errorMessage = error.message || "An unexpected error occurred.";
      console.error("Error in handleSendCode:", errorMessage, error.originalErrorObject || error);
      if (errorMessage === 'AUTH_RESTART' || (error.originalErrorObject?.error_message === 'AUTH_RESTART')) {
        toast({
          title: "Authentication Restarted",
          description: "The authentication process needs to be restarted. Please try entering your phone number again.",
          variant: "destructive",
        });
        handleReset(false); // Reset without server logout
      } else if (errorMessage && (errorMessage.includes("Invalid hash in mt_dh_gen_ok") || errorMessage.includes("Handshake failed"))) {
        toast({
          title: "Connection Handshake Failed",
          description: "Could not establish a secure connection. Please check your API ID/Hash in .env.local, ensure it's correct, restart the server, and try clearing your browser's localStorage for this site.",
          variant: "destructive",
          duration: 10000, // Longer duration for this critical error
        });
        setAuthError("Connection handshake failed. Check API credentials and localStorage. See console for details.");
      } else {
        setAuthError(errorMessage);
        toast({ title: "Error Sending Code", description: errorMessage, variant: "destructive" });
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
    setPhoneCode(currentPhoneCode); // Store it in case we need it (e.g. if API asks again, though unlikely here)
    toast({ title: "Verifying Code...", description: "Checking your verification code with Telegram." });
    try {
      const result = await telegramService.signIn(phoneNumber, currentPhoneCode); // Use the stored full phoneNumber
      if (result.user) {
        setIsConnected(true);
        setAuthStep('initial'); // Reset auth flow
        setPhoneCode(''); // Clear code
        setPassword('');   // Clear password
        fetchInitialChats();
        toast({ title: "Sign In Successful!", description: "Connected to Telegram." });
      } else {
        // This case should ideally be handled by errors thrown from signIn
        setAuthError("Sign in failed. Unexpected response from server.");
        toast({ title: "Sign In Failed", description: "Unexpected response from server.", variant: "destructive" });
      }
    } catch (error: any) {
      if (error.message === '2FA_REQUIRED' && (error as any).srp_id) {
        console.log("2FA required for sign in, srp_id received:", (error as any).srp_id);
        setAuthStep('awaiting_password');
        setAuthError(null); // Clear previous errors like "invalid code"
        toast({ title: "2FA Required", description: "Please enter your two-factor authentication password." });
      } else {
        console.log("Error signing in (handleSignIn):", error.message, error.originalErrorObject || error);
        setAuthError(error.message || "Sign in failed. Invalid code or other issue.");
        toast({ title: "Sign In Failed", description: error.message || "Invalid code or other issue.", variant: "destructive" });
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
    setPassword(currentPassword); // Store it
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
      console.error("Error checking password (handleCheckPassword):", error.message, error.originalErrorObject || error);
      setAuthError(error.message || "2FA failed. Invalid password or other issue.");
      toast({ title: "2FA Failed", description: error.message || "2FA failed. Invalid password or other issue.", variant: "destructive" });
    } finally {
      setIsConnecting(false);
    }
  };

  const handleReset = async (performServerLogout = true) => {
    if (performServerLogout && isConnected) { // Only try server logout if was actually connected
        toast({ title: "Disconnecting...", description: "Logging out from Telegram." });
        try {
            await telegramService.signOut();
            toast({ title: "Disconnected", description: "Successfully signed out." });
        } catch (error: any) {
            toast({ title: "Disconnection Error", description: error.message || "Could not sign out properly from server.", variant: "destructive" });
        }
    }

    // Reset all relevant states
    setIsConnected(false);
    setIsProcessingChats(false);
    setAllChats([]);
    setSelectedFolder(null);
    setCurrentChatMedia([]);
    setIsConnecting(false); // Ensure loading states are reset
    setAuthStep('initial');
    setPhoneNumber('');
    setPhoneCode('');
    setPassword('');
    setAuthError(null);

    // Reset pagination for chats
    setIsLoadingMoreChats(false);
    setHasMoreChats(true);
    setChatsOffsetDate(0);
    setChatsOffsetId(0);
    setChatsOffsetPeer({ _: 'inputPeerEmpty' });

    // Reset pagination for media
    setIsLoadingChatMedia(false);
    setHasMoreChatMedia(true);
    setCurrentMediaOffsetId(0);

    // Clear download queue and abort ongoing downloads
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
    // setSelectedFileForDetails(null); // Optional: clear selected file when panel closes
  };

  const handleQueueDownload = async (file: CloudFile) => {
    // Check if already in queue and not completed/failed/cancelled
    const existingItem = downloadQueue.find(item => item.id === file.id);
    if (existingItem && (existingItem.status === 'downloading' || existingItem.status === 'queued' || existingItem.status === 'paused' || existingItem.status === 'refreshing_reference')) {
      toast({ title: "Already in Queue", description: `${file.name} is already being processed or queued.` });
      setIsDownloadManagerOpen(true); // Open manager to show it
      return;
    }

    toast({ title: "Preparing Download...", description: `Getting details for ${file.name}.` });
    const downloadInfo = await telegramService.prepareFileDownloadInfo(file);

    if (downloadInfo && downloadInfo.location && downloadInfo.totalSize > 0) {
      const controller = new AbortController();
      const newItem: DownloadQueueItemType = {
        ...file, // Spread all properties of CloudFile
        status: 'downloading', // Start immediately, useEffect will pick it up
        progress: 0,
        downloadedBytes: 0,
        currentOffset: 0,
        chunks: [],
        location: downloadInfo.location,
        totalSizeInBytes: downloadInfo.totalSize, // This should be part of CloudFile or fetched here
        abortController: controller,
        // CDN fields will be populated if a redirect occurs
      };
      // Replace if exists (e.g., retrying a failed/cancelled download), otherwise add
      setDownloadQueue(prevQueue => {
        const filteredQueue = prevQueue.filter(item => item.id !== file.id);
        return [...filteredQueue, newItem];
      });
      setIsDownloadManagerOpen(true); // Open manager when a download is queued
      toast({ title: "Download Started", description: `${file.name} added to queue and started.` });
    } else {
      toast({ title: "Download Failed", description: `Could not prepare ${file.name} for download. File info missing or invalid.`, variant: "destructive" });
    }
  };

  const handleCancelDownload = (itemId: string) => {
    setDownloadQueue(prevQueue =>
      prevQueue.map(item => {
        if (item.id === itemId) {
          if (item.abortController && !item.abortController.signal.aborted) {
            item.abortController.abort(); // Signal abortion to the fetch request
            console.log(`Abort signal sent for item ${itemId}`);
          }
          return { ...item, status: 'cancelled', progress: 0, downloadedBytes: 0 };
        }
        return item;
      })
    );
    toast({ title: "Download Cancelled", description: `Download for item ${itemId} has been cancelled.`});
  };

  const handlePauseDownload = (itemId: string) => {
    setDownloadQueue(prevQueue =>
        prevQueue.map(item =>
            item.id === itemId && item.status === 'downloading' ? 
            {...item, status: 'paused'} : item
        )
    );
    toast({ title: "Download Paused", description: `Download for item ${itemId} has been paused.`});
  };

  const handleResumeDownload = (itemId: string) => {
    const itemToResume = downloadQueue.find(item => item.id === itemId);
    if (itemToResume && (itemToResume.status === 'failed' || itemToResume.status === 'cancelled')) {
        // For failed/cancelled, we re-queue it to start fresh, as file reference might be needed again or other issues.
        // This requires the original CloudFile properties.
        console.log(`Retrying download for ${itemToResume.name}`);
        // We need to reconstruct a CloudFile object from DownloadQueueItemType to pass to handleQueueDownload
        const originalFileProps: CloudFile = {
            id: itemToResume.id,
            name: itemToResume.name,
            type: itemToResume.type,
            size: itemToResume.size,
            lastModified: itemToResume.lastModified,
            url: itemToResume.url, // May or may not be present
            dataAiHint: itemToResume.dataAiHint,
            messageId: itemToResume.messageId,
            telegramMessage: itemToResume.telegramMessage,
            totalSizeInBytes: itemToResume.totalSizeInBytes, // totalSizeInBytes is crucial
            inputPeer: itemToResume.inputPeer,
        };
        handleQueueDownload(originalFileProps); // This will add it as a new 'downloading' item
        return;
    }

    setDownloadQueue(prevQueue =>
        prevQueue.map(item =>
            item.id === itemId && item.status === 'paused' ? 
            {...item, status: 'downloading'} : item // The useEffect will pick up 'downloading'
        )
    );
    toast({ title: "Download Resumed", description: `Download for item ${itemId} has been resumed.`});
  };


  const handleViewImage = (file: CloudFile) => {
    // For now, we assume file.url might be a direct URL or a placeholder
    // In a real scenario, for Telegram files, file.url might need to be fetched dynamically
    // or constructed (e.g., as a blob URL after fetching part of the file).
    if (file.type === 'image' && file.url) { // Check if URL is available
      setViewingImageUrl(file.url);
      setViewingImageName(file.name);
      setIsImageViewerOpen(true);
    } else if (file.type === 'image' && !file.url) {
      // TODO: Potentially try to fetch a temporary URL or first chunk to display
      toast({ title: "Preview Not Available", description: "Image URL not available for preview. Try downloading first.", variant: "default"});
    } else if (file.type !== 'image') {
      toast({ title: "Not an Image", description: "This file is not an image and cannot be viewed here.", variant: "default"});
    }
  };

  const handlePlayVideo = (file: CloudFile) => {
     if (file.type === 'video' && file.url) { // Check if URL is available
      setPlayingVideoUrl(file.url);
      setPlayingVideoName(file.name);
      setIsVideoPlayerOpen(true);
    } else if (file.type === 'video' && !file.url) {
      // TODO: Potentially try to fetch a temporary URL for streaming
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
            phoneNumber={phoneNumber} // Pass the full number for display in awaiting_code/password steps
            setPhoneNumber={setPhoneNumber} // Used by TelegramConnect for its internal state
            phoneCode={phoneCode}
            setPhoneCode={setPhoneCode}
            password={password}
            setPassword={setPassword}
            onReset={() => handleReset(authStep !== 'initial')} // Pass true if already past initial step
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
        {/* Sidebar for Chats */}
        <aside className="w-64 md:w-72 lg:w-80 p-4 border-r bg-card overflow-y-auto flex-shrink-0">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold text-primary">Chats</h2>
            {/* Optional: Add a refresh button for chats if needed */}
            {/* <Button variant="ghost" size="icon" onClick={fetchInitialChats} disabled={isProcessingChats || isLoadingMoreChats}>
              <RefreshCw className={cn("h-5 w-5", (isProcessingChats || isLoadingMoreChats) && "animate-spin")} />
            </Button> */}
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
              lastItemRef={lastChatElementRef} // For infinite scrolling of chats
            />
          )}
          {isLoadingMoreChats && (
            <div className="flex justify-center items-center p-2 mt-2">
              <Loader2 className="animate-spin h-5 w-5 text-primary" />
              <p className="ml-2 text-sm text-muted-foreground">Loading more chats...</p>
            </div>
          )}
          {!isLoadingMoreChats && !hasMoreChats && allChats.length > 0 && ( // Show only if there are some chats already
            <p className="text-center text-xs text-muted-foreground py-2 mt-2">No more chats to load.</p>
          )}
        </aside>

        {/* Main Content Area for Media */}
        <main className="flex-grow p-4 md:p-6 lg:p-8 overflow-y-auto">
          {selectedFolder ? (
            <MainContentView
              folderName={selectedFolder.name}
              files={currentChatMedia}
              isLoading={isLoadingChatMedia && currentChatMedia.length === 0} // Show loading only if list is empty
              hasMore={hasMoreChatMedia}
              lastItemRef={lastMediaItemRef} // For infinite scrolling of media
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
        onQueueDownload={handleQueueDownload} // Pass the queue download handler
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

