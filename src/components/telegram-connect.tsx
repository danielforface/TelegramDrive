
"use client";

import type { FormEvent } from 'react';
import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AnimatedCloudIcon } from "./animated-cloud-icon";
import { Zap, KeyRound, Phone, MessageSquare, RotateCcw, Globe } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Terminal } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type AuthStep = 'initial' | 'awaiting_code' | 'awaiting_password';

interface TelegramConnectProps {
  authStep: AuthStep;
  onSendCode: (fullPhoneNumber: string) => void;
  onSignIn: (phoneCode: string) => void;
  onCheckPassword: (password: string) => void;
  isLoading: boolean;
  error: string | null;
  phoneNumber: string; // This will be the full phone number displayed in "awaiting code" etc.
  setPhoneNumber: (value: string) => void; // Used by page.tsx to update its state
  phoneCode: string;
  setPhoneCode: (value: string) => void;
  password: string;
  setPassword: (value: string) => void;
  onReset: () => void;
}

const countryData = [
  { name: 'Israel (IL)', code: '+972' },
  { name: 'United States (US)', code: '+1' },
  { name: 'United Kingdom (GB)', code: '+44' },
  { name: 'Germany (DE)', code: '+49' },
  { name: 'France (FR)', code: '+33' },
  { name: 'Russia (RU)', code: '+7' },
  { name: 'Ukraine (UA)', code: '+380' },
  // Add more countries as needed
];
const DEFAULT_COUNTRY_CODE = '+972';

export function TelegramConnect({
  authStep,
  onSendCode,
  onSignIn,
  onCheckPassword,
  isLoading,
  error,
  phoneNumber, // Used for display in later steps
  // setPhoneNumber is not directly used by the inputs in 'initial' step anymore
  phoneCode,
  setPhoneCode,
  password,
  setPassword,
  onReset,
}: TelegramConnectProps) {
  const [selectedCountryCode, setSelectedCountryCode] = useState(DEFAULT_COUNTRY_CODE);
  const [nationalOnlyPhoneNumber, setNationalOnlyPhoneNumber] = useState('');

  const handlePhoneNumberSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!nationalOnlyPhoneNumber) {
        // Optionally set an error locally if needed, or let onSendCode handle it
        onSendCode(''); // Or some indicator of invalid input
        return;
    }
    const fullNumber = selectedCountryCode + nationalOnlyPhoneNumber;
    onSendCode(fullNumber);
  };

  const handlePhoneCodeSubmit = (e: FormEvent) => {
    e.preventDefault();
    onSignIn(phoneCode);
  };

  const handlePasswordSubmit = (e: FormEvent) => {
    e.preventDefault();
    onCheckPassword(password);
  };

  const handleStartOver = () => {
    setNationalOnlyPhoneNumber('');
    setSelectedCountryCode(DEFAULT_COUNTRY_CODE);
    onReset();
  }

  const renderFormContent = () => {
    switch (authStep) {
      case 'initial':
        return (
          <form onSubmit={handlePhoneNumberSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="country-code">Country</Label>
              <Select
                value={selectedCountryCode}
                onValueChange={setSelectedCountryCode}
                disabled={isLoading}
              >
                <SelectTrigger id="country-code" className="w-full">
                  <SelectValue placeholder="Select country" />
                </SelectTrigger>
                <SelectContent>
                  {countryData.map((country) => (
                    <SelectItem key={country.code + country.name} value={country.code}>
                      {country.name} ({country.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="phone" className="text-left">Phone Number</Label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input
                  id="phone"
                  type="tel"
                  placeholder="e.g., 501234567"
                  value={nationalOnlyPhoneNumber}
                  onChange={(e) => setNationalOnlyPhoneNumber(e.target.value.replace(/\D/g, ''))} // Allow only digits
                  required
                  className="pl-10"
                  disabled={isLoading}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1">Enter your number without the country code.</p>
            </div>
            <Button type="submit" disabled={isLoading} className="w-full">
              {isLoading ? (
                <Zap className="mr-2 h-5 w-5 animate-spin" />
              ) : (
                <Zap className="mr-2 h-5 w-5" />
              )}
              Send Verification Code
            </Button>
          </form>
        );
      case 'awaiting_code':
        return (
          <form onSubmit={handlePhoneCodeSubmit} className="space-y-4">
            <div>
              <Label htmlFor="code" className="text-left">Verification Code</Label>
               <div className="relative">
                <MessageSquare className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input
                  id="code"
                  type="text"
                  placeholder="Enter code from Telegram"
                  value={phoneCode}
                  onChange={(e) => setPhoneCode(e.target.value)}
                  required
                  className="pl-10"
                  disabled={isLoading}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1">Check your Telegram messages for the code.</p>
            </div>
            <Button type="submit" disabled={isLoading} className="w-full">
              {isLoading ? (
                <Zap className="mr-2 h-5 w-5 animate-spin" />
              ) : (
                 <Zap className="mr-2 h-5 w-5" />
              )}
              Verify Code
            </Button>
          </form>
        );
      case 'awaiting_password':
        return (
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <div>
              <Label htmlFor="password">Two-Factor Password</Label>
              <div className="relative">
                <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  placeholder="Enter your 2FA password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="pl-10"
                  disabled={isLoading}
                />
              </div>
            </div>
            <Button type="submit" disabled={isLoading} className="w-full">
              {isLoading ? (
                <Zap className="mr-2 h-5 w-5 animate-spin" />
              ) : (
                 <KeyRound className="mr-2 h-5 w-5" />
              )}
              Submit Password
            </Button>
          </form>
        );
      default:
        return null;
    }
  };

  const getTitle = () => {
    switch (authStep) {
      case 'initial': return "Connect to Telegram";
      case 'awaiting_code': return "Enter Verification Code";
      case 'awaiting_password': return "Enter 2FA Password";
      default: return "Telegram Cloudifier";
    }
  };
  
  const getDescription = () => {
     switch (authStep) {
      case 'initial': return "Select your country and enter your phone number to begin.";
      case 'awaiting_code': return `We've sent a code to ${phoneNumber}. Please enter it below.`; // Uses full number from page.tsx
      case 'awaiting_password': return `Account ${phoneNumber} is protected with Two-Factor Authentication.`; // Uses full number
      default: return "Transform your chats into an organized cloud-like structure.";
    }
  }

  return (
    <Card className="w-full max-w-md shadow-xl">
      <CardHeader className="text-center">
        <div className="mx-auto mb-6">
          <AnimatedCloudIcon isAnimating={isLoading && authStep === 'initial'} />
        </div>
        <CardTitle className="text-2xl">{getTitle()}</CardTitle>
        <CardDescription>
          {getDescription()}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-center space-y-4">
        {error && (
          <Alert variant="destructive" className="w-full">
            <Terminal className="h-4 w-4" />
            <AlertTitle>Authentication Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {renderFormContent()}
      </CardContent>
       {authStep !== 'initial' && (
        <CardFooter className="flex justify-between">
          {authStep === 'awaiting_code' && (
            <Button 
                variant="link" 
                onClick={() => onSendCode(phoneNumber)} // Resend code to the already submitted full number
                disabled={isLoading}
            >
              Resend Code
            </Button>
          )}
          <Button 
            variant="link" 
            onClick={handleStartOver} 
            disabled={isLoading} 
            className={authStep !== 'awaiting_code' ? "ml-auto" : ""}
          >
            <RotateCcw className="mr-2 h-4 w-4" />
            Start Over
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}
    
