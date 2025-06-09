

"use client";

import { useState, useCallback, useEffect } from 'react';
import type { GlobalDriveConfigV1, InputPeer, GlobalDriveFolderEntry } from '@/types';
import * as telegramService from '@/services/telegramService';
import type { useToast } from "@/hooks/use-toast";
import { normalizePath } from '@/lib/vfsUtils';


const GLOBAL_DRIVE_CONFIG_FILENAME = "telegram_cloudifier_global_drive_config_v1.json";
const GLOBAL_DRIVE_CONFIG_CAPTION_KEY = "app_feature";
const GLOBAL_DRIVE_CONFIG_CAPTION_VALUE = "telegram_cloudifier_global_drive_config_v1";

const DEFAULT_GLOBAL_DRIVE_CONFIG: GlobalDriveConfigV1 = {
  app_signature: "GLOBAL_DRIVE_CONFIG_V1.0",
  version: 1,
  last_updated_timestamp_utc: new Date().toISOString(), // Will be set fresh on creation
  root_entries: {} // Starts empty
};

interface UseGlobalDriveConfigManagerProps {
  toast: ReturnType<typeof useToast>['toast'];
  handleGlobalApiError: (error: any, title: string, defaultMessage: string, doPageReset?: boolean) => void;
  isConnected: boolean; // This will be initialIsConnected
  setIsConnected?: (isConnected: boolean) => void; // Optional prop for external update
}

export function useGlobalDriveConfigManager({
  toast,
  handleGlobalApiError,
  isConnected: initialIsConnected,
  setIsConnected: setExternalIsConnected,
}: UseGlobalDriveConfigManagerProps) {
  const [customConfig, setCustomConfig] = useState<GlobalDriveConfigV1 | null>(null);
  const [isLoadingConfig, setIsLoadingConfig] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);
  const [selfPeer, setSelfPeer] = useState<InputPeer | null>(null);
  const [configMessageId, setConfigMessageId] = useState<number | null>(null);
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


  useEffect(() => {
    const fetchSelfPeer = async () => {
      if (isConnectedInternal && !selfPeer) {
        try {
          const peer = await telegramService.getSelfInputPeer();
          setSelfPeer(peer);
        } catch (e) {
          setConfigError("Failed to get self peer for config management.");
        }
      }
    };
    fetchSelfPeer();
  }, [isConnectedInternal, selfPeer]);

  const updateAndSaveConfig = useCallback(async (newConfig: GlobalDriveConfigV1) => {
    if (!isConnectedInternal || !selfPeer) {
      toast({ title: "Save Failed", description: "Not connected or self peer unavailable.", variant: "destructive" });
      return false;
    }
    setIsLoadingConfig(true);
    setConfigError(null);

    try {
      const updatedConfigWithTimestamp = {
        ...newConfig,
        last_updated_timestamp_utc: new Date().toISOString(),
      };
      const newConfigJson = JSON.stringify(updatedConfigWithTimestamp, null, 2);
      const caption = { [GLOBAL_DRIVE_CONFIG_CAPTION_KEY]: GLOBAL_DRIVE_CONFIG_CAPTION_VALUE };

      const sentMessage = await telegramService.uploadTextAsFileToSelfChat(
        GLOBAL_DRIVE_CONFIG_FILENAME,
        newConfigJson,
        "application/json",
        caption
      );

      if (!sentMessage || !sentMessage.id) {
        throw new Error("Failed to upload new configuration file.");
      }
      const newConfigMsgId = sentMessage.id;

      await telegramService.unpinAllSelfChatMessages();
      const pinned = await telegramService.pinSelfChatMessage(newConfigMsgId, true);
      if (!pinned) {
        toast({ title: "Pinning Failed", description: "New config uploaded but could not be pinned. Please pin it manually in Saved Messages.", variant: "default" });
      }

      if (configMessageId && configMessageId !== newConfigMsgId) {
        if (selfPeer) {
            await telegramService.deleteTelegramMessages(selfPeer, [configMessageId]);
        } else {
            console.warn("Self peer not available, cannot delete old config message.");
        }
      }

      setCustomConfig(updatedConfigWithTimestamp);
      setConfigMessageId(newConfigMsgId);
      toast({ title: "Configuration Saved", description: "Your Global Drive custom organization has been updated." });
      return true;
    } catch (error: any) {
      setConfigError(error.message || "Failed to update and save configuration.");
      handleGlobalApiError(error, "Error Saving Configuration", "Could not save custom Global Drive configuration.");
      return false;
    } finally {
      setIsLoadingConfig(false);
    }
  }, [isConnectedInternal, selfPeer, configMessageId, toast, handleGlobalApiError]);


  const loadOrCreateConfig = useCallback(async () => {
    if (!isConnectedInternal || !selfPeer) {
      setConfigError("Not connected or self peer not available for loading/creating config.");
      setIsLoadingConfig(false); // Ensure loading is false if we can't proceed
      return;
    }

    setIsLoadingConfig(true);
    setConfigError(null);
    setCustomConfig(null);
    setConfigMessageId(null);

    try {
      toast({ title: "Custom Config", description: "Searching for your Global Drive configuration in Saved Messages..."});
      const existingConfigMessage = await telegramService.searchSelfMessagesByCaption(
        GLOBAL_DRIVE_CONFIG_CAPTION_KEY,
        GLOBAL_DRIVE_CONFIG_CAPTION_VALUE
      );

      if (existingConfigMessage && existingConfigMessage.media && existingConfigMessage.media._ === 'messageMediaDocument') {
        const document = existingConfigMessage.media.document;
        toast({ title: "Custom Config", description: `Found existing config file: ${document.attributes.find((a:any) => a._ === 'documentAttributeFilename')?.file_name}. Downloading...`});
        const jsonContent = await telegramService.downloadDocumentContent(document);
        if (jsonContent) {
          try {
            const parsedConfig = JSON.parse(jsonContent) as GlobalDriveConfigV1;
            if (parsedConfig.app_signature === "GLOBAL_DRIVE_CONFIG_V1.0") {
              setCustomConfig(parsedConfig);
              setConfigMessageId(existingConfigMessage.id);
              toast({ title: "Custom Config Loaded", description: "Successfully loaded your custom Global Drive organization." });
              setIsLoadingConfig(false);
              return;
            } else {
              toast({ title: "Config Invalid", description: "Found config file, but signature is invalid. Creating a new one.", variant: "default" });
            }
          } catch (parseError) {
            toast({ title: "Config Corrupted", description: "Could not parse existing config file. Creating a new one.", variant: "destructive" });
          }
        } else {
            toast({ title: "Config Download Failed", description: "Could not download content of existing config file. Creating a new one.", variant: "destructive" });
        }
      } else {
         toast({ title: "Custom Config", description: "No existing configuration found."});
      }

      toast({ title: "Custom Config", description: `Creating default configuration file "${GLOBAL_DRIVE_CONFIG_FILENAME}"...`});
      const defaultConfigWithTimestamp = {
          ...DEFAULT_GLOBAL_DRIVE_CONFIG, // This now has empty root_entries
          last_updated_timestamp_utc: new Date().toISOString(),
      };
      const defaultConfigJson = JSON.stringify(defaultConfigWithTimestamp, null, 2);
      const caption = { [GLOBAL_DRIVE_CONFIG_CAPTION_KEY]: GLOBAL_DRIVE_CONFIG_CAPTION_VALUE };

      const sentMessage = await telegramService.uploadTextAsFileToSelfChat(
        GLOBAL_DRIVE_CONFIG_FILENAME,
        defaultConfigJson,
        "application/json",
        caption
      );

      if (sentMessage && sentMessage.id) {
        setConfigMessageId(sentMessage.id);
        toast({ title: "Custom Config File Created", description: `"${GLOBAL_DRIVE_CONFIG_FILENAME}" uploaded to your Saved Messages.`});
        await telegramService.unpinAllSelfChatMessages();
        const pinned = await telegramService.pinSelfChatMessage(sentMessage.id, true);
        if (pinned) {
          toast({ title: "Custom Config Pinned", description: "New configuration file has been pinned in your Saved Messages." });
        } else {
          toast({ title: "Pinning Failed", description: "Could not pin the new config file. Please pin it manually.", variant: "default" });
        }
        setCustomConfig(defaultConfigWithTimestamp);
      } else {
        throw new Error("Failed to upload or confirm new configuration file message.");
      }

    } catch (error: any) {
      setConfigError(error.message || "An unknown error occurred while managing custom config.");
      handleGlobalApiError(error, "Custom Config Error", "Failed to load or create custom Global Drive configuration.");
      setCustomConfig(null);
      setConfigMessageId(null);
    } finally {
      setIsLoadingConfig(false);
    }
  }, [isConnectedInternal, selfPeer, toast, handleGlobalApiError]);

  const resetConfigState = useCallback(() => {
    setCustomConfig(null);
    setIsLoadingConfig(false);
    setConfigError(null);
    setConfigMessageId(null);
  }, []);

  const addVirtualFolderInConfig = useCallback(async (parentPath: string, folderName: string) => {
    if (!customConfig) {
      toast({ title: "Error", description: "No custom config loaded to add folder to.", variant: "destructive" });
      return;
    }
    const newConfig = JSON.parse(JSON.stringify(customConfig)) as GlobalDriveConfigV1; // Deep copy
    let currentEntries = newConfig.root_entries;
    const segments = normalizePath(parentPath).split('/').filter(s => s);
    
    for (const segment of segments) {
      if (currentEntries[segment] && currentEntries[segment].type === 'folder' && (currentEntries[segment] as GlobalDriveFolderEntry).entries) {
        currentEntries = (currentEntries[segment] as GlobalDriveFolderEntry).entries;
      } else {
        toast({ title: "Error", description: `Invalid parent path: ${parentPath}`, variant: "destructive" });
        return;
      }
    }

    if (currentEntries[folderName]) {
      toast({ title: "Error", description: `Folder "${folderName}" already exists in ${parentPath}.`, variant: "destructive" });
      return;
    }

    const now = new Date().toISOString();
    currentEntries[folderName] = {
      type: 'folder',
      name: folderName,
      created_at: now,
      modified_at: now,
      entries: {},
    };
    await updateAndSaveConfig(newConfig);
  }, [customConfig, updateAndSaveConfig, toast]);

  const removeVirtualFolderFromConfig = useCallback(async (folderPath: string, folderName: string) => {
    if (!customConfig) {
      toast({ title: "Error", description: "No custom config loaded to remove folder from.", variant: "destructive" });
      return;
    }
    const newConfig = JSON.parse(JSON.stringify(customConfig)) as GlobalDriveConfigV1; // Deep copy
    let parentEntries = newConfig.root_entries;

    const segments = normalizePath(folderPath).split('/').filter(s => s); 

    for (const segment of segments) {
      if (parentEntries[segment] && parentEntries[segment].type === 'folder' && (parentEntries[segment] as GlobalDriveFolderEntry).entries) {
        parentEntries = (parentEntries[segment] as GlobalDriveFolderEntry).entries;
      } else {
        toast({ title: "Error", description: `Invalid parent path segment "${segment}" for deletion of "${folderName}"`, variant: "destructive" });
        return;
      }
    }

    if (parentEntries[folderName] && parentEntries[folderName].type === 'folder') {
      delete parentEntries[folderName];
      await updateAndSaveConfig(newConfig);
    } else {
      toast({ title: "Error", description: `Folder "${folderName}" not found in its parent path "${folderPath}" for deletion.`, variant: "destructive" });
    }
  }, [customConfig, updateAndSaveConfig, toast]);


  return {
    customConfig,
    isLoadingConfig,
    configError,
    configMessageId,
    loadOrCreateConfig,
    updateAndSaveConfig,
    addVirtualFolderInConfig,
    removeVirtualFolderFromConfig,
    resetConfigState,
    setIsConnected,
  };
}

