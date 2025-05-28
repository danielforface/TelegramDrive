"use client";

import { useState, useEffect } from "react";
import { Header } from "@/components/layout/header";
import { TelegramConnect } from "@/components/telegram-connect";
import { CloudExplorer } from "@/components/cloud-explorer/cloud-explorer";
import { AnimatedCloudIcon } from "@/components/animated-cloud-icon";
import type { CloudFolder } from "@/types";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

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
          { id: "img1", name: "Project_Alpha_Mockup.png", type: "image", size: "1.2MB", lastModified: "2023-10-25" , url: "https://placehold.co/600x400.png?text=Project+Alpha" },
          { id: "img2", name: "Team_Photo_Event.jpg", type: "image", size: "3.5MB", lastModified: "2023-10-20", url: "https://placehold.co/600x400.png?text=Team+Photo" },
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
          { id: "fam-img1", name: "Vacation_Beach.jpg", type: "image", size: "4.1MB", lastModified: "2023-09-15", dataAiHint: "beach vacation", url: "https://placehold.co/600x400.png?text=Vacation+Beach" },
          { id: "fam-img2", name: "Birthday_Party_Kids.png", type: "image", size: "2.8MB", lastModified: "2023-08-05", dataAiHint: "birthday party", url: "https://placehold.co/600x400.png?text=Birthday+Party" },
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


export default function Home() {
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [cloudData, setCloudData] = useState<CloudFolder[] | null>(null);
  const { toast } = useToast();

  const handleConnect = () => {
    setIsConnecting(true);
    toast({ title: "Connecting to Telegram...", description: "Please wait while we establish a connection." });
    setTimeout(() => {
      setIsConnecting(false);
      setIsConnected(true);
      setIsProcessing(true);
      toast({ title: "Connected Successfully!", description: "Now processing your chats. This might take a moment." });
      
      // Simulate processing chats
      setTimeout(() => {
        setCloudData(MOCK_CLOUD_DATA);
        setIsProcessing(false);
        toast({ title: "Chats Processed!", description: "Your Telegram cloud structure is ready." });
      }, 2500);
    }, 2000);
  };

  const handleReset = () => {
    setIsConnected(false);
    setIsProcessing(false);
    setCloudData(null);
    setIsConnecting(false);
    toast({ title: "Disconnected", description: "Connection has been reset." });
  };

  return (
    <>
      <Header />
      <main className="flex-grow container mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col items-center justify-center">
        {!isConnected ? (
          <TelegramConnect onConnect={handleConnect} isLoading={isConnecting} />
        ) : isProcessing ? (
          <div className="flex flex-col items-center text-center p-8">
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
           <div className="flex flex-col items-center text-center p-8">
            <AnimatedCloudIcon className="mb-6" isAnimating={false} />
            <h2 className="text-2xl font-semibold mb-2">Something went wrong</h2>
            <p className="text-muted-foreground max-w-md mb-4">
              We couldn't load your cloud data. Please try again.
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
