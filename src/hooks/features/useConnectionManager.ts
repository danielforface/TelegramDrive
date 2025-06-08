
"use client";

import { useState, useCallback, useRef, useEffect } from 'react'; // Added useEffect
import type { useToast } from "@/hooks/use-toast";
import * as telegramService from '@/services/telegramService';
import type { CloudFolder } from '@/types';

interface UseConnectionManagerProps {
  toast: ReturnType<typeof useToast>['toast'];
  onInitialConnect: () => Promise<void>; 
  onResetApp: () => void; 
  setAuthStep: (step: 'initial' | 'awaiting_code' | 'awaiting_password') => void;
  handleGlobalApiError: (error: any, title: string, defaultMessage: string, doPageReset?: boolean) => void;
  handleNewCloudChannelDiscoveredAppLevel: (folder: CloudFolder, source: 'update' | 'initialScan') => void;
  setGlobalPhoneNumberForDisplay: (phone: string) => void; // Renamed from appPhoneNumber setter for clarity
  appPhoneNumber: string; // Current phone number for display, from AuthManager
}

export function useConnectionManager({
  toast,
  onInitialConnect,
  onResetApp,
  setAuthStep,
  handleGlobalApiError,
  handleNewCloudChannelDiscoveredAppLevel,
  setGlobalPhoneNumberForDisplay, // Renamed prop
  appPhoneNumber, // Added prop
}: UseConnectionManagerProps) {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const telegramUpdateListenerInitializedRef = useRef(false);
  const [currentAppPhoneNumber, setCurrentAppPhoneNumber] = useState(appPhoneNumber); // Local state for phone number

  // Update local phone number when the prop changes (from AuthManager)
  useEffect(() => {
    setCurrentAppPhoneNumber(appPhoneNumber);
    setGlobalPhoneNumberForDisplay(appPhoneNumber); // Ensure global display is also updated
  }, [appPhoneNumber, setGlobalPhoneNumberForDisplay]);


  const handleReset = useCallback(async (performServerLogout = true) => {
    const currentIsConnected = isConnected; 

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
    setIsConnecting(false); 
    setAuthStep('initial');
    setCurrentAppPhoneNumber(''); // Reset local phone number
    setGlobalPhoneNumberForDisplay(''); // Reset global display
    telegramUpdateListenerInitializedRef.current = false;
    onResetApp(); 
  }, [isConnected, toast, setAuthStep, onResetApp, setGlobalPhoneNumberForDisplay]);


  const checkExistingConnection = useCallback(async () => {
    setIsConnecting(true); 
    try {
      const previouslyConnected = await telegramService.isUserConnected();
      if (previouslyConnected) {
        const storedUser = telegramService.getUserSessionDetails();
        if (storedUser && storedUser.phone) {
            setCurrentAppPhoneNumber(storedUser.phone);
            setGlobalPhoneNumberForDisplay(storedUser.phone);
        }

        setIsConnected(true);
        setAuthStep('initial'); 

        await onInitialConnect(); 

        if (!telegramUpdateListenerInitializedRef.current) {
          telegramService.initializeTelegramUpdateListener(handleNewCloudChannelDiscoveredAppLevel);
          telegramUpdateListenerInitializedRef.current = true;
        }
      } else {
        setIsConnected(false);
        setCurrentAppPhoneNumber('');
        setGlobalPhoneNumberForDisplay('');
        setAuthStep('initial');
        handleReset(false); 
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

  const onAuthSuccessMain = useCallback(async (user: any) => {
    setIsConnected(true);
    setIsConnecting(true); 
    if (user && user.phone) { // Update phone number on successful auth
        setCurrentAppPhoneNumber(user.phone);
        setGlobalPhoneNumberForDisplay(user.phone);
    }
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
  }, [onInitialConnect, toast, handleNewCloudChannelDiscoveredAppLevel, setGlobalPhoneNumberForDisplay]);


  return {
    isConnected,
    isConnecting,
    setIsConnecting, 
    checkExistingConnection,
    handleReset,
    onAuthSuccessMain,
    telegramUpdateListenerInitializedRef,
    appPhoneNumber: currentAppPhoneNumber, // Expose local state for display
    setAppPhoneNumber: setCurrentAppPhoneNumber, // Expose setter for authManager to update
  };
}

    
