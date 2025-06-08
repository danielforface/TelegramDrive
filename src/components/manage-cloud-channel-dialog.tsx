
"use client";

import React, { useState, useEffect, useRef } from 'react';
import type { CloudFolder, FullChat, ChannelParticipant, InputPeer } from '@/types';
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
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, X, Info, Link2, Users, Image as ImageIcon, CheckCircle, Edit3, Copy, Settings2 } from "lucide-react";
import { useChannelAdminManager } from '@/hooks/features/useChannelAdminManager';

interface ManageCloudChannelDialogProps {
  isOpen: boolean;
  onClose: () => void;
  channel: CloudFolder | null;
  handleGlobalApiError: (error: any, title: string, defaultMessage: string, doPageReset?: boolean) => void;
  onChannelDetailsUpdatedAppLevel: (updatedFolder: CloudFolder) => void;
}

export function ManageCloudChannelDialog({
  isOpen,
  onClose,
  channel,
  handleGlobalApiError,
  onChannelDetailsUpdatedAppLevel,
}: ManageCloudChannelDialogProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    channelDetails,
    isLoadingChannelDetails,
    isUpdatingAbout,
    isUpdatingUsername,
    isCheckingUsername,
    isExportingInvite,
    isUpdatingPhoto,
    participants,
    isLoadingParticipants,
    hasMoreParticipants,
    updateChannelDescription,
    checkUsernameAvailability,
    setChannelUsername,
    generateInviteLink,
    updateChannelPhoto,
    fetchParticipants,
    resetAdminManagerState,
  } = useChannelAdminManager({
    toast,
    handleGlobalApiError,
    selectedManagingChannel: channel,
    onChannelDetailsUpdated: onChannelDetailsUpdatedAppLevel,
  });
  
  const [activeTab, setActiveTab] = useState("general");
  const [editableDescription, setEditableDescription] = useState("");
  const [editableUsername, setEditableUsername] = useState("");
  const [currentPhotoPreview, setCurrentPhotoPreview] = useState<string | null>(null);
  const [selectedPhotoFile, setSelectedPhotoFile] = useState<File | null>(null);


  useEffect(() => {
    if (isOpen && channel && channel.inputPeer) {
      setEditableDescription(channelDetails?.about || channel.fullChannelInfo?.about || "");
      setEditableUsername(channelDetails?.username || channel.fullChannelInfo?.username || "");
      setCurrentPhotoPreview(channelDetails?.chat_photo?.photo_big?.local?.path || channel.fullChannelInfo?.chat_photo?.photo_big?.local?.path || null);

      if(channelDetails && participants.length === 0 && !isLoadingParticipants && hasMoreParticipants) {
        fetchParticipants(channel.inputPeer, 0);
      }

    } else if (!isOpen) {
      setEditableDescription("");
      setEditableUsername("");
      setCurrentPhotoPreview(null);
      setSelectedPhotoFile(null);
      resetAdminManagerState();
    }
  }, [isOpen, channel, channelDetails, participants.length, isLoadingParticipants, hasMoreParticipants, fetchParticipants, resetAdminManagerState]);


  const handleDescriptionSave = async () => {
    if (!channel?.inputPeer || editableDescription === (channelDetails?.about || "")) return;
    await updateChannelDescription(channel.inputPeer, editableDescription);
  };

  const handleUsernameCheck = async () => {
    if (!channel?.inputPeer || !editableUsername) return;
    await checkUsernameAvailability(channel.inputPeer, editableUsername);
  };

  const handleUsernameSave = async () => {
    if (!channel?.inputPeer || !editableUsername || editableUsername === (channelDetails?.username || "")) return;
    await setChannelUsername(channel.inputPeer, editableUsername);
  };

  const handleGenerateInvite = async () => {
    if (!channel?.inputPeer) return;
    await generateInviteLink(channel.inputPeer);
  };
  
  const handlePhotoSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      const file = event.target.files[0];
      setSelectedPhotoFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setCurrentPhotoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handlePhotoUpload = async () => {
    if (!channel?.inputPeer || !selectedPhotoFile) return;
    await updateChannelPhoto(channel.inputPeer, selectedPhotoFile);
    setSelectedPhotoFile(null); 
    if(fileInputRef.current) fileInputRef.current.value = "";
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      toast({ title: "Copied!", description: "Link copied to clipboard." });
    }).catch(err => {
      toast({ title: "Copy Failed", description: "Could not copy link.", variant: "destructive" });
    });
  };


  if (!isOpen || !channel) {
    return null;
  }
  
  const currentLink = channelDetails?.exported_invite?.link || channel.fullChannelInfo?.exported_invite?.link;
  const currentUsername = channelDetails?.username || channel.fullChannelInfo?.username;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl p-0 flex flex-col max-h-[90vh]">
        <DialogHeader className="p-6 border-b sticky top-0 bg-background z-10">
          <div className="flex items-center gap-2">
            <Settings2 className="h-6 w-6 text-primary" />
            <DialogTitle>Manage Cloud Channel: {channel.name}</DialogTitle>
          </div>
          <DialogDescription>
            Modify settings, manage links, and view participants for this cloud channel.
          </DialogDescription>
          <DialogClose className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-secondary">
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </DialogClose>
        </DialogHeader>

        {isLoadingChannelDetails ? (
          <div className="flex-grow flex items-center justify-center p-6">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="ml-2">Loading channel details...</span>
          </div>
        ) : !channelDetails && !channel.fullChannelInfo ? (
          <div className="flex-grow flex items-center justify-center p-6 text-muted-foreground">
            Could not load channel details.
          </div>
        ) : (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-grow flex flex-col min-h-0">
            <TabsList className="mx-6 mt-4 sticky top-[calc(theme(spacing.24)_+_1px)] bg-background z-10 border-b rounded-none">
              <TabsTrigger value="general" className="flex-1"><Info className="mr-2 h-4 w-4" />General</TabsTrigger>
              <TabsTrigger value="participants" className="flex-1"><Users className="mr-2 h-4 w-4" />Participants ({channelDetails?.participants_count || 0})</TabsTrigger>
            </TabsList>

            <ScrollArea className="flex-grow overflow-y-auto">
              <TabsContent value="general" className="p-6 space-y-6">
                <div>
                  <Label htmlFor="channelTitle">Channel Title</Label>
                  <Input id="channelTitle" value={channel.name} readOnly disabled className="mt-1" />
                </div>

                <div>
                  <Label htmlFor="channelDescription">Description (About)</Label>
                  <Textarea
                    id="channelDescription"
                    value={editableDescription}
                    onChange={(e) => setEditableDescription(e.target.value)}
                    placeholder="Enter channel description..."
                    className="mt-1 min-h-[80px]"
                    disabled={isUpdatingAbout}
                  />
                  <Button onClick={handleDescriptionSave} disabled={isUpdatingAbout || editableDescription === (channelDetails?.about || "")} size="sm" className="mt-2">
                    {isUpdatingAbout && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Save Description
                  </Button>
                </div>

                {channelDetails?.can_set_username && (
                  <div className="space-y-2 p-4 border rounded-md">
                    <Label className="text-base font-semibold">Public Link (Username)</Label>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">t.me/</span>
                      <Input
                        id="channelUsername"
                        value={editableUsername}
                        onChange={(e) => setEditableUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase())}
                        placeholder="your_channel_username"
                        className="flex-grow"
                        disabled={isUpdatingUsername || isCheckingUsername}
                      />
                    </div>
                     {currentUsername && editableUsername === currentUsername && <p className="text-xs text-green-600">Current public link: t.me/{currentUsername}</p>}
                    <div className="flex gap-2">
                      <Button onClick={handleUsernameCheck} disabled={isCheckingUsername || isUpdatingUsername || !editableUsername} size="sm" variant="outline">
                        {isCheckingUsername && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Check Availability
                      </Button>
                      <Button onClick={handleUsernameSave} disabled={isUpdatingUsername || isCheckingUsername || !editableUsername || editableUsername === (channelDetails?.username || "")} size="sm">
                        {isUpdatingUsername && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Set Username
                      </Button>
                    </div>
                  </div>
                )}

                 <div className="space-y-2 p-4 border rounded-md">
                    <Label className="text-base font-semibold">Private Invite Link</Label>
                    {currentLink ? (
                        <div className="flex items-center gap-2">
                        <Input value={currentLink} readOnly className="flex-grow" />
                        <Button variant="ghost" size="icon" onClick={() => copyToClipboard(currentLink)} title="Copy link">
                            <Copy className="h-4 w-4" />
                        </Button>
                        </div>
                    ) : (
                        <p className="text-sm text-muted-foreground">No primary invite link set or visible.</p>
                    )}
                    <Button onClick={handleGenerateInvite} disabled={isExportingInvite} size="sm" variant="outline">
                        {isExportingInvite && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {currentLink ? "Regenerate/View Primary Link" : "Generate Invite Link"}
                    </Button>
                </div>


                 <div className="space-y-2 p-4 border rounded-md">
                    <Label className="text-base font-semibold">Channel Photo</Label>
                    <div className="flex items-center gap-4">
                        <Avatar className="h-20 w-20">
                        <AvatarImage src={currentPhotoPreview || channelDetails?.chat_photo?.photo_big?.local?.path} alt={channel.name} data-ai-hint="channel profile image"/>
                        <AvatarFallback>{channel.name?.substring(0, 2).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <div className="space-y-1">
                            <Input type="file" accept="image/jpeg, image/png" onChange={handlePhotoSelect} ref={fileInputRef} className="text-xs" disabled={isUpdatingPhoto}/>
                            <Button onClick={handlePhotoUpload} disabled={isUpdatingPhoto || !selectedPhotoFile} size="sm">
                                {isUpdatingPhoto && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Upload New Photo
                            </Button>
                        </div>
                    </div>
                 </div>

              </TabsContent>

              <TabsContent value="participants" className="p-6">
                {isLoadingParticipants && participants.length === 0 ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    <span className="ml-2">Loading participants...</span>
                  </div>
                ) : participants.length === 0 ? (
                  <p className="text-muted-foreground">No participants found or loaded yet.</p>
                ) : (
                  <ul className="space-y-3">
                    {participants.map((participant) => (
                      <li key={participant.user_id} className="flex items-center justify-between p-2 border rounded-md bg-muted/20 hover:bg-muted/40">
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8">
                            <AvatarImage src={participant.user?.photo?.photo_small?.local?.path} alt={participant.user?.first_name} data-ai-hint="participant avatar"/>
                            <AvatarFallback>{participant.user?.first_name?.substring(0,1)}{participant.user?.last_name?.substring(0,1)}</AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="text-sm font-medium">{participant.user?.first_name} {participant.user?.last_name || ''} {participant.self ? "(You)" : ""}</p>
                            <p className="text-xs text-muted-foreground">@{participant.user?.username || `ID: ${participant.user_id}`}</p>
                          </div>
                        </div>
                        <div className="text-xs">
                            {participant._ === 'channelParticipantCreator' && <Badge variant="destructive">Owner</Badge>}
                            {participant._ === 'channelParticipantAdmin' && <Badge variant="secondary">Admin</Badge>}
                            {/* TODO: Add manage buttons (promote/demote) here later */}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                {hasMoreParticipants && !isLoadingParticipants && (
                  <div className="mt-4 text-center">
                    <Button onClick={() => channel?.inputPeer && fetchParticipants(channel.inputPeer, participants.length)} variant="outline">
                      Load More Participants
                    </Button>
                  </div>
                )}
              </TabsContent>
            </ScrollArea>
          </Tabs>
        )}

        <DialogFooter className="p-4 border-t flex-shrink-0 sticky bottom-0 bg-background z-10">
          {/* The explicit Close button was here and has been removed. The X icon in DialogHeader handles closing. */}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

    

    