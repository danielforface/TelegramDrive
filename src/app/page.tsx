
"use client";

import { useState, useEffect, FormEvent, useRef, useCallback } from "react";
import { Header } from "@/components/layout/header";
import { TelegramConnect } from "@/components/telegram-connect";
import { CloudExplorer } from "@/components/cloud-explorer/cloud-explorer";
import { AnimatedCloudIcon } from "@/components/animated-cloud-icon";
import type { CloudFolder } from "@/types";
import { Button } from "@/components/ui/button";
import { RefreshCw, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import * as telegramService from "@/services/telegramService";
import { FolderItem } from "@/components/cloud-explorer/folder-item"; // For direct use of FolderItem for ref

const INITIAL_LOAD_LIMIT = 20;
const SUBSEQUENT_LOAD_LIMIT = 5;

type AuthStep = 'initial' | 'awaiting_code' | 'awaiting_password';

export default function Home() {
  const [isConnecting, setIsConnecting] = useState(false); // General loading state for auth operations
  const [isConnected, setIsConnected] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false); // For initial chat processing
  const [cloudData, setCloudData] = useState<CloudFolder[] | null>(null);
  const { toast } = useToast();

  const [authStep, setAuthStep] = useState<AuthStep>('initial');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [phoneCode, setPhoneCode] = useState('');
  const [password, setPassword] = useState('');
  const [phoneCodeHash, setPhoneCodeHash] = useState<string | null>(null);
  const [srpId, setSrpId] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  // Pagination state
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMoreChats, setHasMoreChats] = useState(true);
  const [offsetDate, setOffsetDate] = useState(0);
  const [offsetId, setOffsetId] = useState(0);
  const [offsetPeer, setOffsetPeer] = useState<any>({ _: 'inputPeerEmpty' });

  useEffect(() => {
    const checkExistingConnection = async () => {
      try {
        const previouslyConnected = await telegramService.isUserConnected();
        if (previouslyConnected) {
          setIsConnected(true);
          fetchChats(); // Fetch initial chats if already connected
        }
      } catch (error) {
        console.warn("Error checking existing connection:", error);
        // Potentially sign out or reset state if check fails critically
      }
    };
    // checkExistingConnection(); 
    // Keep commented for development to avoid auto-connect
  }, []);


  const fetchChats = async () => {
    setIsProcessing(true);
    setCloudData(null); // Clear existing data for a fresh fetch
    toast({ title: "Fetching Chats...", description: "Loading your Telegram conversations." });
    try {
      const response = await telegramService.getTelegramChats(INITIAL_LOAD_LIMIT, 0, 0, { _: 'inputPeerEmpty' });
      setCloudData(response.folders);
      setOffsetDate(response.nextOffsetDate);
      setOffsetId(response.nextOffsetId);
      setOffsetPeer(response.nextOffsetPeer);
      setHasMoreChats(response.hasMore);

      if (response.folders.length === 0) {
        toast({ title: "No Chats Found", description: "Your Telegram chat list appears to be empty or couldn't be loaded.", variant: "default" });
      } else {
        toast({ title: "Chats Loaded!", description: `Loaded ${response.folders.length} initial chats.` });
      }
    } catch (error: any) {
      console.error("Error fetching initial chats:", error);
      toast({ title: "Error Fetching Chats", description: error.message || "Could not load your chats.", variant: "destructive" });
    } finally {
      setIsProcessing(false);
    }
  };

  const loadMoreChats = useCallback(async () => {
    if (isLoadingMore || !hasMoreChats || !isConnected) return;

    setIsLoadingMore(true);
    toast({ title: "Loading More Chats...", description: "Fetching the next batch of conversations." });
    try {
      const response = await telegramService.getTelegramChats(SUBSEQUENT_LOAD_LIMIT, offsetDate, offsetId, offsetPeer);
      setCloudData(prevData => [...(prevData || []), ...response.folders]);
      setOffsetDate(response.nextOffsetDate);
      setOffsetId(response.nextOffsetId);
      setOffsetPeer(response.nextOffsetPeer);
      setHasMoreChats(response.hasMore);

      if (response.folders.length > 0) {
         toast({ title: "More Chats Loaded!", description: `Loaded ${response.folders.length} additional chats.` });
      } else if (!response.hasMore) {
         toast({ title: "All Chats Loaded", description: "You've reached the end of your chat list."});
      }

    } catch (error: any) {
      console.error("Error loading more chats:", error);
      toast({ title: "Error Loading More", description: error.message || "Could not load more chats.", variant: "destructive" });
      setHasMoreChats(false); // Stop trying if there's an error
    } finally {
      setIsLoadingMore(false);
    }
  }, [isLoadingMore, hasMoreChats, offsetDate, offsetId, offsetPeer, toast, isConnected]);

  // Intersection Observer for infinite scrolling
  const observer = useRef<IntersectionObserver | null>(null);
  const lastChatElementRef = useCallback((node: HTMLDivElement | null) => {
    if (isLoadingMore || isProcessing) return;
    if (observer.current) observer.current.disconnect();

    observer.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMoreChats && !isLoadingMore && !isProcessing) {
        loadMoreChats();
      }
    });

    if (node) observer.current.observe(node);
  }, [isLoadingMore, isProcessing, hasMoreChats, loadMoreChats]);


  const handleSendCode = async (currentPhoneNumber: string) => {
    if (!currentPhoneNumber) {
      setAuthError("Phone number is required.");
      return;
    }
    setIsConnecting(true);
    setAuthError(null);
    toast({ title: "Sending Code...", description: "Requesting verification code from Telegram." });
    try {
      const result_phone_code_hash = await telegramService.sendCode(currentPhoneNumber);
      setPhoneCodeHash(result_phone_code_hash);
      setPhoneNumber(currentPhoneNumber);
      setAuthStep('awaiting_code');
      toast({ title: "Code Sent!", description: "Please check Telegram for your verification code." });
    } catch (error: any) {
      if (error.message === 'AUTH_RESTART') {
        console.warn("AUTH_RESTART received. Resetting authentication flow.");
        toast({
          title: "Authentication Restarted",
          description: "The authentication process needs to be restarted. Please try again.",
          variant: "destructive",
        });
        handleReset(false);
      } else {
        console.error("Error sending code:", error);
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
    if (!phoneCodeHash || !phoneNumber) {
        setAuthError("Phone number or code hash is missing. Please start over.");
        handleReset(false);
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
        fetchChats();
        toast({ title: "Sign In Successful!", description: "Connected to Telegram." });
      } else {
        setAuthError("Sign in failed. Unexpected response.");
        toast({ title: "Sign In Failed", description: "Unexpected response from server.", variant: "destructive" });
      }
    } catch (error: any) {
      if (error.srp_id && error.message === '2FA_REQUIRED') {
        console.log("2FA required for sign in, srp_id received:", error.srp_id);
        setSrpId(error.srp_id);
        setAuthStep('awaiting_password');
        setAuthError("2FA password required.");
        toast({ title: "2FA Required", description: "Please enter your two-factor authentication password." });
      } else {
        console.error("Error signing in:", error);
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
    if (!srpId) {
        setAuthError("SRP ID is missing for 2FA. Please start over.");
        handleReset(false);
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
        fetchChats();
        toast({ title: "2FA Successful!", description: "Connected to Telegram." });
      } else {
        setAuthError("2FA failed. Unexpected response.");
        toast({ title: "2FA Failed", description: "Unexpected response from server.", variant: "destructive" });
      }
    } catch (error: any) {
      console.error("Error checking password:", error);
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
            toast({ title: "Disconnection Error", description: error.message || "Could not sign out properly.", variant: "destructive" });
        }
    }
    setIsConnected(false);
    setIsProcessing(false);
    setCloudData(null);
    setIsConnecting(false);
    setAuthStep('initial');
    setPhoneNumber('');
    setPhoneCode('');
    setPassword('');
    setPhoneCodeHash(null);
    setSrpId(null);
    setAuthError(null);
    // Reset pagination state
    setIsLoadingMore(false);
    setHasMoreChats(true);
    setOffsetDate(0);
    setOffsetId(0);
    setOffsetPeer({ _: 'inputPeerEmpty' });
  };


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
    <>
      <Header />
      <main className="flex-grow container mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col items-center">
        {isProcessing ? (
          <div className="flex flex-col items-center text-center p-8 mt-10">
            <AnimatedCloudIcon className="mb-6" isAnimating={true} />
            <h2 className="text-2xl font-semibold mb-2 text-primary">Processing Your Chats</h2>
            <p className="text-muted-foreground max-w-md">
              We're organizing your Telegram media into a neat cloud structure. This might take a few moments...
            </p>
          </div>
        ) : cloudData ? (
          <div className="w-full max-w-4xl">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-3xl font-bold text-primary">Your Cloudified Telegram</h2>
              <Button variant="outline" onClick={() => handleReset(true)}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Disconnect & Reset
              </Button>
            </div>
            <CloudExplorer data={cloudData} />
            {/* Attach ref to the last item for IntersectionObserver */}
            {cloudData.length > 0 && (
              <div
                ref={lastChatElementRef}
                // This div is just a sentinel, it won't be visible if last FolderItem doesn't exist.
                // We will observe this. If it's the actual last FolderItem, we can style it if needed.
                // For simplicity, a div wrapper is easier.
                // Alternatively, pass the ref directly to CloudExplorer and then to the last FolderItem.
                // Let's adjust CloudExplorer to accept a ref for the last item or handle it internally.
                // For now, let's assume CloudExplorer renders FolderItems directly.
                // The following is a placeholder to show where the logic for attaching ref goes.
                // It's better to integrate this into CloudExplorer or pass the ref down.
              >
                {/* This is conceptual, the actual ref attachment is in CloudExplorer below */}
              </div>
            )}
            
            {isLoadingMore && (
              <div className="flex justify-center items-center p-4 my-4">
                <Loader2 className="animate-spin h-8 w-8 text-primary" />
                <p className="ml-3 text-muted-foreground">Loading more chats...</p>
              </div>
            )}
            {!isLoadingMore && !hasMoreChats && cloudData.length > 0 && (
              <p className="text-center text-muted-foreground py-4">No more chats to load.</p>
            )}
            {!isLoadingMore && hasMoreChats && cloudData.length > 0 && cloudData.length < INITIAL_LOAD_LIMIT && (
                 <p className="text-center text-muted-foreground py-4">Scroll down to load more chats.</p>
            )}


          </div>
        ) : (
           <div className="flex flex-col items-center text-center p-8 mt-10">
            <AnimatedCloudIcon className="mb-6" isAnimating={false} />
            <h2 className="text-2xl font-semibold mb-2">Something went wrong</h2>
            <p className="text-muted-foreground max-w-md mb-4">
              We couldn't load your cloud data. Please try disconnecting and connecting again.
            </p>
            <Button onClick={() => handleReset(true)}>
              <RefreshCw className="mr-2 h-4 w-4" /> Try Again
            </Button>
          </div>
        )}
      </main>
      <footer className="py-4 px-4 sm:px-6 lg:px-8 text-center border-t">
        <p className="text-sm text-muted-foreground">
          Telegram Cloudifier &copy; {new Date().getFullYear()}
        </p>
      </footer>
    </>
  );
}
