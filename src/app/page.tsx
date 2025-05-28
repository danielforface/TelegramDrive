
"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Header } from "@/components/layout/header";
import { TelegramConnect } from "@/components/telegram-connect";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import { MainContentView } from "@/components/main-content-view/main-content-view";
import type { CloudFolder } from "@/types";
import { Button } from "@/components/ui/button";
import { RefreshCw, Loader2, LayoutPanelLeft, FolderClosed } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import * as telegramService from "@/services/telegramService";

const INITIAL_LOAD_LIMIT = 20;
const SUBSEQUENT_LOAD_LIMIT = 5;

type AuthStep = 'initial' | 'awaiting_code' | 'awaiting_password';

export default function Home() {
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isProcessingChats, setIsProcessingChats] = useState(false);
  const [allChats, setAllChats] = useState<CloudFolder[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const { toast } = useToast();

  const [authStep, setAuthStep] = useState<AuthStep>('initial');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [phoneCode, setPhoneCode] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);

  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMoreChats, setHasMoreChats] = useState(true);
  const [offsetDate, setOffsetDate] = useState(0);
  const [offsetId, setOffsetId] = useState(0);
  const [offsetPeer, setOffsetPeer] = useState<any>({ _: 'inputPeerEmpty' });

  const checkExistingConnection = useCallback(async () => {
    console.log("Checking existing connection...");
    try {
      const previouslyConnected = await telegramService.isUserConnected();
      if (previouslyConnected) {
        console.log("User was previously connected. Setting state and fetching chats.");
        setIsConnected(true);
        setAuthStep('initial');
        setAuthError(null);
        fetchChats(true); // Initial fetch
      } else {
        console.log("No existing connection found or session invalid.");
        setIsConnected(false);
        handleReset(false);
      }
    } catch (error: any) {
      console.warn("Error checking existing connection:", error.message);
      setIsConnected(false);
      setAuthError(`Failed to check connection: ${error.message}`);
    }
  }, []);

  useEffect(() => {
    checkExistingConnection();
  }, [checkExistingConnection]);

  const fetchChats = async (isInitialLoad = true) => {
    if (!isInitialLoad && (isLoadingMore || !hasMoreChats)) return;

    if (isInitialLoad) {
      setIsProcessingChats(true);
      setAllChats([]);
      setSelectedFolderId(null);
      setAuthError(null);
      setOffsetDate(0);
      setOffsetId(0);
      setOffsetPeer({ _: 'inputPeerEmpty' });
      setHasMoreChats(true);
      toast({ title: "Fetching Chats...", description: "Loading your Telegram conversations." });
    } else {
      setIsLoadingMore(true);
      toast({ title: "Loading More Chats...", description: "Fetching the next batch of conversations." });
    }

    try {
      const currentOffsetDate = isInitialLoad ? 0 : offsetDate;
      const currentOffsetId = isInitialLoad ? 0 : offsetId;
      const currentOffsetPeer = isInitialLoad ? { _: 'inputPeerEmpty' } : offsetPeer;
      const limit = isInitialLoad ? INITIAL_LOAD_LIMIT : SUBSEQUENT_LOAD_LIMIT;

      const response = await telegramService.getTelegramChats(limit, currentOffsetDate, currentOffsetId, currentOffsetPeer);

      setAllChats(prevData => isInitialLoad ? response.folders : [...prevData, ...response.folders]);
      
      setOffsetDate(response.nextOffsetDate);
      setOffsetId(response.nextOffsetId);
      setOffsetPeer(response.nextOffsetPeer);
      setHasMoreChats(response.hasMore);

      if (isInitialLoad) {
        if (response.folders.length === 0 && !response.hasMore) {
          toast({ title: "No Chats Found", description: "Your Telegram chat list appears to be empty.", variant: "default" });
        } else if (response.folders.length > 0) {
          toast({ title: "Chats Loaded!", description: `Loaded ${response.folders.length} initial chats.` });
        }
      } else {
         if (response.folders.length > 0) {
           toast({ title: "More Chats Loaded!", description: `Loaded ${response.folders.length} additional chats.` });
        } else if (!response.hasMore) {
           toast({ title: "All Chats Loaded", description: "You've reached the end of your chat list."});
        }
      }
    } catch (error: any) {
      console.error(`Error ${isInitialLoad ? 'fetching initial' : 'loading more'} chats:`, error);
      const description = error.message || `Could not ${isInitialLoad ? 'load your' : 'load more'} chats.`;
      toast({ title: `Error ${isInitialLoad ? 'Fetching' : 'Loading More'} Chats`, description, variant: "destructive" });
      setAuthError(description);
      if (!isInitialLoad) setHasMoreChats(false);
    } finally {
      if (isInitialLoad) setIsProcessingChats(false);
      else setIsLoadingMore(false);
    }
  };

  const loadMoreChats = useCallback(() => {
     if (isLoadingMore || !hasMoreChats || !isConnected || isProcessingChats) return;
     fetchChats(false);
  }, [isLoadingMore, hasMoreChats, isConnected, isProcessingChats, offsetDate, offsetId, offsetPeer]);

  const observer = useRef<IntersectionObserver | null>(null);
  const lastChatElementRef = useCallback((node: HTMLLIElement | null) => {
    if (isLoadingMore || isProcessingChats) return;
    if (observer.current) observer.current.disconnect();

    observer.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMoreChats && !isLoadingMore && !isProcessingChats) {
        loadMoreChats();
      }
    });

    if (node) observer.current.observe(node);
  }, [isLoadingMore, isProcessingChats, hasMoreChats, loadMoreChats]);

  const handleSendCode = async (currentPhoneNumber: string) => {
    if (!currentPhoneNumber) {
      setAuthError("Phone number is required.");
      return;
    }
    setIsConnecting(true);
    setAuthError(null);
    toast({ title: "Sending Code...", description: "Requesting verification code from Telegram." });
    try {
      await telegramService.sendCode(currentPhoneNumber);
      setPhoneNumber(currentPhoneNumber);
      setAuthStep('awaiting_code');
      toast({ title: "Code Sent!", description: "Please check Telegram for your verification code." });
    } catch (error: any) {
      console.error("Error in handleSendCode:", error.message, error);
      if (error.message === 'AUTH_RESTART') {
        toast({
          title: "Authentication Restarted",
          description: "The authentication process needs to be restarted. Please try entering your phone number again.",
          variant: "destructive",
        });
        handleReset(false);
      } else if (error.message && error.message.includes("Invalid hash in mt_dh_gen_ok")) {
        toast({
          title: "Connection Handshake Failed",
          description: "Could not establish a secure connection. Please check your API ID/Hash in .env.local, ensure it's correct, restart the server, and try clearing your browser's localStorage for this site.",
          variant: "destructive",
          duration: 10000,
        });
        setAuthError("Connection handshake failed. Check API credentials and localStorage. See console for details.");
      } else {
        setAuthError(error.message || "Failed to send code. Please check the phone number and try again.");
        toast({ title: "Error Sending Code", description: error.message || "Failed to send code.", variant: "destructive" });
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
      const result = await telegramService.signIn(currentPhoneCode);
      if (result.user) {
        setIsConnected(true);
        setAuthStep('initial');
        setPhoneCode('');
        setPassword('');
        fetchChats(true);
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
        console.error("Error signing in (handleSignIn):", error.message, error);
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
        fetchChats(true);
        toast({ title: "2FA Successful!", description: "Connected to Telegram." });
      } else {
        setAuthError("2FA failed. Unexpected response from server.");
        toast({ title: "2FA Failed", description: "Unexpected response from server.", variant: "destructive" });
      }
    } catch (error: any) {
      console.error("Error checking password (handleCheckPassword):", error.message, error);
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
    setSelectedFolderId(null);
    setIsConnecting(false);
    setAuthStep('initial');
    setPhoneNumber('');
    setPhoneCode('');
    setPassword('');
    setAuthError(null);
    setIsLoadingMore(false);
    setHasMoreChats(true);
    setOffsetDate(0);
    setOffsetId(0);
    setOffsetPeer({ _: 'inputPeerEmpty' });
  };

  const selectedFolderData = allChats.find(folder => folder.id === selectedFolderId) || null;

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
            onReset={() => handleReset(false)}
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
      <Header />
      <div className="flex-grow flex container mx-auto px-0 sm:px-2 lg:px-4 py-4 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-64 md:w-72 lg:w-80 p-4 border-r bg-card overflow-y-auto flex-shrink-0">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold text-primary">Chats</h2>
            <Button variant="outline" size="sm" onClick={() => handleReset(true)} title="Disconnect and Reset">
              <RefreshCw className="h-4 w-4" />
            </Button>
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
                <Button onClick={() => fetchChats(true)} variant="link" className="mt-2">Try Refreshing</Button>
            </div>
          ) : authError && allChats.length === 0 ? (
            <div className="text-center py-4 text-destructive">
              <p>{authError}</p>
              <Button onClick={() => fetchChats(true)} variant="link" className="mt-2">Try Refreshing</Button>
            </div>
          ) : (
            <SidebarNav
              folders={allChats}
              selectedFolderId={selectedFolderId}
              onSelectFolder={setSelectedFolderId}
              lastItemRef={lastChatElementRef}
            />
          )}
          {isLoadingMore && (
            <div className="flex justify-center items-center p-2 mt-2">
              <Loader2 className="animate-spin h-5 w-5 text-primary" />
              <p className="ml-2 text-sm text-muted-foreground">Loading more...</p>
            </div>
          )}
          {!isLoadingMore && !hasMoreChats && allChats.length > 0 && (
            <p className="text-center text-xs text-muted-foreground py-2 mt-2">No more chats to load.</p>
          )}
        </aside>

        {/* Main Content */}
        <main className="flex-grow p-4 md:p-6 lg:p-8 overflow-y-auto">
          {selectedFolderData ? (
            <MainContentView folder={selectedFolderData} />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
              <LayoutPanelLeft className="w-16 h-16 mb-4 opacity-50" />
              <p className="text-lg">Select a chat from the sidebar to view its content.</p>
              {allChats.length > 0 && <p className="text-sm mt-1">Or scroll to load more chats.</p>}
            </div>
          )}
        </main>
      </div>
      <footer className="py-3 px-4 sm:px-6 lg:px-8 text-center border-t text-xs">
        <p className="text-muted-foreground">
          Telegram Cloudifier &copy; {new Date().getFullYear()}
        </p>
      </footer>
    </div>
  );
}

    