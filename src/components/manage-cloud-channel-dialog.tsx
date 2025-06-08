
"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
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
import { Loader2, X, Link2, Edit3, Copy, Settings2, UserPlus, Search, Save, Users2, AlertTriangle, Check, Ban, Image as ImageIcon } from "lucide-react";
import { useChannelAdminManager, type UsernameAvailabilityStatus } from '@/hooks/features/useChannelAdminManager';

interface ManageCloudChannelDialogProps {
  isOpen: boolean;
  onClose: () => void;
  channel: CloudFolder | null; // This is selectedManagingChannel from page.tsx context
  handleGlobalApiError: (error: any, title: string, defaultMessage: string, doPageReset?: boolean) => void;
  onChannelDetailsUpdatedAppLevel: (updatedFolder: CloudFolder) => void;
}

export function ManageCloudChannelDialog({
  isOpen,
  onClose,
  channel: selectedManagingChannel, // Renamed for clarity within this component
  handleGlobalApiError,
  onChannelDetailsUpdatedAppLevel,
}: ManageCloudChannelDialogProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState("edit");

  const adminManager = useChannelAdminManager({
    toast,
    handleGlobalApiError,
    selectedManagingChannel,
    onChannelDetailsUpdatedAppLevel,
    isOpen,
    activeTab,
  });

  // Local state for editable fields, synced with adminManager.channelDetails
  const [localEditableTitle, setLocalEditableTitle] = useState("");
  const [localEditableDescription, setLocalEditableDescription] = useState("");
  const [localEditableUsername, setLocalEditableUsername] = useState("");
  const [currentPhotoPreview, setCurrentPhotoPreview] = useState<string | null>(null);
  const [selectedPhotoFile, setSelectedPhotoFile] = useState<File | null>(null);

  const usernameCheckTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // This effect syncs local input fields when the authoritative channelDetails from the hook changes,
    // or when the dialog opens.
    if (isOpen) {
      if (adminManager.channelDetails) {
        setLocalEditableTitle(adminManager.channelDetails.title || "");
        setLocalEditableDescription(adminManager.channelDetails.about || "");
        setLocalEditableUsername(adminManager.channelDetails.username || "");
        setCurrentPhotoPreview(adminManager.channelDetails.chat_photo?.photo_big?.local?.path || null);
      } else if (selectedManagingChannel) {
        // Fallback to selectedManagingChannel for initial render if adminManager.channelDetails isn't ready
        setLocalEditableTitle(selectedManagingChannel.name || "");
        setLocalEditableDescription(selectedManagingChannel.fullChannelInfo?.about || "");
        setLocalEditableUsername(selectedManagingChannel.fullChannelInfo?.username || "");
        setCurrentPhotoPreview(selectedManagingChannel.fullChannelInfo?.chat_photo?.photo_big?.local?.path || null);
      } else {
        // If nothing is available (e.g., error state or channel is null)
        setLocalEditableTitle("");
        setLocalEditableDescription("");
        setLocalEditableUsername("");
        setCurrentPhotoPreview(null);
      }
      setSelectedPhotoFile(null); // Reset selected file on open/channel change
      if(fileInputRef.current) fileInputRef.current.value = "";
    }
  }, [isOpen, adminManager.channelDetails, selectedManagingChannel]);


  useEffect(() => {
    // Cleanup debounce timer on component unmount or when dialog closes
    return () => {
      if (usernameCheckTimeoutRef.current) {
        clearTimeout(usernameCheckTimeoutRef.current);
      }
    };
  }, []);

  const handleTitleSave = async () => {
    if (!selectedManagingChannel?.inputPeer || !localEditableTitle.trim() || localEditableTitle.trim() === (adminManager.channelDetails?.title || selectedManagingChannel?.name)) return;
    await adminManager.updateChannelTitle(selectedManagingChannel.inputPeer, localEditableTitle.trim());
  };

  const handleDescriptionSave = async () => {
    if (!selectedManagingChannel?.inputPeer || localEditableDescription === (adminManager.channelDetails?.about || "")) return;
    await adminManager.updateChannelDescription(selectedManagingChannel.inputPeer, localEditableDescription);
  };

  const handlePublicUsernameInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newUsername = e.target.value.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase();
    setLocalEditableUsername(newUsername);
    adminManager.setUsernameAvailability(null); // Reset status immediately

    if (usernameCheckTimeoutRef.current) {
      clearTimeout(usernameCheckTimeoutRef.current);
    }

    const currentActualUsername = adminManager.channelDetails?.username || "";
    if (newUsername.trim() === '' || newUsername.trim() === currentActualUsername) {
      adminManager.setUsernameAvailability(newUsername.trim() === currentActualUsername ? 'idle' : null);
      return;
    }

    if (newUsername.length < 5) {
      adminManager.setUsernameAvailability('unavailable'); // Or a new state like 'too_short'
      return;
    }

    usernameCheckTimeoutRef.current = setTimeout(() => {
      if (selectedManagingChannel?.inputPeer && newUsername.trim() !== '' && newUsername.trim() !== currentActualUsername) {
        adminManager.checkUsernameAvailability(selectedManagingChannel.inputPeer, newUsername.trim());
      }
    }, 750);
  };

  const handleUsernameSave = async () => {
    if (!selectedManagingChannel?.inputPeer || !localEditableUsername || localEditableUsername === (adminManager.channelDetails?.username || "") || adminManager.usernameAvailability !== 'available') return;
    await adminManager.setChannelUsername(selectedManagingChannel.inputPeer, localEditableUsername);
  };

  const handleGenerateInvite = async () => {
    if (!selectedManagingChannel?.inputPeer) return;
    await adminManager.generateInviteLink(selectedManagingChannel.inputPeer);
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
    if (!selectedManagingChannel?.inputPeer || !selectedPhotoFile) return;
    await adminManager.updateChannelPhoto(selectedManagingChannel.inputPeer, selectedPhotoFile);
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

  if (!isOpen || !selectedManagingChannel) {
    return null;
  }

  const currentInviteLink = adminManager.channelDetails?.exported_invite?.link;
  const currentActualUsernameDisplay = adminManager.channelDetails?.username || "";

  const renderUsernameAvailability = () => {
    if (adminManager.isCheckingUsername || adminManager.usernameAvailability === 'checking') {
      return <span className="text-xs text-muted-foreground ml-2 flex items-center"><Loader2 className="h-3 w-3 animate-spin mr-1" />Checking...</span>;
    }
    if (localEditableUsername.trim() === '' && currentActualUsernameDisplay) {
        return <span className="text-xs text-muted-foreground ml-2">Enter a new username or keep current.</span>;
    }
    if (localEditableUsername.trim() === '' && !currentActualUsernameDisplay) {
        return <span className="text-xs text-muted-foreground ml-2">Enter a username.</span>;
    }
    if (localEditableUsername.length > 0 && localEditableUsername.length < 5 && localEditableUsername.trim() !== currentActualUsernameDisplay) {
        return <span className="text-xs text-red-600 ml-2 flex items-center"><Ban className="h-3 w-3 mr-1" />Too short (min 5 chars)</span>;
    }
    if (localEditableUsername.trim() === currentActualUsernameDisplay && currentActualUsernameDisplay !== "") {
        return <span className="text-xs text-muted-foreground ml-2">This is the current username.</span>;
    }
    switch (adminManager.usernameAvailability) {
      case 'available':
        return <span className="text-xs text-green-600 ml-2 flex items-center"><Check className="h-3 w-3 mr-1" />Available!</span>;
      case 'unavailable':
        return <span className="text-xs text-red-600 ml-2 flex items-center"><Ban className="h-3 w-3 mr-1" />Not available or invalid.</span>;
      case 'error':
        return <span className="text-xs text-red-600 ml-2 flex items-center"><AlertTriangle className="h-3 w-3 mr-1" />Error checking.</span>;
      case 'idle':
         return <span className="text-xs text-muted-foreground ml-2">&nbsp;</span>;
      default: // null or other
        return <span className="text-xs text-muted-foreground ml-2">Type to check availability.</span>;
    }
  };

  const renderUserListItem = (user: any, context: 'search' | 'contact') => (
      <li key={user.id} className="flex items-center justify-between p-2 hover:bg-muted rounded-md">
        <div className="flex items-center gap-2 min-w-0">
          <Avatar className="h-8 w-8 flex-shrink-0">
            <AvatarImage src={user.photo?.photo_small?.local?.path} alt={user.first_name} data-ai-hint="user avatar" />
            <AvatarFallback>{user.first_name?.substring(0,1)}{user.last_name?.substring(0,1) || ''}</AvatarFallback>
          </Avatar>
          <div className="truncate">
            <span className="text-sm block truncate">{user.first_name} {user.last_name || ''}</span>
            <span className="text-xs text-muted-foreground block truncate">@{user.username || `ID: ${user.id}`}</span>
          </div>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => selectedManagingChannel.inputPeer && adminManager.handleAddMemberToChannel(selectedManagingChannel.inputPeer, user)}
          disabled={adminManager.isAddingMember === String(user.id) || (!!adminManager.isAddingMember && adminManager.isAddingMember !== String(user.id))}
          className="ml-2 flex-shrink-0"
        >
          {adminManager.isAddingMember === String(user.id) ? <Loader2 className="h-4 w-4 animate-spin"/> : "Add"}
        </Button>
      </li>
  );

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-2xl p-0 flex flex-col max-h-[90vh]">
        <DialogHeader className="p-6 border-b sticky top-0 bg-background z-10">
          <div className="flex items-center gap-2">
            <Settings2 className="h-6 w-6 text-primary" />
            <DialogTitle>Manage Cloud Channel: {adminManager.channelDetails?.title || selectedManagingChannel.name}</DialogTitle>
          </div>
          <DialogDescription>
            Modify settings, manage invites, and participants for this cloud channel.
          </DialogDescription>
          <DialogClose className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-secondary">
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </DialogClose>
        </DialogHeader>

        {adminManager.isLoadingChannelDetails && !adminManager.channelDetails ? (
          <div className="flex-grow flex items-center justify-center p-6">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="ml-2">Loading channel details...</span>
          </div>
        ) : !adminManager.channelDetails && !adminManager.isLoadingChannelDetails ? (
          <div className="flex-grow flex items-center justify-center p-6 text-muted-foreground">
            Could not load channel details. Ensure you have admin rights or try again.
          </div>
        ) : (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-grow flex flex-col min-h-0">
            <TabsList className="mx-6 mt-4 sticky top-[calc(theme(spacing.24)_-_1px_-_theme(spacing.0))] bg-background z-10 border-b rounded-none px-0">
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
                <Users2 className="mr-2 h-4 w-4" />Members ({adminManager.channelDetails?.participants_count || 0})
              </TabsTrigger>
            </TabsList>

            <ScrollArea className="flex-grow overflow-y-auto">
              <TabsContent value="edit" className="p-6 space-y-6">
                <div>
                  <Label htmlFor="channelTitle">Channel Title</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="channelTitle"
                      value={localEditableTitle}
                      onChange={(e) => setLocalEditableTitle(e.target.value)}
                      className="mt-1 flex-grow"
                      disabled={adminManager.isUpdatingTitle || adminManager.isLoadingChannelDetails}
                    />
                    <Button onClick={handleTitleSave} disabled={adminManager.isUpdatingTitle || adminManager.isLoadingChannelDetails || !localEditableTitle.trim() || localEditableTitle.trim() === (adminManager.channelDetails?.title || selectedManagingChannel?.name)} size="sm" className="mt-1">
                      {adminManager.isUpdatingTitle ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4"/>}
                      Save Title
                    </Button>
                  </div>
                </div>

                <div>
                  <Label htmlFor="channelDescription">Description (About)</Label>
                  <Textarea
                    id="channelDescription"
                    value={localEditableDescription}
                    onChange={(e) => setLocalEditableDescription(e.target.value)}
                    placeholder="Enter channel description..."
                    className="mt-1 min-h-[80px]"
                    disabled={adminManager.isUpdatingAbout || adminManager.isLoadingChannelDetails}
                  />
                  <Button onClick={handleDescriptionSave} disabled={adminManager.isUpdatingAbout || adminManager.isLoadingChannelDetails || localEditableDescription === (adminManager.channelDetails?.about || "")} size="sm" className="mt-2">
                    {adminManager.isUpdatingAbout ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4"/>}
                    Save Description
                  </Button>
                </div>

                 <div className="space-y-2 p-4 border rounded-md">
                    <Label className="text-base font-semibold">Channel Photo</Label>
                    <div className="flex items-center gap-4">
                        <Avatar className="h-20 w-20">
                          <AvatarImage src={currentPhotoPreview || adminManager.channelDetails?.chat_photo?.photo_big?.local?.path} alt={selectedManagingChannel.name} data-ai-hint="channel profile image"/>
                          <AvatarFallback>{(adminManager.channelDetails?.title || selectedManagingChannel.name)?.substring(0, 2).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <div className="space-y-1">
                            <Input type="file" accept="image/jpeg, image/png" onChange={handlePhotoSelect} ref={fileInputRef} className="text-xs" disabled={adminManager.isUpdatingPhoto || adminManager.isLoadingChannelDetails}/>
                            <Button onClick={handlePhotoUpload} disabled={adminManager.isUpdatingPhoto || adminManager.isLoadingChannelDetails || !selectedPhotoFile} size="sm">
                                {adminManager.isUpdatingPhoto && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Upload New Photo
                            </Button>
                        </div>
                    </div>
                 </div>
              </TabsContent>

              <TabsContent value="invites" className="p-6 space-y-6">
                {adminManager.channelDetails?.can_set_username && (
                  <div className="space-y-2 p-4 border rounded-md">
                    <Label htmlFor="channelUsername" className="text-base font-semibold">Public Link (Username)</Label>
                    {currentActualUsernameDisplay && <p className="text-sm text-muted-foreground mb-1">Current: t.me/{currentActualUsernameDisplay}</p>}
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground self-center pt-1">t.me/</span>
                      <Input
                        id="channelUsername"
                        value={localEditableUsername}
                        onChange={handlePublicUsernameInputChange}
                        placeholder="your_channel_username (min 5 chars)"
                        className="flex-grow"
                        disabled={adminManager.isUpdatingUsername || adminManager.isCheckingUsername || adminManager.isLoadingChannelDetails}
                      />
                    </div>
                     <div className="h-4 mt-1">{renderUsernameAvailability()}</div>
                    <div className="flex gap-2 flex-wrap mt-2">
                      <Button
                        onClick={handleUsernameSave}
                        disabled={
                            adminManager.isUpdatingUsername ||
                            adminManager.isCheckingUsername ||
                            !localEditableUsername ||
                            localEditableUsername === currentActualUsernameDisplay ||
                            adminManager.isLoadingChannelDetails ||
                            adminManager.usernameAvailability !== 'available' ||
                            localEditableUsername.length < 5
                        }
                        size="sm"
                      >
                        {adminManager.isUpdatingUsername ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                        Set Username
                      </Button>
                    </div>
                  </div>
                )}
                <div className="space-y-2 p-4 border rounded-md">
                    <Label className="text-base font-semibold">Primary Private Invite Link</Label>
                    {currentInviteLink ? (
                        <div className="flex items-center gap-2">
                        <Input value={currentInviteLink} readOnly className="flex-grow bg-muted/30" />
                        <Button variant="ghost" size="icon" onClick={() => copyToClipboard(currentInviteLink)} title="Copy link">
                            <Copy className="h-4 w-4" />
                        </Button>
                        </div>
                    ) : (
                        <p className="text-sm text-muted-foreground">No primary invite link set or visible. Generate one below.</p>
                    )}
                    <Button onClick={handleGenerateInvite} disabled={adminManager.isExportingInvite || adminManager.isLoadingChannelDetails} size="sm" variant="outline">
                        {adminManager.isExportingInvite && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {currentInviteLink ? "Regenerate Link" : "Generate Invite Link"}
                    </Button>
                    <p className="text-xs text-muted-foreground">This is the main private invite link for the channel. Regenerating invalidates the old one.</p>
                </div>
              </TabsContent>

              <TabsContent value="add-members" className="p-6 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="memberSearch" className="text-base font-semibold">Search or Select from Contacts</Label>
                  <div className="flex gap-2">
                    <Input
                      id="memberSearch"
                      placeholder="Enter username or part of name to search..."
                      value={adminManager.memberSearchTerm}
                      onChange={(e) => adminManager.setMemberSearchTerm(e.target.value)}
                      disabled={adminManager.isSearchingMembers || !!adminManager.isAddingMember || adminManager.isLoadingChannelDetails || adminManager.isLoadingContacts}
                      onKeyDown={(e) => e.key === 'Enter' && !adminManager.isSearchingMembers && adminManager.memberSearchTerm.trim() && adminManager.handleSearchMembers()}
                    />
                    <Button onClick={adminManager.handleSearchMembers} disabled={adminManager.isSearchingMembers || !!adminManager.isAddingMember || !adminManager.memberSearchTerm.trim() || adminManager.isLoadingChannelDetails} variant="outline">
                      {adminManager.isSearchingMembers ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>

                { (adminManager.isLoadingContacts && !adminManager.memberSearchTerm.trim()) && (
                   <div className="text-sm text-muted-foreground flex items-center justify-center py-4"><Loader2 className="mr-2 h-4 w-4 animate-spin"/>Loading contacts...</div>
                )}
                { (adminManager.isSearchingMembers && adminManager.memberSearchTerm.trim()) && (
                  <div className="text-sm text-muted-foreground flex items-center justify-center py-4"><Loader2 className="mr-2 h-4 w-4 animate-spin"/>Searching...</div>
                )}

                <ScrollArea className="max-h-60 border rounded-md">
                  <ul className="p-2 space-y-1">
                    {!adminManager.memberSearchTerm.trim() && !adminManager.isLoadingContacts && adminManager.contactList.length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-4">No contacts found or unable to load. Try searching.</p>
                    )}
                    {!adminManager.memberSearchTerm.trim() && !adminManager.isLoadingContacts && adminManager.contactList.length > 0 && (
                      adminManager.contactList.map((user) => renderUserListItem(user, 'contact'))
                    )}

                    {adminManager.memberSearchTerm.trim() && !adminManager.isSearchingMembers && adminManager.memberSearchResults.length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-4">No users found matching your search.</p>
                    )}
                     {adminManager.memberSearchTerm.trim() && !adminManager.isSearchingMembers && adminManager.memberSearchResults.length > 0 && (
                      adminManager.memberSearchResults.map((user) => renderUserListItem(user, 'search'))
                    )}
                  </ul>
                </ScrollArea>
                <p className="text-xs text-muted-foreground">Note: You can typically only add users who are in your contacts or if they allow being added by their username. Adding many users might be rate-limited by Telegram.</p>
              </TabsContent>

              <TabsContent value="participants" className="p-6">
                {adminManager.isLoadingParticipants && adminManager.participants.length === 0 ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    <span className="ml-2">Loading participants...</span>
                  </div>
                ) : adminManager.participants.length === 0 ? (
                  <p className="text-muted-foreground text-center py-4">No participants found or channel is not accessible for participant listing.</p>
                ) : (
                  <ul className="space-y-3">
                    {adminManager.participants.map((participant) => (
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
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                {adminManager.hasMoreParticipants && !adminManager.isLoadingParticipants && adminManager.participants.length > 0 && (
                  <div className="mt-4 text-center">
                    <Button onClick={() => selectedManagingChannel?.inputPeer && adminManager.fetchParticipants(selectedManagingChannel.inputPeer, adminManager.participants.length)} variant="outline" disabled={adminManager.isLoadingParticipants}>
                      {adminManager.isLoadingParticipants ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
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
