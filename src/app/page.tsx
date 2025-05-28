
"use client";

import { useState, useEffect, FormEvent } from "react";
import { Header } from "@/components/layout/header";
import { TelegramConnect } from "@/components/telegram-connect";
import { CloudExplorer } from "@/components/cloud-explorer/cloud-explorer";
import { AnimatedCloudIcon } from "@/components/animated-cloud-icon";
import type { CloudFolder } from "@/types";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import * as telegramService from "@/services/telegramService";

const MOCK_CLOUD_DATA: CloudFolder[] = [
  {
    id: "chat-1",
    name: "Work Projects Chat",
    isChatFolder: true,
    files: [],
    folders: [
      {
        id: "chat-1-images",
        name: "Images",
        files: [
          { id: "img1", name: "Project_Alpha_Mockup.png", type: "image", size: "1.2MB", lastModified: "2023-10-25" , url: "https://placehold.co/600x400.png", dataAiHint: "project mockup" },
          { id: "img2", name: "Team_Photo_Event.jpg", type: "image", size: "3.5MB", lastModified: "2023-10-20", url: "https://placehold.co/600x400.png", dataAiHint: "team photo" },
        ],
        folders: [],
      },
      {
        id: "chat-1-videos",
        name: "Videos",
        files: [
          { id: "vid1", name: "Demo_Screencast.mp4", type: "video", size: "25MB", lastModified: "2023-10-22", url: "#" },
        ],
        folders: [],
      },
      {
        id: "chat-1-docs",
        name: "Documents",
        files: [
          { id: "doc1", name: "Project_Proposal_v3.pdf", type: "document", size: "850KB", lastModified: "2023-10-26", url: "#" },
          { id: "doc2", name: "Meeting_Notes_Oct.docx", type: "document", size: "120KB", lastModified: "2023-10-19", url: "#" },
        ],
        folders: [],
      },
    ],
  },
  {
    id: "chat-2",
    name: "Family Updates",
    isChatFolder: true,
    files: [],
    folders: [
      {
        id: "chat-2-images",
        name: "Images",
        files: [
          { id: "fam-img1", name: "Vacation_Beach.jpg", type: "image", size: "4.1MB", lastModified: "2023-09-15", dataAiHint: "beach vacation", url: "https://placehold.co/600x400.png" },
          { id: "fam-img2", name: "Birthday_Party_Kids.png", type: "image", size: "2.8MB", lastModified: "2023-08-05", dataAiHint: "birthday party", url: "https://placehold.co/600x400.png" },
        ],
        folders: [],
      },
       {
        id: "chat-2-audio",
        name: "Audio Messages",
        files: [
          { id: "audio1", name: "Grandma_Voicemail.mp3", type: "audio", size: "500KB", lastModified: "2023-07-10", url: "#" },
        ],
        folders: [],
      },
    ],
  },
  {
    id: "chat-3",
    name: "Tech News Channel",
    isChatFolder: true,
    files: [
        { id: "tech-news1", name: "Latest_Gadget_Review.pdf", type: "document", size: "2.1MB", lastModified: "2023-10-27", dataAiHint:"gadget review", url: "#" },
    ],
    folders: [
      {
        id: "chat-3-unknown",
        name: "Archived Files",
        files: [
          { id: "unknown1", name: "backup_archive.zip", type: "unknown", size: "150MB", lastModified: "2023-01-01", url: "#" },
        ],
        folders: [],
      }
    ]
  }
];

type AuthStep = 'initial' | 'awaiting_code' | 'awaiting_password';

export default function Home() {
  const [isConnecting, setIsConnecting] = useState(false); // General loading state for auth operations
  const [isConnected, setIsConnected] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false); // For chat processing after connection
  const [cloudData, setCloudData] = useState<CloudFolder[] | null>(null);
  const { toast } = useToast();

  const [authStep, setAuthStep] = useState<AuthStep>('initial');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [phoneCode, setPhoneCode] = useState('');
  const [password, setPassword] = useState('');
  const [phoneCodeHash, setPhoneCodeHash] = useState<string | null>(null);
  const [srpId, setSrpId] = useState<string | null>(null); // srp_id for 2FA
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    // Check if user was already connected (e.g. session persisted)
    // This is a simplified check. A more robust check would involve an API call.
    const checkExistingConnection = async () => {
      const previouslyConnected = await telegramService.isUserConnected();
      if (previouslyConnected) {
        setIsConnected(true);
        fetchChats();
      }
    };
    // checkExistingConnection(); // You might enable this if session persistence is more robust
  }, []);


  const fetchChats = async () => {
    setIsProcessing(true);
    toast({ title: "Fetching Chats...", description: "Loading your Telegram conversations." });
    try {
      const chats = await telegramService.getTelegramChats();
      setCloudData(chats);
      if (chats.length === 0) {
        toast({ title: "No Chats Found", description: "Your Telegram chat list appears to be empty or couldn't be loaded.", variant: "destructive" });
      } else {
        toast({ title: "Chats Loaded!", description: "Your Telegram cloud structure is ready." });
      }
    } catch (error: any) {
      console.error("Error fetching chats:", error);
      toast({ title: "Error Fetching Chats", description: error.message || "Could not load your chats.", variant: "destructive" });
      setCloudData(MOCK_CLOUD_DATA); // Fallback to mock data on error for now
    } finally {
      setIsProcessing(false);
    }
  };

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
      setPhoneNumber(currentPhoneNumber); // Store phone number for sign in
      setAuthStep('awaiting_code');
      toast({ title: "Code Sent!", description: "Please check Telegram for your verification code." });
    } catch (error: any) {
      console.error("Error sending code:", error);
      setAuthError(error.message || "Failed to send code. Please check the phone number and try again.");
      toast({ title: "Error Sending Code", description: error.message || "Failed to send code.", variant: "destructive" });
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
        handleReset(); // Reset to initial state
        return;
    }
    setIsConnecting(true);
    setAuthError(null);
    toast({ title: "Verifying Code...", description: "Checking your verification code with Telegram." });
    try {
      const result = await telegramService.signIn(currentPhoneCode); // Service function handles phone and hash
      
      if (result.user) {
        setIsConnected(true);
        setAuthStep('initial'); // Reset auth step
        fetchChats(); // Fetch chats immediately
      } else {
        // This case should ideally not happen if signIn throws specific errors for 2FA
        setAuthError("Sign in failed. Unexpected response.");
        toast({ title: "Sign In Failed", description: "Unexpected response from server.", variant: "destructive" });
      }
    } catch (error: any) {
      console.error("Error signing in:", error);
      if (error.srp_id) { // Specific error structure from our service for 2FA
        setSrpId(error.srp_id);
        setAuthStep('awaiting_password');
        setAuthError("2FA password required.");
        toast({ title: "2FA Required", description: "Please enter your two-factor authentication password." });
      } else {
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
        handleReset();
        return;
    }
    setIsConnecting(true);
    setAuthError(null);
    toast({ title: "Verifying Password...", description: "Checking your 2FA password." });
    try {
      const user = await telegramService.checkPassword(currentPassword); // Service handles srpId
      if (user) {
        setIsConnected(true);
        setAuthStep('initial'); // Reset auth step
        fetchChats(); // Fetch chats
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

  const handleReset = async () => {
    if (isConnected) {
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
              <Button variant="outline" onClick={handleReset}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Disconnect & Reset
              </Button>
            </div>
            <CloudExplorer data={cloudData} />
          </div>
        ) : (
           <div className="flex flex-col items-center text-center p-8 mt-10">
            <AnimatedCloudIcon className="mb-6" isAnimating={false} />
            <h2 className="text-2xl font-semibold mb-2">Something went wrong</h2>
            <p className="text-muted-foreground max-w-md mb-4">
              We couldn't load your cloud data. Please try disconnecting and connecting again.
            </p>
            <Button onClick={handleReset}>
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

    