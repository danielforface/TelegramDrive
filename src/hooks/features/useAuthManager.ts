
"use client";

import { useState, useCallback } from 'react';
import type { useToast } from "@/hooks/use-toast";
import * as telegramService from '@/services/telegramService';

type AuthStep = 'initial' | 'awaiting_code' | 'awaiting_password';

interface UseAuthManagerProps {
  onAuthSuccess: (user: any) => void;
  setGlobalIsConnecting: (isConnecting: boolean) => void;
  setGlobalPhoneNumberForDisplay: (phoneNumber: string) => void;
  toast: ReturnType<typeof useToast>['toast'];
  handleGlobalApiError: (error: any, title: string, defaultMessage: string, doPageReset?: boolean) => void;
}

export function useAuthManager({
  onAuthSuccess,
  setGlobalIsConnecting,
  setGlobalPhoneNumberForDisplay,
  toast,
  handleGlobalApiError,
}: UseAuthManagerProps) {
  const [authStep, setAuthStep] = useState<AuthStep>('initial');
  const [authInputPhoneNumber, setAuthInputPhoneNumber] = useState(''); // For phone number input field
  const [authPhoneCode, setAuthPhoneCode] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);

  const handleSendCode = useCallback(async (fullPhoneNumberFromInput: string) => {
    if (!fullPhoneNumberFromInput || !fullPhoneNumberFromInput.startsWith('+') || fullPhoneNumberFromInput.length < 5) {
      setAuthError("Phone number is required and must be valid (e.g. +1234567890).");
      toast({ title: "Invalid Phone Number", description: "Please select a country and enter a valid number.", variant: "destructive" });
      return;
    }
    setGlobalIsConnecting(true);
    setAuthError(null);
    setAuthInputPhoneNumber(fullPhoneNumberFromInput); // Store the number used for this attempt
    setGlobalPhoneNumberForDisplay(fullPhoneNumberFromInput); // Update global display
    toast({ title: "Sending Code...", description: `Requesting verification code for ${fullPhoneNumberFromInput}.` });

    try {
      await telegramService.sendCode(fullPhoneNumberFromInput);
      setAuthStep('awaiting_code');
      toast({ title: "Code Sent!", description: "Please check Telegram for your verification code." });
    } catch (error: any) {
      handleGlobalApiError(error, "Error Sending Code", `Could not send verification code. ${error.message}`, false);
       if (error.message === 'AUTH_RESTART') {
        setAuthStep('initial');
      }
    } finally {
      setGlobalIsConnecting(false);
    }
  }, [setGlobalIsConnecting, setGlobalPhoneNumberForDisplay, toast, handleGlobalApiError]);

  const handleSignIn = useCallback(async (currentPhoneCode: string) => {
    if (!currentPhoneCode) {
      setAuthError("Verification code is required.");
      toast({ title: "Verification Code Required", description: "Please enter the code sent to you.", variant: "destructive" });
      return;
    }
    setGlobalIsConnecting(true);
    setAuthError(null);
    setAuthPhoneCode(currentPhoneCode);
    toast({ title: "Verifying Code...", description: "Checking your verification code with Telegram." });
    try {
      // authInputPhoneNumber holds the phone number that sendCode was called with
      const result = await telegramService.signIn(authInputPhoneNumber, currentPhoneCode);
      if (result.user) {
        setAuthStep('initial'); // Reset auth flow state
        setAuthPhoneCode('');   // Clear code input
        setAuthPassword('');  // Clear password input
        onAuthSuccess(result.user);
      } else {
        // This case should ideally be handled by signIn throwing an error.
        handleGlobalApiError({ message: "Sign in failed. Unexpected response from server." }, "Sign In Failed", "Unexpected response from server.", false);
      }
    } catch (error: any) {
      if (error.message === '2FA_REQUIRED' && (error as any).srp_id) {
        setAuthStep('awaiting_password');
        setAuthError(null); // Clear previous errors
        toast({ title: "2FA Required", description: "Please enter your two-factor authentication password." });
      } else {
        handleGlobalApiError(error, "Sign In Failed", `Could not sign in. ${error.message}`, false);
        if (error.message === 'AUTH_RESTART') {
          setAuthStep('initial');
        }
      }
    } finally {
      setGlobalIsConnecting(false);
    }
  }, [authInputPhoneNumber, setGlobalIsConnecting, onAuthSuccess, toast, handleGlobalApiError]);

  const handleCheckPassword = useCallback(async (currentPassword: string) => {
    if (!currentPassword) {
      setAuthError("Password is required.");
      toast({ title: "Password Required", description: "Please enter your 2FA password.", variant: "destructive" });
      return;
    }
    setGlobalIsConnecting(true);
    setAuthError(null);
    setAuthPassword(currentPassword);
    toast({ title: "Verifying Password...", description: "Checking your 2FA password." });
    try {
      const user = await telegramService.checkPassword(currentPassword);
      if (user) {
        setAuthStep('initial');
        setAuthPhoneCode('');
        setAuthPassword('');
        onAuthSuccess(user);
      } else {
        handleGlobalApiError({ message: "2FA failed. Unexpected response from server." }, "2FA Failed", "Unexpected response from server.", false);
      }
    } catch (error: any) {
      handleGlobalApiError(error, "2FA Failed", `Could not verify password. ${error.message}`, false);
      if (error.message === 'AUTH_RESTART') {
        setAuthStep('initial');
      }
    } finally {
      setGlobalIsConnecting(false);
    }
  }, [setGlobalIsConnecting, onAuthSuccess, toast, handleGlobalApiError]);

  const resetAuthVisuals = useCallback(() => {
    setAuthStep('initial');
    setAuthInputPhoneNumber(''); // Clear the stored phone number for auth attempts
    setAuthPhoneCode('');
    setAuthPassword('');
    setAuthError(null);
  }, []);

  return {
    authStep,
    setAuthStep,
    authInputPhoneNumber, // This is distinct from globalPhoneNumberForDisplay
    setAuthInputPhoneNumber,
    authPhoneCode,
    setAuthPhoneCode,
    authPassword,
    setAuthPassword,
    authError,
    setAuthError,
    handleSendCode,
    handleSignIn,
    handleCheckPassword,
    resetAuthVisuals,
  };
}
