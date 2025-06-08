
"use client";

import { useState, useCallback, useRef } from 'react';
import type { useToast } from "@/hooks/use-toast";
import * as telegramService from '@/services/telegramService';
import type { CloudFolder } from '@/types';

interface UseConnectionManagerProps {
  toast: ReturnType<typeof useToast>['toast'];
  onInitialConnect: () => Promise<void>; // Callback to fetch initial data
  onResetApp: () => void; // Callback to reset all page state
  setAuthStep: (step: 'initial' | 'awaiting_code' | 'awaiting_password') => void;
  handleGlobalApiError: (error: any, title: string, defaultMessage: string, doPageReset?: boolean) => void;
  handleNewCloudChannelDiscoveredAppLevel: (folder: CloudFolder, source: 'update' | 'initialScan') => void;
  setGlobalPhoneNumberForDisplay: (phone: string) => void;
}

export function useConnectionManager({
  toast,
  onInitialConnect,
  onResetApp,
  setAuthStep,
  handleGlobalApiError,
  handleNewCloudChannelDiscoveredAppLevel,
  setGlobalPhoneNumberForDisplay,
}: UseConnectionManagerProps) {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false); // General connecting state for the app
  const telegramUpdateListenerInitializedRef = useRef(false);


  const handleReset = useCallback(async (performServerLogout = true) => {
    const currentIsConnected = isConnected; // Capture current state

    if (performServerLogout && currentIsConnected) {
      toast({ title: "Disconnecting...", description: "Logging out from Telegram." });
      try {
        await telegramService.signOut();
        toast({ title: "Disconnected", description: "Successfully signed out." });
      } catch (error: any) {
        if (!(error.message && error.message.includes('AUTH_KEY_UNREGISTERED'))) {
          toast({ title: "Disconnection Error", description: error.message || "Could not sign out properly from server.", variant: "destructive" });
        }
      }
    }

    setIsConnected(false);
    setIsConnecting(false); // Ensure this is reset
    setAuthStep('initial');
    setGlobalPhoneNumberForDisplay('');
    telegramUpdateListenerInitializedRef.current = false;
    onResetApp(); // Call the main app reset function
  }, [isConnected, toast, setAuthStep, onResetApp, setGlobalPhoneNumberForDisplay]);


  const checkExistingConnection = useCallback(async () => {
    setIsConnecting(true); // Use global connecting state
    try {
      const previouslyConnected = await telegramService.isUserConnected();
      if (previouslyConnected) {
        const storedUser = telegramService.getUserSessionDetails();
        if (storedUser && storedUser.phone) setGlobalPhoneNumberForDisplay(storedUser.phone);

        setIsConnected(true);
        setAuthStep('initial'); // Should be initial if already connected

        await onInitialConnect(); // Fetch initial data

        if (!telegramUpdateListenerInitializedRef.current) {
          telegramService.initializeTelegramUpdateListener(handleNewCloudChannelDiscoveredAppLevel);
          telegramUpdateListenerInitializedRef.current = true;
        }
      } else {
        setIsConnected(false);
        setGlobalPhoneNumberForDisplay('');
        setAuthStep('initial');
        handleReset(false); // Reset app state but don't try to logout from server if not connected
      }
    } catch (error: any) {
      const errorMessage = error.message || (error.originalErrorObject?.error_message);
      if (errorMessage?.includes("Invalid hash in mt_dh_gen_ok")) {
        toast({
          title: "Connection Handshake Failed",
          description: "Could not establish a secure connection. Verify API ID/Hash. Try clearing localStorage & restarting server.",
          variant: "destructive", duration: 10000,
        });
      } else if (errorMessage === 'AUTH_RESTART') {
        handleGlobalApiError(error, "Authentication Expired", "Your session needs to be re-initiated.", true);
      } else {
        handleGlobalApiError(error, "Connection Check Error", `Failed to verify existing connection. ${errorMessage}`, true);
      }
      setIsConnected(false);
      // Further state reset handled by handleGlobalApiError or handleReset
    } finally {
      setIsConnecting(false);
    }
  }, [
    toast,
    handleGlobalApiError,
    onInitialConnect,
    handleReset,
    setAuthStep,
    handleNewCloudChannelDiscoveredAppLevel,
    setGlobalPhoneNumberForDisplay
  ]);

  const onAuthSuccessMain = useCallback(async (/* user: any */) => {
    setIsConnected(true);
    setIsConnecting(true); // To show loading for initial data fetch
    try {
      await onInitialConnect();
      if (!telegramUpdateListenerInitializedRef.current) {
          telegramService.initializeTelegramUpdateListener(handleNewCloudChannelDiscoveredAppLevel);
          telegramUpdateListenerInitializedRef.current = true;
      }
      toast({ title: "Sign In Successful!", description: "Connected to Telegram." });
    } catch (error) {
        // Error handling for initial data fetch will be in onInitialConnect or its sub-functions
    } finally {
        setIsConnecting(false);
    }
  }, [onInitialConnect, toast, handleNewCloudChannelDiscoveredAppLevel]);


  return {
    isConnected,
    setIsConnected, // Expose setter for direct manipulation if needed from auth success
    isConnecting,
    setIsConnecting, // Global connecting state
    checkExistingConnection,
    handleReset,
    onAuthSuccessMain,
    telegramUpdateListenerInitializedRef,
  };
}
