
import { CloudLightning, RefreshCw, Download } from 'lucide-react';
import Link from 'next/link';
import { Button } from "@/components/ui/button";

interface HeaderProps {
  onDisconnect?: () => void;
  onOpenDownloadManager?: () => void;
  isConnected?: boolean;
}

export function Header({ onDisconnect, onOpenDownloadManager, isConnected }: HeaderProps) {
  return (
    <header className="py-4 px-4 sm:px-6 lg:px-8 border-b border-border shadow-sm">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3">
          <CloudLightning className="h-8 w-8 text-primary" />
          <h1 className="text-2xl font-semibold text-foreground">
            Telegram Cloudifier
          </h1>
        </Link>
        <div className="flex items-center gap-2">
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
}
