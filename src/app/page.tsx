
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

  const checkExistingConnection = useCallback(async () => {
    console.log("Checking existing connection...");
    try {
      const previouslyConnected = await telegramService.isUserConnected();
      if (previouslyConnected) {
        console.log("User was previously connected. Setting state and fetching chats.");
        setIsConnected(true);
        fetchChats(); // Fetch initial chats if already connected
      } else {
        console.log("No existing connection found or session invalid.");
        setIsConnected(false); // Ensure UI reflects not connected state
      }
    } catch (error) {
      console.warn("Error checking existing connection:", error);
      setIsConnected(false);
    }
  }, []); // Add dependencies if any state used inside changes, e.g. `fetchChats` if it's not stable

  useEffect(() => {
    checkExistingConnection();
  }, [checkExistingConnection]);


  const fetchChats = async () => {
    setIsProcessing(true);
    setCloudData(null); 
    setAuthError(null);
    toast({ title: "Fetching Chats...", description: "Loading your Telegram conversations." });
    try {
      const response = await telegramService.getTelegramChats(INITIAL_LOAD_LIMIT, 0, 0, { _: 'inputPeerEmpty' });
      setCloudData(response.folders);
      setOffsetDate(response.nextOffsetDate);
      setOffsetId(response.nextOffsetId);
      setOffsetPeer(response.nextOffsetPeer);
      setHasMoreChats(response.hasMore);

      if (response.folders.length === 0 && !response.hasMore) {
        toast({ title: "No Chats Found", description: "Your Telegram chat list appears to be empty or couldn't be loaded.", variant: "default" });
      } else {
        toast({ title: "Chats Loaded!", description: `Loaded ${response.folders.length} initial chats.` });
      }
    } catch (error: any) {
      console.error("Error fetching initial chats:", error);
      toast({ title: "Error Fetching Chats", description: error.message || "Could not load your chats.", variant: "destructive" });
      setAuthError(error.message || "Could not load your chats.");
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
      setHasMoreChats(false); 
    } finally {
      setIsLoadingMore(false);
    }
  }, [isLoadingMore, hasMoreChats, offsetDate, offsetId, offsetPeer, toast, isConnected]);

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
      setPhoneNumber(currentPhoneNumber); // Keep phone number for sign-in
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
        handleReset(false); // Reset local state without logging out from server
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
    if (!phoneCodeHash || !phoneNumber) { // Ensure phone number is still available from state
        setAuthError("Phone number or code hash is missing. Please start over.");
        handleReset(false);
        return;
    }
    setIsConnecting(true);
    setAuthError(null);
    toast({ title: "Verifying Code...", description: "Checking your verification code with Telegram." });
    try {
      // Pass phoneNumber to signIn along with code and hash
      const result = await telegramService.signIn(currentPhoneCode); // Assuming signIn can get phone & hash from its internal session

      if (result.user) {
        setIsConnected(true);
        setAuthStep('initial');
        setPhoneCode(''); // Clear code
        setPassword('');   // Clear password
        fetchChats();
        toast({ title: "Sign In Successful!", description: "Connected to Telegram." });
      } else {
        // This case should ideally be handled by 2FA error below or other specific errors
        setAuthError("Sign in failed. Unexpected response from server.");
        toast({ title: "Sign In Failed", description: "Unexpected response from server.", variant: "destructive" });
      }
    } catch (error: any) {
      if (error.message === '2FA_REQUIRED' && error.srp_id) {
        console.log("2FA required for sign in, srp_id received:", error.srp_id);
        setSrpId(error.srp_id);
        setAuthStep('awaiting_password');
        setAuthError("2FA password required."); // Informative message for UI
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
    if (!srpId) { // srpId should have been set if we are in 'awaiting_password' state
        setAuthError("SRP ID is missing for 2FA. Please start over.");
        handleReset(false);
        return;
    }
    setIsConnecting(true);
    setAuthError(null);
    toast({ title: "Verifying Password...", description: "Checking your 2FA password." });
    try {
      // Pass srpId and password to checkPassword
      const user = await telegramService.checkPassword(currentPassword); 
      if (user) {
        setIsConnected(true);
        setAuthStep('initial');
        setPhoneCode('');   // Clear code
        setPassword('');    // Clear password
        fetchChats();
        toast({ title: "2FA Successful!", description: "Connected to Telegram." });
      } else {
         // This case should ideally be handled by specific errors like PASSWORD_HASH_INVALID
        setAuthError("2FA failed. Unexpected response from server.");
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
    if (performServerLogout && isConnected) { // Only try to sign out from server if connected
        toast({ title: "Disconnecting...", description: "Logging out from Telegram." });
        try {
            await telegramService.signOut();
            toast({ title: "Disconnected", description: "Successfully signed out." });
        } catch (error: any) {
            toast({ title: "Disconnection Error", description: error.message || "Could not sign out properly from server.", variant: "destructive" });
        }
    }
    // Reset all local state
    setIsConnected(false);
    setIsProcessing(false);
    setCloudData(null);
    setIsConnecting(false);
    setAuthStep('initial');
    setPhoneNumber(''); // Clear phone number input
    setPhoneCode('');
    setPassword('');
    setPhoneCodeHash(null);
    setSrpId(null);
    setAuthError(null);
    // Reset pagination state
    setIsLoadingMore(false);
    setHasMoreChats(true); // Assume there are chats to load if user reconnects
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
            onReset={() => handleReset(false)} // Reset client state without server logout from connect form
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
        {isProcessing && !cloudData ? ( // Show processing only if cloudData is null (initial load)
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
            <CloudExplorer data={cloudData} lastItemRef={lastChatElementRef} />
            
            {isLoadingMore && (
              <div className="flex justify-center items-center p-4 my-4">
                <Loader2 className="animate-spin h-8 w-8 text-primary" />
                <p className="ml-3 text-muted-foreground">Loading more chats...</p>
              </div>
            )}
            {!isLoadingMore && !hasMoreChats && cloudData.length > 0 && (
              <p className="text-center text-muted-foreground py-4">No more chats to load.</p>
            )}
            {/* Removed the scroll down to load more message as it might be confusing with observer */}

          </div>
        ) : ( // This case handles errors after connection or if fetchChats failed to populate data
           <div className="flex flex-col items-center text-center p-8 mt-10">
            <AnimatedCloudIcon className="mb-6" isAnimating={false} />
            <h2 className="text-2xl font-semibold mb-2">Something went wrong</h2>
            <p className="text-muted-foreground max-w-md mb-4">
              {authError || "We couldn't load your cloud data. Please try disconnecting and connecting again."}
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

