
"use client";

import { useState, useCallback, useEffect } from 'react';
import type { GlobalDriveConfigV1, InputPeer } from '@/types';
import * as telegramService from '@/services/telegramService';
import type { useToast } from "@/hooks/use-toast";

const GLOBAL_DRIVE_CONFIG_FILENAME = "telegram_cloudifier_global_drive_config_v1.json";
const GLOBAL_DRIVE_CONFIG_CAPTION_KEY = "app_feature";
const GLOBAL_DRIVE_CONFIG_CAPTION_VALUE = "telegram_cloudifier_global_drive_config_v1";

const DEFAULT_GLOBAL_DRIVE_CONFIG: GlobalDriveConfigV1 = {
  app_signature: "GLOBAL_DRIVE_CONFIG_V1.0",
  version: 1,
  root_entries: {
    "My Photos": { type: "folder", name: "My Photos", created_at: new Date().toISOString(), modified_at: new Date().toISOString(), entries: {} },
    "Important Videos": { type: "folder", name: "Important Videos", created_at: new Date().toISOString(), modified_at: new Date().toISOString(), entries: {} },
    "Shared Documents": { type: "folder", name: "Shared Documents", created_at: new Date().toISOString(), modified_at: new Date().toISOString(), entries: {} },
  }
};

interface UseGlobalDriveConfigManagerProps {
  toast: ReturnType<typeof useToast>['toast'];
  handleGlobalApiError: (error: any, title: string, defaultMessage: string, doPageReset?: boolean) => void;
  isConnected: boolean;
}

export function useGlobalDriveConfigManager({
  toast,
  handleGlobalApiError,
  isConnected,
}: UseGlobalDriveConfigManagerProps) {
  const [customConfig, setCustomConfig] = useState<GlobalDriveConfigV1 | null>(null);
  const [isLoadingConfig, setIsLoadingConfig] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);
  const [selfPeer, setSelfPeer] = useState<InputPeer | null>(null);

  useEffect(() => {
    const fetchSelfPeer = async () => {
      if (isConnected && !selfPeer) {
        const peer = await telegramService.getSelfInputPeer();
        setSelfPeer(peer);
      }
    };
    fetchSelfPeer();
  }, [isConnected, selfPeer]);

  const loadOrCreateConfig = useCallback(async () => {
    if (!isConnected || !selfPeer) {
      setConfigError("Not connected or self peer not available.");
      // toast({ title: "Cannot Load Config", description: "Please connect to Telegram first.", variant: "destructive" });
      return;
    }

    setIsLoadingConfig(true);
    setConfigError(null);
    setCustomConfig(null);

    try {
      // 1. Search for existing pinned config message
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

      // 2. If not found or invalid, create and upload a new one
      toast({ title: "Custom Config", description: `Creating default configuration file "${GLOBAL_DRIVE_CONFIG_FILENAME}"...`});
      const defaultConfigJson = JSON.stringify(DEFAULT_GLOBAL_DRIVE_CONFIG, null, 2);
      const caption = { [GLOBAL_DRIVE_CONFIG_CAPTION_KEY]: GLOBAL_DRIVE_CONFIG_CAPTION_VALUE };

      const sentMessage = await telegramService.uploadTextAsFileToSelfChat(
        GLOBAL_DRIVE_CONFIG_FILENAME,
        defaultConfigJson,
        "application/json",
        caption
      );

      if (sentMessage && sentMessage.id) {
        toast({ title: "Custom Config File Created", description: `"${GLOBAL_DRIVE_CONFIG_FILENAME}" uploaded to your Saved Messages.`});
        // Unpin all messages in self chat first, then pin the new config.
        await telegramService.unpinAllSelfChatMessages(); // Best effort
        const pinned = await telegramService.pinSelfChatMessage(sentMessage.id, true);
        if (pinned) {
          toast({ title: "Custom Config Pinned", description: "New configuration file has been pinned in your Saved Messages." });
        } else {
          toast({ title: "Pinning Failed", description: "Could not pin the new config file. Please pin it manually.", variant: "default" });
        }
        setCustomConfig(DEFAULT_GLOBAL_DRIVE_CONFIG);
      } else {
        throw new Error("Failed to upload or confirm new configuration file message.");
      }

    } catch (error: any) {
      setConfigError(error.message || "An unknown error occurred while managing custom config.");
      handleGlobalApiError(error, "Custom Config Error", "Failed to load or create custom Global Drive configuration.");
      setCustomConfig(null);
    } finally {
      setIsLoadingConfig(false);
    }
  }, [isConnected, selfPeer, toast, handleGlobalApiError]);
  
  const resetConfigState = useCallback(() => {
    setCustomConfig(null);
    setIsLoadingConfig(false);
    setConfigError(null);
    // selfPeer is not reset here as it depends on connection status
  }, []);


  return {
    customConfig,
    isLoadingConfig,
    configError,
    loadOrCreateConfig,
    resetConfigState,
  };
}
