
"use client";

import { useState, useCallback, useEffect } from 'react';
import type { CloudFolder } from '@/types';
import * as telegramService from '@/services/telegramService';
import type { useToast } from "@/hooks/use-toast";

interface UseAppCloudChannelsManagerProps {
  isConnected: boolean;
  setIsConnected?: (isConnected: boolean) => void; // Optional prop
  toast: ReturnType<typeof useToast>['toast'];
  handleGlobalApiError: (error: any, title: string, defaultMessage: string, doPageReset?: boolean) => void;
  onCloudChannelListChange?: () => void; 
}

export function useAppCloudChannelsManager({
  isConnected: initialIsConnected,
  setIsConnected: setExternalIsConnected,
  toast,
  handleGlobalApiError,
  onCloudChannelListChange,
}: UseAppCloudChannelsManagerProps) {
  const [appManagedCloudFolders, setAppManagedCloudFolders] = useState<CloudFolder[]>([]);
  const [isLoadingAppManagedCloudFolders, setIsLoadingAppManagedCloudFolders] = useState(true);
  const [isConnectedInternal, setIsConnectedInternal] = useState(initialIsConnected);

  useEffect(() => {
    setIsConnectedInternal(initialIsConnected);
  }, [initialIsConnected]);

  const setIsConnected = useCallback((connected: boolean) => {
    setIsConnectedInternal(connected);
    if (setExternalIsConnected) {
      setExternalIsConnected(connected);
    }
  }, [setExternalIsConnected]);

  const fetchAppManagedCloudChannelsList = useCallback(async (forceRefresh = false) => {
    if (!isConnectedInternal && !forceRefresh) {
      setIsLoadingAppManagedCloudFolders(false);
      return;
    }
    if (!forceRefresh && appManagedCloudFolders.length > 0 && !isLoadingAppManagedCloudFolders) {
      return; 
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
      setAppManagedCloudFolders([]); 
    } finally {
      setIsLoadingAppManagedCloudFolders(false);
    }
  }, [isConnectedInternal, appManagedCloudFolders.length, isLoadingAppManagedCloudFolders, handleGlobalApiError, onCloudChannelListChange]);

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
        return prevFolders.map(f => f.id === newlyVerifiedFolder.id ? newlyVerifiedFolder : f)
          .sort((a, b) => a.name.localeCompare(b.name));
      }
    });
    if (source === 'update' && onCloudChannelListChange) {
      onCloudChannelListChange(); 
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
    setIsLoadingAppManagedCloudFolders(true); 
  }, []);


  return {
    appManagedCloudFolders,
    setAppManagedCloudFolders, 
    isLoadingAppManagedCloudFolders,
    fetchAppManagedCloudChannelsList,
    handleNewCloudChannelVerifiedAndUpdateList,
    addCreatedCloudChannelToList,
    resetAppManagedCloudFolders,
    setIsConnected, // Expose setter
  };
}

    