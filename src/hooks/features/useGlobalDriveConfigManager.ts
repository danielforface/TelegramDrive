
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

const GLOBAL_DRIVE_CONFIG_CAPTION_KEY = "app_feature"; 
const GLOBAL_DRIVE_CONFIG_CAPTION_VALUE = "telegram_cloudifier_global_drive_config_v1"; 

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
          console.error(errMsg, e);
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
            console.warn("Failed to delete old config message, but new one is set:", deleteError.message);
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
      console.error("Error saving configuration:", error);
      return false;
    } finally {
      setIsLoadingConfig(false);
    }
  }, [isConnectedInternal, selfPeer, toast, handleGlobalApiError, configMessageId]);

  const loadOrCreateConfig = useCallback(async () => {
    console.log("[GDC_LoadOrCreate] Attempting to load or create config. isLoadingConfig:", isLoadingConfig);
    if (isLoadingConfig) return;
    if (customConfig && !configError) { 
        console.log("[GDC_LoadOrCreate] Custom config already loaded and no error, skipping load.");
        return;
    }

    console.log("[GDC_LoadOrCreate] isConnectedInternal:", isConnectedInternal, "selfPeer:", selfPeer);
    if (!isConnectedInternal || !selfPeer) {
      const errorMsg = "Not connected or self peer not available for loading/creating config.";
      setConfigError(errorMsg);
      setIsLoadingConfig(false); 
      console.error("[GDC_LoadOrCreate] Error:", errorMsg);
      return;
    }

    setIsLoadingConfig(true);
    setConfigError(null); 
    console.log("[GDC_LoadOrCreate] Starting search for existing config file.");
    toast({ title: "Custom Config", description: "Searching for your Global Drive configuration in Saved Messages..."});

    try {
      const existingConfigMessage = await telegramService.searchSelfMessagesByCaption(
        GLOBAL_DRIVE_CONFIG_CAPTION_KEY,
        GLOBAL_DRIVE_CONFIG_CAPTION_VALUE
      );

      console.log("[GDC_LoadOrCreate] searchSelfMessagesByCaption result:", existingConfigMessage);

      if (existingConfigMessage && existingConfigMessage.media && existingConfigMessage.media._ === 'messageMediaDocument') {
        const document = existingConfigMessage.media.document;
        const configFilename = document.attributes.find((a:any) => a._ === 'documentAttributeFilename')?.file_name || "config file";
        console.log(`[GDC_LoadOrCreate] Found existing config file message: "${configFilename}", ID: ${existingConfigMessage.id}`);
        toast({ title: "Custom Config", description: `Found existing config file: "${configFilename}". Downloading content...`});

        const jsonContent = await telegramService.downloadDocumentContent(document);
        console.log("[GDC_LoadOrCreate] Downloaded JSON content:", jsonContent);

        if (jsonContent) {
          try {
            const parsedConfig = JSON.parse(jsonContent) as GlobalDriveConfigV1;
            console.log("[GDC_LoadOrCreate] Parsed JSON content:", parsedConfig);

            if (parsedConfig.app_signature === DEFAULT_GLOBAL_DRIVE_CONFIG.app_signature) {
              console.log("[GDC_LoadOrCreate] Config signature valid. Setting custom config.");
              setCustomConfig(parsedConfig);
              setConfigMessageId(existingConfigMessage.id);
              setConfigError(null); 
              toast({ title: "Custom Config Loaded", description: `Successfully loaded custom organization from "${configFilename}".` });
            } else {
              const errMsg = `Found "${configFilename}", but its app_signature is invalid (expected "${DEFAULT_GLOBAL_DRIVE_CONFIG.app_signature}", got "${parsedConfig.app_signature}"). Please check the file.`;
              console.error("[GDC_LoadOrCreate] Config signature invalid:", errMsg);
              setConfigError(errMsg);
              setCustomConfig(null); 
              toast({ title: "Config Invalid Signature", description: errMsg, variant: "destructive", duration: 10000 });
            }
          } catch (parseError: any) {
            const errMsg = `Could not parse "${configFilename}": ${parseError.message}. It might be corrupted. Please check the file or create a new config.`;
            console.error("[GDC_LoadOrCreate] JSON parse error:", errMsg, "Raw content:", jsonContent);
            setConfigError(errMsg);
            setCustomConfig(null);
            toast({ title: "Config Corrupted", description: errMsg, variant: "destructive", duration: 10000 });
          }
        } else {
          const errMsg = `Could not download content of "${configFilename}". Check network or file access. To create a new config, ensure this file is not present or add a folder.`;
          console.error("[GDC_LoadOrCreate] Config download failed.");
          setConfigError(errMsg);
          setCustomConfig(null);
          toast({ title: "Config Download Failed", description: errMsg, variant: "destructive", duration: 10000 });
        }
      } else {
         console.log("[GDC_LoadOrCreate] No existing configuration file found. Initializing with default empty config.");
         toast({ title: "Custom Config", description: "No existing configuration file found. A new one will be created if you add custom folders."});
         const initialEmptyConfig: GlobalDriveConfigV1 = {
           ...DEFAULT_GLOBAL_DRIVE_CONFIG,
           last_updated_timestamp_utc: new Date().toISOString(),
         };
         setCustomConfig(initialEmptyConfig);
         setConfigError(null); 
         setConfigMessageId(null); 
      }
    } catch (error: any) {
      const errMsg = error.message || "An unknown error occurred while managing custom config.";
      console.error("[GDC_LoadOrCreate] Error in loadOrCreateConfig:", error);
      setConfigError(errMsg);
      handleGlobalApiError(error, "Custom Config Error", "Failed to load or prepare custom Global Drive configuration.");
      setCustomConfig(null);
      setConfigMessageId(null);
    } finally {
      setIsLoadingConfig(false);
      console.log("[GDC_LoadOrCreate] Finished loadOrCreateConfig. isLoadingConfig set to false.");
    }
  }, [
    isConnectedInternal, selfPeer, toast, handleGlobalApiError, isLoadingConfig, customConfig, configError
  ]);

  const resetConfigState = useCallback(() => {
    setCustomConfig(null);
    setIsLoadingConfig(false);
    setConfigError(null);
    setConfigMessageId(null);
    console.log("[GDC_Manager] Global Drive Config Manager state reset.");
  }, []);

  const addVirtualFolderInConfig = useCallback(async (parentPath: string, folderName: string) => {
    let currentConfigForAdd = customConfig;
    if (!currentConfigForAdd || (configError && currentConfigForAdd.app_signature !== DEFAULT_GLOBAL_DRIVE_CONFIG.app_signature)) {
      currentConfigForAdd = {
        ...DEFAULT_GLOBAL_DRIVE_CONFIG,
        last_updated_timestamp_utc: new Date().toISOString(),
      };
      toast({ title: "Initializing Config", description: "Creating initial custom drive configuration as none was loaded or previous was in error."});
      setConfigError(null); 
    }

    const newConfig = JSON.parse(JSON.stringify(currentConfigForAdd)) as GlobalDriveConfigV1;
    let currentEntries = newConfig.root_entries;
    const segments = normalizePath(parentPath).split('/').filter(s => s);

    for (const segment of segments) {
      if (currentEntries[segment] && currentEntries[segment].type === 'folder' && (currentEntries[segment] as GlobalDriveFolderEntry).entries) {
        currentEntries = (currentEntries[segment] as GlobalDriveFolderEntry).entries;
      } else {
        toast({ title: "Error", description: `Invalid parent path: ${parentPath}`, variant: "destructive" });
        console.error(`[GDC_AddFolder] Invalid parent path segment "${segment}" in addVirtualFolderInConfig`);
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
      console.error("[GDC_RemoveFolder] No custom config loaded.");
      return;
    }
    if (configError && customConfig.app_signature !== DEFAULT_GLOBAL_DRIVE_CONFIG.app_signature) {
      toast({ title: "Error", description: "Current configuration is in an error state or invalid. Cannot modify.", variant: "destructive" });
      console.error("[GDC_RemoveFolder] Config is in error state.");
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
        console.error(`[GDC_RemoveFolder] Invalid parent path segment "${segment}"`);
        return;
      }
    }

    if (parentEntries[folderName] && parentEntries[folderName].type === 'folder') {
      delete parentEntries[folderName];
      await updateAndSaveConfig(newConfig);
    } else {
      toast({ title: "Error", description: `Folder "${folderName}" not found in its parent path "${folderPath}" for deletion.`, variant: "destructive" });
      console.error(`[GDC_RemoveFolder] Folder "${folderName}" not found in path "${folderPath}"`);
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
      console.error("[GDC_DownloadConfig] Error:", errMsg, error);
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

