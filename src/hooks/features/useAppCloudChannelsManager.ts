
"use client";

import { useState, useCallback, useEffect } from 'react';
import type { CloudFolder } from '@/types';
import * as telegramService from '@/services/telegramService';
import type { useToast } from "@/hooks/use-toast";

interface UseAppCloudChannelsManagerProps {
  isConnected: boolean;
  setIsConnected?: (isConnected: boolean) => void; 
  toast: ReturnType<typeof useToast>['toast'];
  handleGlobalApiError: (error: any, title: string, defaultMessage: string, doPageReset?: boolean) => void;
}

export function useAppCloudChannelsManager({
  isConnected: initialIsConnected,
  // setIsConnected: setExternalIsConnected, // Removed if not used by parent
  toast,
  handleGlobalApiError,
}: UseAppCloudChannelsManagerProps) {
  const [appManagedCloudFolders, setAppManagedCloudFolders] = useState<CloudFolder[]>([]);
  const [isLoadingAppManagedCloudFolders, setIsLoadingAppManagedCloudFolders] = useState(true);
  const [isConnectedInternal, setIsConnectedInternal] = useState(initialIsConnected);

  useEffect(() => {
    setIsConnectedInternal(initialIsConnected);
  }, [initialIsConnected]);

  const setIsConnected = useCallback((connected: boolean) => {
    setIsConnectedInternal(connected);
    // If this hook needs to inform its parent about connection changes
    // call setExternalIsConnected(connected) here.
  }, [/* remove setIsConnectedInternal if only a useState setter */]);

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
    } catch (error: any) {
      handleGlobalApiError(error, "Error Fetching Cloud Channels", "Could not load app-managed cloud channels.");
      setAppManagedCloudFolders([]); 
    } finally {
      setIsLoadingAppManagedCloudFolders(false);
    }
  }, [isConnectedInternal, appManagedCloudFolders.length, isLoadingAppManagedCloudFolders, handleGlobalApiError]);

  const handleNewCloudChannelVerifiedAndUpdateList = useCallback((newlyVerifiedFolder: CloudFolder, source: 'update' | 'initialScan'): boolean => {
    let listActuallyChanged = false;
    setAppManagedCloudFolders(prevFolders => {
      const exists = prevFolders.some(f => f.id === newlyVerifiedFolder.id);
      if (!exists) {
        if (source === 'update') {
          toast({
            title: "New Cloud Storage Detected",
            description: `"${newlyVerifiedFolder.name}" is now available and has been organized.`,
          });
        }
        listActuallyChanged = true;
        return [...prevFolders, newlyVerifiedFolder].sort((a, b) => a.name.localeCompare(b.name));
      } else {
        const oldFolder = prevFolders.find(f => f.id === newlyVerifiedFolder.id);
        if (JSON.stringify(oldFolder) !== JSON.stringify(newlyVerifiedFolder)) {
            listActuallyChanged = true;
            return prevFolders.map(f => f.id === newlyVerifiedFolder.id ? newlyVerifiedFolder : f)
                              .sort((a, b) => a.name.localeCompare(b.name));
        }
        return prevFolders; 
      }
    });
    return listActuallyChanged;
  }, [toast]);


  const addCreatedCloudChannelToList = useCallback((newCloudFolder: CloudFolder) => {
    setAppManagedCloudFolders(prevFolders => {
        const exists = prevFolders.some(f => f.id === newCloudFolder.id);
        if (exists) return prevFolders.map(f => f.id === newCloudFolder.id ? newCloudFolder : f).sort((a,b) => a.name.localeCompare(b.name));
        return [...prevFolders, newCloudFolder].sort((a,b) => a.name.localeCompare(b.name));
    });
  }, []);


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
    setIsConnected, 
  };
}

    
