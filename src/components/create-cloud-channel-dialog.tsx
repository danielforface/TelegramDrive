
"use client";

import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { CloudCog, X, Loader2 } from "lucide-react";
import type { CloudChannelType } from '@/types';

interface CreateCloudChannelDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (name: string, type: CloudChannelType) => Promise<void>;
  isLoading?: boolean;
}

export function CreateCloudChannelDialog({
  isOpen,
  onClose,
  onCreate,
  isLoading,
}: CreateCloudChannelDialogProps) {
  const [channelName, setChannelName] = useState('');
  const [channelType, setChannelType] = useState<CloudChannelType>('supergroup'); // Default to supergroup

  const handleSubmit = async () => {
    if (!channelName.trim()) {
      // Simple validation, can be enhanced with toast
      alert("Channel name cannot be empty.");
      return;
    }
    await onCreate(channelName.trim(), channelType);
    // onClose will likely be called by the parent after successful creation
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <CloudCog className="h-6 w-6 text-primary" />
            <DialogTitle>Create New Cloud Storage</DialogTitle>
          </div>
          <DialogDescription>
            This will create a new Telegram channel or supergroup managed by this app for cloud-like file storage.
          </DialogDescription>
          <DialogClose className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-secondary">
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </DialogClose>
        </DialogHeader>

        <div className="py-4 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="channel-name">Storage Name (Channel Title)</Label>
            <Input
              id="channel-name"
              value={channelName}
              onChange={(e) => setChannelName(e.target.value)}
              placeholder="e.g., My Project Files"
              disabled={isLoading}
            />
          </div>
          <div className="space-y-2">
            <Label>Storage Type</Label>
            <RadioGroup
              defaultValue="supergroup"
              value={channelType}
              onValueChange={(value: CloudChannelType) => setChannelType(value)}
              className="flex space-x-4"
              disabled={isLoading}
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="supergroup" id="type-supergroup" />
                <Label htmlFor="type-supergroup" className="font-normal">Supergroup (Recommended)</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="channel" id="type-channel" />
                <Label htmlFor="type-channel" className="font-normal">Basic Channel</Label>
              </div>
            </RadioGroup>
            <p className="text-xs text-muted-foreground">
              Supergroups offer more features and are generally better for collaboration or larger storage.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isLoading || !channelName.trim()}>
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : (
              "Create Storage"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
