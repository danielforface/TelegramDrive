
"use client";

import { useState, useCallback } from 'react';
import type { CloudFolder } from '@/types';
import * as telegramService from '@/services/telegramService';
import type { useToast } from "@/hooks/use-toast";

interface UseAppCloudChannelsManagerProps {
  isConnected: boolean;
  toast: ReturnType<typeof useToast>['toast'];
  handleGlobalApiError: (error: any, title: string, defaultMessage: string, doPageReset?: boolean) => void;
  onCloudChannelListChange?: () => void; // e.g., to trigger dialog filter refresh
}

export function useAppCloudChannelsManager({
  isConnected,
  toast,
  handleGlobalApiError,
  onCloudChannelListChange,
}: UseAppCloudChannelsManagerProps) {
  const [appManagedCloudFolders, setAppManagedCloudFolders] = useState<CloudFolder[]>([]);
  const [isLoadingAppManagedCloudFolders, setIsLoadingAppManagedCloudFolders] = useState(true);

  const fetchAppManagedCloudChannelsList = useCallback(async (forceRefresh = false) => {
    if (!isConnected && !forceRefresh) {
      setIsLoadingAppManagedCloudFolders(false);
      return;
    }
    if (!forceRefresh && appManagedCloudFolders.length > 0 && !isLoadingAppManagedCloudFolders) {
      return; // Already loaded and not forcing refresh
    }
    setIsLoadingAppManagedCloudFolders(true);
    try {
      const channels = await telegramService.fetchAndVerifyManagedCloudChannels();
      setAppManagedCloudFolders(channels.sort((a, b) => a.name.localeCompare(b.name)));
      if (onCloudChannelListChange && (forceRefresh || appManagedCloudFolders.length !== channels.length)) {
        onCloudChannelListChange();
      }
    } catch (error: any) {
      handleGlobalApiError(error, "Error Fetching Cloud Channels", "Could not load app-managed cloud channels.");
      setAppManagedCloudFolders([]); // Clear on error
    } finally {
      setIsLoadingAppManagedCloudFolders(false);
    }
  }, [isConnected, appManagedCloudFolders.length, isLoadingAppManagedCloudFolders, handleGlobalApiError, onCloudChannelListChange]);

  const handleNewCloudChannelVerifiedAndUpdateList = useCallback((newlyVerifiedFolder: CloudFolder, source: 'update' | 'initialScan') => {
    setAppManagedCloudFolders(prevFolders => {
      const exists = prevFolders.some(f => f.id === newlyVerifiedFolder.id);
      if (!exists) {
        if (source === 'update') {
          toast({
            title: "New Cloud Storage Detected",
            description: `"${newlyVerifiedFolder.name}" is now available and has been organized.`,
          });
        }
        return [...prevFolders, newlyVerifiedFolder].sort((a, b) => a.name.localeCompare(b.name));
      } else {
        // Update existing if needed (e.g., config changed)
        return prevFolders.map(f => f.id === newlyVerifiedFolder.id ? newlyVerifiedFolder : f)
          .sort((a, b) => a.name.localeCompare(b.name));
      }
    });
    if (source === 'update' && onCloudChannelListChange) {
      onCloudChannelListChange(); // This will trigger fetchDialogFilters in page.tsx
    }
  }, [toast, onCloudChannelListChange]);


  const addCreatedCloudChannelToList = useCallback((newCloudFolder: CloudFolder) => {
    setAppManagedCloudFolders(prevFolders => {
        const exists = prevFolders.some(f => f.id === newCloudFolder.id);
        if (exists) return prevFolders.map(f => f.id === newCloudFolder.id ? newCloudFolder : f).sort((a,b) => a.name.localeCompare(b.name));
        return [...prevFolders, newCloudFolder].sort((a,b) => a.name.localeCompare(b.name));
    });
     if (onCloudChannelListChange) {
      onCloudChannelListChange();
    }
  }, [onCloudChannelListChange]);


  const resetAppManagedCloudFolders = useCallback(() => {
    setAppManagedCloudFolders([]);
    setIsLoadingAppManagedCloudFolders(true); // Or false if we don't want to show loading immediately
  }, []);


  return {
    appManagedCloudFolders,
    setAppManagedCloudFolders, // Expose for direct updates if needed (e.g., VFS ops)
    isLoadingAppManagedCloudFolders,
    fetchAppManagedCloudChannelsList,
    handleNewCloudChannelVerifiedAndUpdateList,
    addCreatedCloudChannelToList,
    resetAppManagedCloudFolders,
  };
}
