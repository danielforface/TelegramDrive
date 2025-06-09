
"use client";

import { useState, useCallback, useEffect } from 'react';
import type { GlobalDriveConfigV1, InputPeer, GlobalDriveFolderEntry } from '@/types';
import * as telegramService from '@/services/telegramService';
import { GLOBAL_DRIVE_CONFIG_FILENAME } from '@/services/telegramCloud'; // Import the constant
import type { useToast } from "@/hooks/use-toast";
import { normalizePath } from '@/lib/vfsUtils';


const DEFAULT_GLOBAL_DRIVE_CONFIG: GlobalDriveConfigV1 = {
  app_signature: "GLOBAL_DRIVE_CONFIG_V1.0",
  version: 1,
  last_updated_timestamp_utc: "", // Will be set on creation/update
  root_entries: {}
};

const GLOBAL_DRIVE_CONFIG_CAPTION_KEY = "app_feature"; // Duplicated from telegramCloud, keep for local ref if needed
const GLOBAL_DRIVE_CONFIG_CAPTION_VALUE = "telegram_cloudifier_global_drive_config_v1"; // Duplicated

interface UseGlobalDriveConfigManagerProps {
  toast: ReturnType<typeof useToast>['toast'];
  handleGlobalApiError: (error: any, title: string, defaultMessage: string, doPageReset?: boolean) => void;
  isConnected: boolean;
}

export function useGlobalDriveConfigManager({
  toast,
  handleGlobalApiError,
  isConnected: initialIsConnected,
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
  }, [setIsConnectedInternal]);


  useEffect(() => {
    const fetchSelfPeer = async () => {
      if (isConnectedInternal && !selfPeer) {
        try {
          const peer = await telegramService.getSelfInputPeer();
          setSelfPeer(peer);
        } catch (e: any) {
          const errMsg = "Failed to get self peer for config management: " + e.message;
          setConfigError(errMsg);
          // console.error(errMsg, e);
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

    const oldConfigMessageIdToPotentiallyDelete = configMessageId;

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

      if (oldConfigMessageIdToPotentiallyDelete && oldConfigMessageIdToPotentiallyDelete !== newConfigMsgId && selfPeer) {
        try {
            await telegramService.deleteTelegramMessages(selfPeer, [oldConfigMessageIdToPotentiallyDelete]);
        } catch (deleteError: any) {
            // console.warn("Failed to delete old config message, but new one is set:", deleteError.message);
        }
      }

      setCustomConfig(updatedConfigWithTimestamp);
      setConfigMessageId(newConfigMsgId);
      toast({ title: "Configuration Saved", description: "Your Global Drive custom organization has been updated." });
      return true;
    } catch (error: any) {
      const errMsg = error.message || "Failed to update and save configuration.";
      setConfigError(errMsg);
      handleGlobalApiError(error, "Error Saving Configuration", "Could not save custom Global Drive configuration.");
      // console.error("Error saving configuration:", error);
      return false;
    } finally {
      setIsLoadingConfig(false);
    }
  }, [isConnectedInternal, selfPeer, toast, handleGlobalApiError, configMessageId]);

  const loadOrCreateConfig = useCallback(async () => {
    if (isLoadingConfig) return;
    if (customConfig && !configError) { // If already loaded and no error, don't re-load
        // console.log("Custom config already loaded and no error, skipping load.");
        return;
    }

    if (!isConnectedInternal || !selfPeer) {
      setConfigError("Not connected or self peer not available for loading/creating config.");
      setIsLoadingConfig(false); // Ensure loading is false if we bail early
      return;
    }

    setIsLoadingConfig(true);
    setConfigError(null); // Clear previous errors before attempting to load

    try {
      toast({ title: "Custom Config", description: "Searching for your Global Drive configuration in Saved Messages..."});
      const existingConfigMessage = await telegramService.searchSelfMessagesByCaption(
        GLOBAL_DRIVE_CONFIG_CAPTION_KEY,
        GLOBAL_DRIVE_CONFIG_CAPTION_VALUE
      );

      if (existingConfigMessage && existingConfigMessage.media && existingConfigMessage.media._ === 'messageMediaDocument') {
        const document = existingConfigMessage.media.document;
        const configFilename = document.attributes.find((a:any) => a._ === 'documentAttributeFilename')?.file_name || "config file";
        toast({ title: "Custom Config", description: `Found existing config file: "${configFilename}". Downloading content...`});

        const jsonContent = await telegramService.downloadDocumentContent(document);
        if (jsonContent) {
          try {
            const parsedConfig = JSON.parse(jsonContent) as GlobalDriveConfigV1;
            if (parsedConfig.app_signature === DEFAULT_GLOBAL_DRIVE_CONFIG.app_signature) {
              setCustomConfig(parsedConfig);
              setConfigMessageId(existingConfigMessage.id);
              setConfigError(null); // Clear any previous error
              toast({ title: "Custom Config Loaded", description: `Successfully loaded custom organization from "${configFilename}".` });
            } else {
              const errMsg = `Found "${configFilename}", but its app_signature is invalid. Please check the file. To create a new config, ensure no validly named (but invalid signature) file exists or add a folder in custom mode.`;
              setConfigError(errMsg);
              setCustomConfig(null); // Ensure no invalid config is used
              toast({ title: "Config Invalid Signature", description: errMsg, variant: "destructive", duration: 10000 });
            }
          } catch (parseError: any) {
            const errMsg = `Could not parse "${configFilename}": ${parseError.message}. It might be corrupted. Please check the file or create a new config.`;
            setConfigError(errMsg);
            setCustomConfig(null);
            toast({ title: "Config Corrupted", description: errMsg, variant: "destructive", duration: 10000 });
          }
        } else {
          const errMsg = `Could not download content of "${configFilename}". Check network or file access. To create a new config, ensure this file is not present or add a folder.`;
          setConfigError(errMsg);
          setCustomConfig(null);
          toast({ title: "Config Download Failed", description: errMsg, variant: "destructive", duration: 10000 });
        }
      } else {
         // No existing config message found. Safe to proceed to set a default one for new creation.
         toast({ title: "Custom Config", description: "No existing configuration file found. A new one will be created if you add custom folders."});
         const initialEmptyConfig: GlobalDriveConfigV1 = {
           ...DEFAULT_GLOBAL_DRIVE_CONFIG,
           last_updated_timestamp_utc: new Date().toISOString(),
         };
         setCustomConfig(initialEmptyConfig);
         setConfigError(null); // No error if we're setting a default for a non-existent config
         setConfigMessageId(null); // No message ID for a new, unsaved config
      }
    } catch (error: any) {
      // Error during searchSelfMessagesByCaption or other unexpected issues
      const errMsg = error.message || "An unknown error occurred while managing custom config.";
      setConfigError(errMsg);
      handleGlobalApiError(error, "Custom Config Error", "Failed to load or prepare custom Global Drive configuration.");
      setCustomConfig(null);
      setConfigMessageId(null);
      // console.error("Error in loadOrCreateConfig:", error);
    } finally {
      setIsLoadingConfig(false);
    }
  }, [
    isConnectedInternal, selfPeer, toast, handleGlobalApiError, isLoadingConfig, customConfig, configError
  ]);

  const resetConfigState = useCallback(() => {
    setCustomConfig(null);
    setIsLoadingConfig(false);
    setConfigError(null);
    setConfigMessageId(null);
    // console.log("Global Drive Config Manager state reset.");
  }, []);

  const addVirtualFolderInConfig = useCallback(async (parentPath: string, folderName: string) => {
    let currentConfigForAdd = customConfig;
    if (!currentConfigForAdd || (configError && currentConfigForAdd.app_signature !== DEFAULT_GLOBAL_DRIVE_CONFIG.app_signature)) {
      currentConfigForAdd = {
        ...DEFAULT_GLOBAL_DRIVE_CONFIG,
        last_updated_timestamp_utc: new Date().toISOString(),
      };
      toast({ title: "Initializing Config", description: "Creating initial custom drive configuration as none was loaded or previous was in error."});
      setConfigError(null); // Clear error when user takes action to create
    }

    const newConfig = JSON.parse(JSON.stringify(currentConfigForAdd)) as GlobalDriveConfigV1;
    let currentEntries = newConfig.root_entries;
    const segments = normalizePath(parentPath).split('/').filter(s => s);

    for (const segment of segments) {
      if (currentEntries[segment] && currentEntries[segment].type === 'folder' && (currentEntries[segment] as GlobalDriveFolderEntry).entries) {
        currentEntries = (currentEntries[segment] as GlobalDriveFolderEntry).entries;
      } else {
        toast({ title: "Error", description: `Invalid parent path: ${parentPath}`, variant: "destructive" });
        // console.error(`Invalid parent path segment "${segment}" in addVirtualFolderInConfig`);
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
  }, [customConfig, updateAndSaveConfig, toast, configError]);

  const removeVirtualFolderFromConfig = useCallback(async (folderPath: string, folderName: string) => {
    if (!customConfig) {
      toast({ title: "Error", description: "No custom config loaded to remove folder from.", variant: "destructive" });
      // console.error("removeVirtualFolderFromConfig: No custom config loaded.");
      return;
    }
    if (configError && customConfig.app_signature !== DEFAULT_GLOBAL_DRIVE_CONFIG.app_signature) {
      toast({ title: "Error", description: "Current configuration is in an error state or invalid. Cannot modify.", variant: "destructive" });
      // console.error("removeVirtualFolderFromConfig: Config is in error state.");
      return;
    }

    const newConfig = JSON.parse(JSON.stringify(customConfig)) as GlobalDriveConfigV1;
    let parentEntries = newConfig.root_entries;
    const segments = normalizePath(folderPath).split('/').filter(s => s);

    for (const segment of segments) {
      if (parentEntries[segment] && parentEntries[segment].type === 'folder' && (parentEntries[segment] as GlobalDriveFolderEntry).entries) {
        parentEntries = (parentEntries[segment] as GlobalDriveFolderEntry).entries;
      } else {
        toast({ title: "Error", description: `Invalid parent path segment "${segment}" for deletion of "${folderName}"`, variant: "destructive" });
        // console.error(`Invalid parent path segment "${segment}" in removeVirtualFolderFromConfig`);
        return;
      }
    }

    if (parentEntries[folderName] && parentEntries[folderName].type === 'folder') {
      delete parentEntries[folderName];
      await updateAndSaveConfig(newConfig);
    } else {
      toast({ title: "Error", description: `Folder "${folderName}" not found in its parent path "${folderPath}" for deletion.`, variant: "destructive" });
      // console.error(`Folder "${folderName}" not found in path "${folderPath}" for deletion.`);
    }
  }, [customConfig, updateAndSaveConfig, toast, configError]);

  const handleDownloadCurrentConfig = useCallback(() => {
    if (!customConfig) {
      toast({
        title: "No Configuration Loaded",
        description: "There is no custom Global Drive configuration currently loaded to download.",
        variant: "destructive",
      });
      return;
    }
    if (configError && customConfig.app_signature !== DEFAULT_GLOBAL_DRIVE_CONFIG.app_signature) {
       toast({
        title: "Cannot Download Invalid Config",
        description: "The currently loaded configuration has errors or is invalid. Please resolve issues or create a new one.",
        variant: "destructive",
      });
      return;
    }

    try {
      const configJson = JSON.stringify(customConfig, null, 2);
      const blob = new Blob([configJson], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = GLOBAL_DRIVE_CONFIG_FILENAME;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({
        title: "Configuration Downloading",
        description: `${GLOBAL_DRIVE_CONFIG_FILENAME} has started downloading.`,
      });
    } catch (error: any) {
      const errMsg = `Failed to prepare configuration for download: ${error.message}`;
      toast({
        title: "Download Error",
        description: errMsg,
        variant: "destructive",
      });
      handleGlobalApiError(error, "Config Download Error", "Could not download custom configuration.");
      // console.error(errMsg, error);
    }
  }, [customConfig, toast, handleGlobalApiError, configError]);


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
    handleDownloadCurrentConfig,
  };
}

