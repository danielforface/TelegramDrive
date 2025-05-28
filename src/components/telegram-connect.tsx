"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AnimatedCloudIcon } from "./animated-cloud-icon";
import { Zap } from "lucide-react";

interface TelegramConnectProps {
  onConnect: () => void;
  isLoading: boolean;
}

export function TelegramConnect({ onConnect, isLoading }: TelegramConnectProps) {
  return (
    <Card className="w-full max-w-md shadow-xl">
      <CardHeader className="text-center">
        <div className="mx-auto mb-6">
          <AnimatedCloudIcon isAnimating={isLoading} />
        </div>
        <CardTitle className="text-2xl">Welcome to Telegram Cloudifier</CardTitle>
        <CardDescription>
          Connect your Telegram account to transform your chats into an organized cloud-like structure.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-center">
        <Button
          onClick={onConnect}
          disabled={isLoading}
          size="lg"
          className="w-full"
        >
          {isLoading ? (
            <>
              <Zap className="mr-2 h-5 w-5 animate-spin" />
              Connecting...
            </>
          ) : (
            <>
              <Zap className="mr-2 h-5 w-5" />
              Connect to Telegram
            </>
          )}
        </Button>
        <p className="mt-4 text-xs text-muted-foreground">
          You will be guided through the Telegram connection process.
        </p>
      </CardContent>
    </Card>
  );
}
