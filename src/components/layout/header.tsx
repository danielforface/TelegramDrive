
import { CloudLightning, RefreshCw, Download, MessageSquare, Cloud, Globe } from 'lucide-react'; // Added Globe
import Link from 'next/link';
import { Button } from "@/components/ui/button";
import React from 'react';

interface HeaderProps {
  onDisconnect?: () => void;
  onOpenDownloadManager?: () => void;
  onOpenChatSelectionDialog?: () => void;
  onOpenCloudStorageSelector?: () => void;
  onOpenGlobalDrive?: () => void; // New prop for Global Drive
  isConnected?: boolean;
}

export const Header = React.forwardRef<HTMLDivElement, HeaderProps>(
  ({ onDisconnect, onOpenDownloadManager, onOpenChatSelectionDialog, onOpenCloudStorageSelector, onOpenGlobalDrive, isConnected }, ref) => {
  return (
    <header ref={ref} className="py-4 px-4 sm:px-6 lg:px-8 border-b border-border shadow-sm">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3">
          <CloudLightning className="h-8 w-8 text-primary" />
          <h1 className="text-2xl font-semibold text-foreground">
            Telegram Cloudifier
          </h1>
        </Link>
        <div className="flex items-center gap-2">
          {isConnected && onOpenGlobalDrive && ( // New Button for Global Drive
            <Button variant="outline" size="icon" onClick={onOpenGlobalDrive} title="Open Global Drive">
              <Globe className="h-5 w-5" />
            </Button>
          )}
          {isConnected && onOpenChatSelectionDialog && (
            <Button variant="outline" size="icon" onClick={onOpenChatSelectionDialog} title="Select Chat Folder">
              <MessageSquare className="h-5 w-5" />
            </Button>
          )}
          {isConnected && onOpenCloudStorageSelector && ( 
            <Button variant="outline" size="icon" onClick={onOpenCloudStorageSelector} title="Select Cloud Storage">
              <Cloud className="h-5 w-5" />
            </Button>
          )}
          {isConnected && onOpenDownloadManager && (
            <Button variant="outline" size="icon" onClick={onOpenDownloadManager} title="Open Download Manager">
              <Download className="h-5 w-5" />
            </Button>
          )}
          {isConnected && onDisconnect && (
            <Button variant="outline" size="icon" onClick={onDisconnect} title="Disconnect and Reset">
              <RefreshCw className="h-5 w-5" />
            </Button>
          )}
        </div>
      </div>
    </header>
  );
});

Header.displayName = "Header";
