
"use client";

import React, { useState, useEffect, useRef } from 'react';
import type { CloudFolder, FullChat, ChannelParticipant, InputPeer } from '@/types';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
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
import { Loader2, X, Info, Link2, Users, Image as ImageIcon, CheckCircle, Edit3, Copy, Settings2, UserPlus, Search, Save, Users2 } from "lucide-react";
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
    editableTitle, 
    setEditableTitle,
    isUpdatingTitle,
    isUpdatingAbout,
    isUpdatingUsername,
    isCheckingUsername,
    isExportingInvite,
    isUpdatingPhoto,
    participants,
    isLoadingParticipants,
    hasMoreParticipants,
    updateChannelTitle,
    updateChannelDescription,
    checkUsernameAvailability,
    setChannelUsername,
    generateInviteLink,
    updateChannelPhoto,
    fetchParticipants,
    resetAdminManagerState,
    memberSearchTerm,
    setMemberSearchTerm,
    handleSearchMembers,
    isSearchingMembers,
    memberSearchResults,
    handleAddMemberToChannel,
    isAddingMember,
  } = useChannelAdminManager({
    toast,
    handleGlobalApiError,
    selectedManagingChannel: channel,
    onChannelDetailsUpdated: onChannelDetailsUpdatedAppLevel,
  });
  
  const [activeTab, setActiveTab] = useState("edit");
  const [editableDescription, setEditableDescription] = useState("");
  const [editableUsernameForDialog, setEditableUsernameForDialog] = useState(""); // Separate state for dialog input
  const [currentPhotoPreview, setCurrentPhotoPreview] = useState<string | null>(null);
  const [selectedPhotoFile, setSelectedPhotoFile] = useState<File | null>(null);


  useEffect(() => {
    if (isOpen && channel) {
      setEditableTitle(channelDetails?.title || channel.name || "");
      setEditableDescription(channelDetails?.about || channel.fullChannelInfo?.about || "");
      setEditableUsernameForDialog(channelDetails?.username || channel.fullChannelInfo?.username || "");
      setCurrentPhotoPreview(channelDetails?.chat_photo?.photo_big?.local?.path || channel.fullChannelInfo?.chat_photo?.photo_big?.local?.path || null);
      setSelectedPhotoFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      
      if(channelDetails && participants.length === 0 && !isLoadingParticipants && hasMoreParticipants && activeTab === "participants") {
         if (channel.inputPeer) fetchParticipants(channel.inputPeer, 0);
      }
    } else if (!isOpen) {
      resetAdminManagerState(); 
      setEditableDescription("");
      setEditableUsernameForDialog("");
      setCurrentPhotoPreview(null);
      setSelectedPhotoFile(null);
      setActiveTab("edit"); 
    }
  }, [isOpen, channel, channelDetails, resetAdminManagerState, participants.length, isLoadingParticipants, hasMoreParticipants, activeTab, fetchParticipants, setEditableTitle]); 

  useEffect(() => {
    if (isOpen && activeTab === 'participants' && channel?.inputPeer && participants.length === 0 && hasMoreParticipants && !isLoadingParticipants && channelDetails) {
        fetchParticipants(channel.inputPeer, 0);
    }
  }, [isOpen, activeTab, channel?.inputPeer, participants.length, hasMoreParticipants, isLoadingParticipants, channelDetails, fetchParticipants]);

  const handleTitleSave = async () => {
    if (!channel?.inputPeer || !editableTitle.trim() || editableTitle.trim() === (channelDetails?.title || "")) return;
    await updateChannelTitle(channel.inputPeer, editableTitle.trim());
  };

  const handleDescriptionSave = async () => {
    if (!channel?.inputPeer || editableDescription === (channelDetails?.about || "")) return;
    await updateChannelDescription(channel.inputPeer, editableDescription);
  };

  const handleUsernameCheck = async () => {
    if (!channel?.inputPeer || !editableUsernameForDialog) return;
    await checkUsernameAvailability(channel.inputPeer, editableUsernameForDialog);
  };

  const handleUsernameSave = async () => {
    if (!channel?.inputPeer || !editableUsernameForDialog || editableUsernameForDialog === (channelDetails?.username || "")) return;
    await setChannelUsername(channel.inputPeer, editableUsernameForDialog);
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
  const currentUsernameVal = channelDetails?.username || channel.fullChannelInfo?.username;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl p-0 flex flex-col max-h-[90vh]">
        <DialogHeader className="p-6 border-b sticky top-0 bg-background z-10">
          <div className="flex items-center gap-2">
            <Settings2 className="h-6 w-6 text-primary" />
            <DialogTitle>Manage Cloud Channel: {channel.name}</DialogTitle>
          </div>
          <DialogDescription>
            Modify settings, manage invites, and participants for this cloud channel.
          </DialogDescription>
          <DialogClose className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-secondary">
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </DialogClose>
        </DialogHeader>

        {isLoadingChannelDetails && !channelDetails ? (
          <div className="flex-grow flex items-center justify-center p-6">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="ml-2">Loading channel details...</span>
          </div>
        ) : !channelDetails && !channel.fullChannelInfo && !isLoadingChannelDetails ? (
          <div className="flex-grow flex items-center justify-center p-6 text-muted-foreground">
            Could not load channel details. Ensure you have admin rights.
          </div>
        ) : (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-grow flex flex-col min-h-0">
            <TabsList className="mx-6 mt-4 sticky top-[calc(theme(spacing.24)_+_1px)] bg-background z-10 border-b rounded-none px-0">
              <TabsTrigger value="edit" className="flex-1 data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none rounded-none">
                <Edit3 className="mr-2 h-4 w-4" />Edit Info
              </TabsTrigger>
              <TabsTrigger value="invites" className="flex-1 data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none rounded-none">
                <Link2 className="mr-2 h-4 w-4" />Invites
              </TabsTrigger>
              <TabsTrigger value="add-members" className="flex-1 data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none rounded-none">
                 <UserPlus className="mr-2 h-4 w-4" />Add Members
              </TabsTrigger>
              <TabsTrigger value="participants" className="flex-1 data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none rounded-none">
                <Users2 className="mr-2 h-4 w-4" />Members ({channelDetails?.participants_count || 0})
              </TabsTrigger>
            </TabsList>

            <ScrollArea className="flex-grow overflow-y-auto">
              <TabsContent value="edit" className="p-6 space-y-6">
                <div>
                  <Label htmlFor="channelTitle">Channel Title</Label>
                  <div className="flex items-center gap-2">
                    <Input 
                      id="channelTitle" 
                      value={editableTitle} 
                      onChange={(e) => setEditableTitle(e.target.value)}
                      className="mt-1 flex-grow" 
                      disabled={isUpdatingTitle || isLoadingChannelDetails}
                    />
                    <Button onClick={handleTitleSave} disabled={isUpdatingTitle || isLoadingChannelDetails || !editableTitle.trim() || editableTitle.trim() === (channelDetails?.title || channel.name)} size="sm" className="mt-1">
                      {isUpdatingTitle ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4"/>}
                      Save Title
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Note: Channel title editing might be restricted by Telegram in some cases.</p>
                </div>

                <div>
                  <Label htmlFor="channelDescription">Description (About)</Label>
                  <Textarea
                    id="channelDescription"
                    value={editableDescription}
                    onChange={(e) => setEditableDescription(e.target.value)}
                    placeholder="Enter channel description..."
                    className="mt-1 min-h-[80px]"
                    disabled={isUpdatingAbout || isLoadingChannelDetails}
                  />
                  <Button onClick={handleDescriptionSave} disabled={isUpdatingAbout || isLoadingChannelDetails || editableDescription === (channelDetails?.about || "")} size="sm" className="mt-2">
                    {isUpdatingAbout ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4"/>}
                    Save Description
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
                            <Input type="file" accept="image/jpeg, image/png" onChange={handlePhotoSelect} ref={fileInputRef} className="text-xs" disabled={isUpdatingPhoto || isLoadingChannelDetails}/>
                            <Button onClick={handlePhotoUpload} disabled={isUpdatingPhoto || isLoadingChannelDetails || !selectedPhotoFile} size="sm">
                                {isUpdatingPhoto && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Upload New Photo
                            </Button>
                        </div>
                    </div>
                 </div>
              </TabsContent>

              <TabsContent value="invites" className="p-6 space-y-6">
                {channelDetails?.can_set_username && (
                  <div className="space-y-2 p-4 border rounded-md">
                    <Label htmlFor="channelUsername" className="text-base font-semibold">Public Link (Username)</Label>
                    {currentUsernameVal && <p className="text-sm text-muted-foreground mb-1">Current: t.me/{currentUsernameVal}</p>}
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground self-center pt-1">t.me/</span>
                      <Input
                        id="channelUsername"
                        value={editableUsernameForDialog}
                        onChange={(e) => setEditableUsernameForDialog(e.target.value.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase())}
                        placeholder="your_channel_username"
                        className="flex-grow"
                        disabled={isUpdatingUsername || isCheckingUsername || isLoadingChannelDetails}
                      />
                    </div>
                    <div className="flex gap-2 flex-wrap mt-2">
                      <Button onClick={handleUsernameCheck} disabled={isCheckingUsername || isUpdatingUsername || !editableUsernameForDialog || isLoadingChannelDetails} size="sm" variant="outline">
                        {isCheckingUsername && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Check Availability
                      </Button>
                      <Button onClick={handleUsernameSave} disabled={isUpdatingUsername || isCheckingUsername || !editableUsernameForDialog || editableUsernameForDialog === (channelDetails?.username || "") || isLoadingChannelDetails} size="sm">
                        {isUpdatingUsername ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                        Set Username
                      </Button>
                    </div>
                  </div>
                )}
                <div className="space-y-2 p-4 border rounded-md">
                    <Label className="text-base font-semibold">Primary Private Invite Link</Label>
                    {currentLink ? (
                        <div className="flex items-center gap-2">
                        <Input value={currentLink} readOnly className="flex-grow bg-muted/30" />
                        <Button variant="ghost" size="icon" onClick={() => copyToClipboard(currentLink)} title="Copy link">
                            <Copy className="h-4 w-4" />
                        </Button>
                        </div>
                    ) : (
                        <p className="text-sm text-muted-foreground">No primary invite link set or visible. Generate one below.</p>
                    )}
                    <Button onClick={handleGenerateInvite} disabled={isExportingInvite || isLoadingChannelDetails} size="sm" variant="outline">
                        {isExportingInvite && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {currentLink ? "Regenerate Link" : "Generate Invite Link"}
                    </Button>
                    <p className="text-xs text-muted-foreground">This is the main private invite link for the channel. Regenerating invalidates the old one.</p>
                </div>
              </TabsContent>
              
              <TabsContent value="add-members" className="p-6 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="memberSearch" className="text-base font-semibold">Search for Users to Add</Label>
                  <div className="flex gap-2">
                    <Input 
                      id="memberSearch" 
                      placeholder="Enter username or part of name..." 
                      value={memberSearchTerm}
                      onChange={(e) => setMemberSearchTerm(e.target.value)}
                      disabled={isSearchingMembers || !!isAddingMember || isLoadingChannelDetails}
                      onKeyDown={(e) => e.key === 'Enter' && !isSearchingMembers && memberSearchTerm.trim() && handleSearchMembers()}
                    />
                    <Button onClick={handleSearchMembers} disabled={isSearchingMembers || !!isAddingMember || !memberSearchTerm.trim() || isLoadingChannelDetails} variant="outline">
                      {isSearchingMembers ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
                {isSearchingMembers && <div className="text-sm text-muted-foreground flex items-center justify-center py-4"><Loader2 className="mr-2 h-4 w-4 animate-spin"/>Searching...</div>}
                {!isSearchingMembers && memberSearchResults.length > 0 && (
                  <ScrollArea className="max-h-60 border rounded-md">
                    <ul className="p-2 space-y-1">
                    {memberSearchResults.map((user: any) => (
                      <li key={user.id} className="flex items-center justify-between p-2 hover:bg-muted rounded-md">
                        <div className="flex items-center gap-2">
                          <Avatar className="h-8 w-8">
                            <AvatarImage src={user.photo?.photo_small?.local?.path} alt={user.first_name} data-ai-hint="user avatar" />
                            <AvatarFallback>{user.first_name?.substring(0,1)}{user.last_name?.substring(0,1) || ''}</AvatarFallback>
                          </Avatar>
                          <span className="text-sm">{user.first_name} {user.last_name || ''} <span className="text-xs text-muted-foreground">(@{user.username || `ID: ${user.id}`})</span></span>
                        </div>
                        <Button 
                          size="sm" 
                          variant="outline" 
                          onClick={() => channel.inputPeer && handleAddMemberToChannel(channel.inputPeer, user)} 
                          disabled={isAddingMember === String(user.id) || !!isAddingMember && isAddingMember !== String(user.id)}
                        >
                          {isAddingMember === String(user.id) ? <Loader2 className="h-4 w-4 animate-spin"/> : "Add"}
                        </Button>
                      </li>
                    ))}
                    </ul>
                  </ScrollArea>
                )}
                {!isSearchingMembers && memberSearchTerm && memberSearchResults.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">No users found matching your search.</p>
                )}
                <p className="text-xs text-muted-foreground">Note: You can typically only add users who are in your contacts or if they allow being added by their username. Adding many users might be rate-limited by Telegram.</p>
              </TabsContent>

              <TabsContent value="participants" className="p-6">
                {isLoadingParticipants && participants.length === 0 ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    <span className="ml-2">Loading participants...</span>
                  </div>
                ) : participants.length === 0 ? (
                  <p className="text-muted-foreground text-center py-4">No participants found or channel is not accessible for participant listing.</p>
                ) : (
                  <ul className="space-y-3">
                    {participants.map((participant) => (
                      <li key={String(participant.user_id) + String(participant.date)} className="flex items-center justify-between p-3 border rounded-md bg-card hover:bg-muted/40 shadow-sm">
                        <div className="flex items-center gap-3">
                          <Avatar className="h-9 w-9">
                            <AvatarImage src={participant.user?.photo?.photo_small?.local?.path} alt={participant.user?.first_name} data-ai-hint="participant avatar"/>
                            <AvatarFallback>{participant.user?.first_name?.substring(0,1)}{participant.user?.last_name?.substring(0,1)}</AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="text-sm font-medium">{participant.user?.first_name} {participant.user?.last_name || ''} {participant.self ? <span className="text-xs text-primary">(You)</span> : ""}</p>
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
                {hasMoreParticipants && !isLoadingParticipants && participants.length > 0 && (
                  <div className="mt-4 text-center">
                    <Button onClick={() => channel?.inputPeer && fetchParticipants(channel.inputPeer, participants.length)} variant="outline" disabled={isLoadingParticipants}>
                      {isLoadingParticipants ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Load More Participants
                    </Button>
                  </div>
                )}
              </TabsContent>
            </ScrollArea>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}

    
