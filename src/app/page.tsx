
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
import { RefreshCw, Loader2, LayoutPanelLeft, FolderClosed } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import * as telegramService from "@/services/telegramService";

const INITIAL_CHATS_LOAD_LIMIT = 20;
const SUBSEQUENT_CHATS_LOAD_LIMIT = 5;
const INITIAL_MEDIA_LOAD_LIMIT = 20;
const SUBSEQUENT_MEDIA_LOAD_LIMIT = 20;


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
      console.warn("Error checking existing connection:", error.message);
      setIsConnected(false);
      handleReset(false);
      // Do not set authError here as it might show up on initial load unnecessarily
      // setAuthError(`Failed to check connection: ${error.message}`);
    }
  }, []); 

  useEffect(() => {
    checkExistingConnection();
  }, [checkExistingConnection]);

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
      handleApiError(error, "Error Fetching Chats", `Could not load your chats.`);
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
      handleApiError(error, "Error Loading More Chats", `Could not load more chats.`);
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
      handleApiError(error, `Error Fetching Media for ${folder.name}`, "Could not load media items.");
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
      handleApiError(error, "Error Loading More Media", `Could not load more media items.`);
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
    console.error(`${title}:`, error);
    const description = error.message || defaultMessage;
    toast({ title, description, variant: "destructive" });
    setAuthError(description); 
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
      const errorMessage = error.message || "An unexpected error occurred.";
      console.error("Error in handleSendCode:", errorMessage, error.originalErrorObject || error);
      if (errorMessage === 'AUTH_RESTART' || (error.originalErrorObject?.error_message === 'AUTH_RESTART')) {
        toast({
          title: "Authentication Restarted",
          description: "The authentication process needs to be restarted. Please try entering your phone number again.",
          variant: "destructive",
        });
        handleReset(false);
      } else if (errorMessage && errorMessage.includes("Invalid hash in mt_dh_gen_ok")) {
        toast({
          title: "Connection Handshake Failed",
          description: "Could not establish a secure connection. Please check your API ID/Hash in .env.local, ensure it's correct, restart the server, and try clearing your browser's localStorage for this site.",
          variant: "destructive",
          duration: 10000, 
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
      return;
    }
    setIsConnecting(true);
    setAuthError(null);
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
      return;
    }
    setIsConnecting(true);
    setAuthError(null);
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
      toast({ title: "2FA Failed", description: error.message || "Invalid password or other issue.", variant: "destructive" });
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
    setDownloadQueue([]);
  };

  const handleOpenFileDetails = (file: CloudFile) => {
    setSelectedFileForDetails(file);
    setIsDetailsPanelOpen(true);
  };

  const handleCloseFileDetails = () => {
    setIsDetailsPanelOpen(false);
    // setSelectedFileForDetails(null); // Keep selected file to avoid flicker if re-opened quickly
  };

  const handleQueueDownload = (file: CloudFile) => {
    console.log("Download queued for:", file.name);
    setDownloadQueue(prevQueue => {
      // Avoid adding duplicates if already in queue (optional)
      if (prevQueue.find(item => item.id === file.id)) {
        toast({ title: "Already in Queue", description: `${file.name} is already in the download queue.`});
        return prevQueue;
      }
      const newItem: DownloadQueueItemType = { ...file, status: 'queued', progress: 0 };
      return [...prevQueue, newItem];
    });
    setIsDownloadManagerOpen(true);
    // This is where you would call the actual download logic in a real scenario
    // For now, we just log the preparation info from telegramService
    telegramService.prepareFileDownloadInfo(file);
  };


  const handleViewImage = (file: CloudFile) => {
    if (file.type === 'image' && file.url) {
      setViewingImageUrl(file.url);
      setViewingImageName(file.name);
      setIsImageViewerOpen(true);
    } else if (file.type === 'image' && !file.url) {
      toast({ title: "Cannot View Image", description: "Image URL is not available for preview. Actual download needed.", variant: "destructive"});
      // Potentially try to fetch URL here if needed
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
      toast({ title: "Cannot Play Video", description: "Video URL is not available for playback. Actual download needed.", variant: "destructive"});
      // Potentially try to fetch URL here if needed
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
      />
    </div>
  );
}
