
"use client";

import { useState, useEffect, useCallback, useRef } from "react";
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
  const [isConnecting, setIsConnecting] = useState(false); 
  const [isConnected, setIsConnected] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false); 
  const [cloudData, setCloudData] = useState<CloudFolder[] | null>(null);
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
        setAuthStep('initial'); // Ensure auth step is reset
        setAuthError(null);    // Clear any previous auth errors
        fetchChats(); 
      } else {
        console.log("No existing connection found or session invalid.");
        setIsConnected(false); 
        handleReset(false); // Reset local state if not connected
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
      setIsProcessing(true);
      setCloudData(null); 
      setAuthError(null); // Clear previous errors on new fetch attempt
      // Reset pagination for initial load
      setOffsetDate(0);
      setOffsetId(0);
      setOffsetPeer({ _: 'inputPeerEmpty' });
      setHasMoreChats(true); // Assume there are chats on initial load
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
      
      if (isInitialLoad) {
        setCloudData(response.folders);
      } else {
        setCloudData(prevData => [...(prevData || []), ...response.folders]);
      }
      
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
      if (!isInitialLoad) setHasMoreChats(false); // Stop trying to load more if an error occurs
    } finally {
      if (isInitialLoad) setIsProcessing(false);
      else setIsLoadingMore(false);
    }
  };
  
  const loadMoreChats = useCallback(() => {
     if (isLoadingMore || !hasMoreChats || !isConnected || isProcessing) return;
     fetchChats(false);
  }, [isLoadingMore, hasMoreChats, isConnected, isProcessing, offsetDate, offsetId, offsetPeer]); // Add dependencies

  const observer = useRef<IntersectionObserver | null>(null);
  const lastChatElementRef = useCallback((node: HTMLDivElement | null) => {
    if (isLoadingMore || isProcessing) return; // Don't observe if already loading/processing initial
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
      await telegramService.sendCode(currentPhoneNumber);
      // No need to set phoneCodeHash in state, it's managed internally by telegramService now
      setPhoneNumber(currentPhoneNumber); 
      setAuthStep('awaiting_code');
      toast({ title: "Code Sent!", description: "Please check Telegram for your verification code." });
    } catch (error: any) {
      console.error("Error in handleSendCode:", error.message, error);
      if (error.message === 'AUTH_RESTART') {
        toast({
          title: "Authentication Restarted",
          description: "The authentication process needs to be restarted by Telegram. Please try entering your phone number again.",
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
        fetchChats();
        toast({ title: "Sign In Successful!", description: "Connected to Telegram." });
      } else {
        // This case should ideally not be reached if errors are thrown correctly
        setAuthError("Sign in failed. Unexpected response from server.");
        toast({ title: "Sign In Failed", description: "Unexpected response from server.", variant: "destructive" });
      }
    } catch (error: any) {
      // Error object from telegramService should now always have a .message
      if (error.message === '2FA_REQUIRED' && (error as any).srp_id) {
        console.log("2FA required for sign in, srp_id received:", (error as any).srp_id);
        // srp_id is now managed by telegramService's userSession
        setAuthStep('awaiting_password');
        setAuthError(null); // Clear previous error, show 2FA prompt
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
        fetchChats();
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
    setIsProcessing(false);
    setCloudData(null);
    setIsConnecting(false);
    setAuthStep('initial');
    setPhoneNumber(''); 
    setPhoneCode('');
    setPassword('');
    // phoneCodeHash and srpId are managed internally by telegramService's userSession
    setAuthError(null);
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
        {isProcessing && !cloudData ? ( 
          <div className="flex flex-col items-center text-center p-8 mt-10">
            <AnimatedCloudIcon className="mb-6" isAnimating={true} />
            <h2 className="text-2xl font-semibold mb-2 text-primary">Processing Your Chats</h2>
            <p className="text-muted-foreground max-w-md">
              We're organizing your Telegram media into a neat cloud structure. This might take a few moments...
            </p>
          </div>
        ) : cloudData && cloudData.length > 0 ? (
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
            {!isLoadingMore && !hasMoreChats && cloudData.length > 0 && ( // Ensure cloudData has items before saying "no more"
              <p className="text-center text-muted-foreground py-4">No more chats to load.</p>
            )}
             {!isLoadingMore && hasMoreChats && cloudData.length > 0 && !isProcessing && ( // Prompt to scroll if not loading and has more
              <p className="text-center text-muted-foreground py-4">Scroll down to load more chats.</p>
            )}
          </div>
        ) : cloudData && cloudData.length === 0 && !isProcessing && !authError ? (
          // Case for successfully connected, processing done, but no chats returned and no error
          <div className="flex flex-col items-center text-center p-8 mt-10">
            <AnimatedCloudIcon className="mb-6" isAnimating={false} />
            <h2 className="text-2xl font-semibold mb-2">No Chats Found</h2>
            <p className="text-muted-foreground max-w-md mb-4">
              It seems your Telegram chat list is empty or we couldn't find any chats to display.
            </p>
            <Button onClick={() => fetchChats()}> 
              <RefreshCw className="mr-2 h-4 w-4" /> Try Refreshing Chats
            </Button>
             <Button variant="outline" onClick={() => handleReset(true)} className="mt-2">
                <RefreshCw className="mr-2 h-4 w-4" />
                Disconnect & Reset
              </Button>
          </div>
        ) : ( // This case handles errors after connection or if fetchChats failed and set an authError
           <div className="flex flex-col items-center text-center p-8 mt-10">
            <AnimatedCloudIcon className="mb-6" isAnimating={false} />
            <h2 className="text-2xl font-semibold mb-2 text-destructive">Something went wrong</h2>
            <p className="text-muted-foreground max-w-md mb-4">
              {authError || "We couldn't load your cloud data. Please try disconnecting and connecting again."}
            </p>
            <Button onClick={() => handleReset(true)}>
              <RefreshCw className="mr-2 h-4 w-4" /> Disconnect & Try Again
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
