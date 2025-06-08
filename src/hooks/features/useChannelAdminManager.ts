
"use client";

import { useState, useCallback, useEffect } from 'react';
import type { InputPeer, FullChat, ChannelParticipant, ChannelParticipantsResponse, CloudFolder, UpdatedChannelPhoto } from '@/types';
import * as telegramService from '@/services/telegramService';
import type { useToast } from "@/hooks/use-toast";

interface UseChannelAdminManagerProps {
  toast: ReturnType<typeof useToast>['toast'];
  handleGlobalApiError: (error: any, title: string, defaultMessage: string, doPageReset?: boolean) => void;
  selectedManagingChannel: CloudFolder | null;
  onChannelDetailsUpdatedAppLevel?: (updatedFolder: CloudFolder) => void;
}

export type UsernameAvailabilityStatus = 'idle' | 'checking' | 'available' | 'unavailable' | 'error' | null;

export function useChannelAdminManager({
  toast,
  handleGlobalApiError,
  selectedManagingChannel,
  onChannelDetailsUpdatedAppLevel,
}: UseChannelAdminManagerProps) {
  const [channelDetails, setChannelDetails] = useState<FullChat | null>(null);
  const [isLoadingChannelDetails, setIsLoadingChannelDetails] = useState(false);
  
  const [editableTitle, setEditableTitle] = useState("");
  const [isUpdatingTitle, setIsUpdatingTitle] = useState(false);
  const [isUpdatingAbout, setIsUpdatingAbout] = useState(false);
  const [isUpdatingPhoto, setIsUpdatingPhoto] = useState(false);

  const [isUpdatingUsername, setIsUpdatingUsername] = useState(false);
  const [isCheckingUsername, setIsCheckingUsername] = useState(false);
  const [usernameAvailability, setUsernameAvailability] = useState<UsernameAvailabilityStatus>(null);
  const [isExportingInvite, setIsExportingInvite] = useState(false);

  const [participants, setParticipants] = useState<ChannelParticipant[]>([]);
  const [isLoadingParticipants, setIsLoadingParticipants] = useState(false);
  const [hasMoreParticipants, setHasMoreParticipants] = useState(true);

  const [memberSearchTerm, setMemberSearchTerm] = useState("");
  const [memberSearchResults, setMemberSearchResults] = useState<any[]>([]);
  const [isSearchingMembers, setIsSearchingMembers] = useState(false);
  const [isAddingMember, setIsAddingMember] = useState<string | null>(null);


  const resetAdminManagerState = useCallback((keepChannelDetails = false) => {
    if (!keepChannelDetails) {
      setChannelDetails(null);
      setEditableTitle("");
    }
    setIsLoadingChannelDetails(false);
    setIsUpdatingTitle(false);
    setIsUpdatingAbout(false);
    setIsUpdatingPhoto(false);
    setIsUpdatingUsername(false);
    setIsCheckingUsername(false);
    setUsernameAvailability(null);
    setIsExportingInvite(false);
    setParticipants([]);
    setIsLoadingParticipants(false);
    setHasMoreParticipants(true);
    setMemberSearchTerm("");
    setMemberSearchResults([]);
    setIsSearchingMembers(false);
    setIsAddingMember(null);
  }, []);
  
  const fetchChannelDetails = useCallback(async (channelInputPeer: InputPeer, currentChannelName: string) => {
    if (!channelInputPeer) {
      setChannelDetails(null);
      setIsLoadingChannelDetails(false);
      return;
    }
    setIsLoadingChannelDetails(true);
    try {
      const details = await telegramService.getChannelFullInfo(channelInputPeer);
      setChannelDetails(details);
      setEditableTitle(details?.title || currentChannelName); 
      if (details && selectedManagingChannel && onChannelDetailsUpdatedAppLevel) {
        onChannelDetailsUpdatedAppLevel({ ...selectedManagingChannel, name: details.title || selectedManagingChannel.name, fullChannelInfo: details });
      }
    } catch (error: any) {
      handleGlobalApiError(error, "Error Fetching Channel Details", "Could not load channel information. Ensure you have admin rights.");
      setChannelDetails(null);
      setEditableTitle(currentChannelName);
    } finally {
      setIsLoadingChannelDetails(false);
    }
  }, [handleGlobalApiError, onChannelDetailsUpdatedAppLevel, selectedManagingChannel]);


  useEffect(() => {
    if (selectedManagingChannel && selectedManagingChannel.inputPeer) {
      if (channelDetails?.id !== selectedManagingChannel.id || 
          (!channelDetails && !isLoadingChannelDetails) ||
          (selectedManagingChannel.fullChannelInfo && !channelDetails && channelDetails?.id !== selectedManagingChannel.id)) {
        
        resetAdminManagerState(selectedManagingChannel.fullChannelInfo && channelDetails?.id === selectedManagingChannel.id); 
        
        if (selectedManagingChannel.fullChannelInfo && (!channelDetails || channelDetails.id !== selectedManagingChannel.id) ) {
            setChannelDetails(selectedManagingChannel.fullChannelInfo); 
            setEditableTitle(selectedManagingChannel.fullChannelInfo.title || selectedManagingChannel.name);
        } else {
            fetchChannelDetails(selectedManagingChannel.inputPeer, selectedManagingChannel.name);
        }
      }
    } else if (!selectedManagingChannel) {
       resetAdminManagerState();
    }
  }, [selectedManagingChannel, fetchChannelDetails, channelDetails, isLoadingChannelDetails, resetAdminManagerState]);

  const updateChannelTitle = useCallback(async (inputPeer: InputPeer, newTitle: string) => {
    setIsUpdatingTitle(true);
    try {
      const success = await telegramService.editChannelTitle(inputPeer, newTitle);
      if (success) {
        toast({ title: "Title Updated", description: "Channel title has been successfully updated." });
        const updatedDetails = { ...(channelDetails || {} as FullChat), title: newTitle };
        setChannelDetails(updatedDetails as FullChat);
        setEditableTitle(newTitle);
        if (selectedManagingChannel && onChannelDetailsUpdatedAppLevel) {
             onChannelDetailsUpdatedAppLevel({ ...selectedManagingChannel, name: newTitle, fullChannelInfo: updatedDetails as FullChat });
        }
      } else {
        throw new Error("Server indicated failure to update title.");
      }
    } catch (error: any) {
      handleGlobalApiError(error, "Error Updating Title", "Could not update channel title.");
    } finally {
      setIsUpdatingTitle(false);
    }
  }, [toast, handleGlobalApiError, selectedManagingChannel, onChannelDetailsUpdatedAppLevel, channelDetails]);

  const updateChannelDescription = useCallback(async (inputPeer: InputPeer, about: string) => {
    setIsUpdatingAbout(true);
    try {
      const success = await telegramService.updateChannelAbout(inputPeer, about);
      if (success) {
        toast({ title: "Description Updated", description: "Channel description has been successfully updated." });
        const updatedDetails = { ...(channelDetails || {} as FullChat), about: about };
        setChannelDetails(updatedDetails as FullChat);
        if (selectedManagingChannel && onChannelDetailsUpdatedAppLevel) {
             onChannelDetailsUpdatedAppLevel({ ...selectedManagingChannel, fullChannelInfo: updatedDetails as FullChat });
        }
      } else {
        throw new Error("Server indicated failure to update description.");
      }
    } catch (error: any) {
      handleGlobalApiError(error, "Error Updating Description", "Could not update channel description.");
    } finally {
      setIsUpdatingAbout(false);
    }
  }, [toast, handleGlobalApiError, selectedManagingChannel, onChannelDetailsUpdatedAppLevel, channelDetails]);

  const checkUsernameAvailability = useCallback(async (inputPeer: InputPeer, usernameToCheck: string) => {
    setIsCheckingUsername(true);
    setUsernameAvailability('checking');
    try {
      const isAvailable = await telegramService.checkChatUsername(inputPeer, usernameToCheck);
      setUsernameAvailability(isAvailable ? 'available' : 'unavailable');
      toast({ 
        title: "Username Check", 
        description: `Username "${usernameToCheck}" is ${isAvailable ? 'available' : 'not available or invalid'}.`,
        variant: isAvailable ? 'default' : 'destructive' 
      });
      return isAvailable;
    } catch (error: any) {
      setUsernameAvailability('error');
      toast({ title: "Username Check Failed", description: error.message || "Could not check username.", variant: "destructive" });
      return false;
    } finally {
      setIsCheckingUsername(false);
    }
  }, [toast]);

  const setChannelUsername = useCallback(async (inputPeer: InputPeer, usernameToSet: string) => {
    setIsUpdatingUsername(true);
    try {
      const success = await telegramService.updateChatUsername(inputPeer, usernameToSet);
      if (success) {
        toast({ title: "Username Updated", description: `Channel username set to "${usernameToSet}". Public link: t.me/${usernameToSet}` });
        const updatedDetails = { ...(channelDetails || {} as FullChat), username: usernameToSet };
        setChannelDetails(updatedDetails as FullChat);
        setUsernameAvailability(null); // Reset availability status, new username is now current
         if (selectedManagingChannel && onChannelDetailsUpdatedAppLevel) {
             onChannelDetailsUpdatedAppLevel({ ...selectedManagingChannel, fullChannelInfo: updatedDetails as FullChat });
        }
      } else {
        throw new Error("Server indicated failure to update username.");
      }
    } catch (error: any) {
      handleGlobalApiError(error, "Error Setting Username", error.message || "Could not set channel username.");
    } finally {
      setIsUpdatingUsername(false);
    }
  }, [toast, handleGlobalApiError, selectedManagingChannel, onChannelDetailsUpdatedAppLevel, channelDetails]);

  const generateInviteLink = useCallback(async (inputPeer: InputPeer) => {
    setIsExportingInvite(true);
    try {
      const link = await telegramService.exportChannelInviteLink(inputPeer);
      if (link) {
        toast({ title: "Invite Link Generated", description: `Link: ${link}` });
        const updatedDetails = { ...(channelDetails || {} as FullChat), exported_invite: { ...(channelDetails?.exported_invite || {}), link:link, _:"chatInviteExported"} };
        setChannelDetails(updatedDetails as FullChat);
         if (selectedManagingChannel && onChannelDetailsUpdatedAppLevel) {
             onChannelDetailsUpdatedAppLevel({ ...selectedManagingChannel, fullChannelInfo: updatedDetails as FullChat});
        }
      } else {
        toast({ title: "Failed to Generate Link", description: "Could not generate an invite link.", variant: "destructive" });
      }
    } catch (error: any) {
      handleGlobalApiError(error, "Error Generating Invite Link", error.message || "Could not generate invite link.");
    } finally {
      setIsExportingInvite(false);
    }
  }, [toast, handleGlobalApiError, selectedManagingChannel, onChannelDetailsUpdatedAppLevel, channelDetails]);

  const updateChannelPhoto = useCallback(async (inputPeer: InputPeer, photoFile: File) => {
    setIsUpdatingPhoto(true);
    try {
        const uploadedFileResult = await telegramService.uploadFile(
            inputPeer, 
            photoFile,
            (progress) => { /* console.log(`Photo upload progress: ${progress}%`) */ },
            undefined, 
            undefined, 
            true 
        );
        
        const updatedPhotoInfo: UpdatedChannelPhoto | null = await telegramService.updateChannelPhotoService(inputPeer, uploadedFileResult.id, uploadedFileResult);

        if (updatedPhotoInfo && updatedPhotoInfo.photo) {
            toast({ title: "Channel Photo Updated", description: "The channel photo has been successfully updated." });
            const updatedDetails = { ...(channelDetails || {} as FullChat), chat_photo: updatedPhotoInfo.photo };
            setChannelDetails(updatedDetails as FullChat);
            if (selectedManagingChannel && onChannelDetailsUpdatedAppLevel) { 
                 onChannelDetailsUpdatedAppLevel({ ...selectedManagingChannel, fullChannelInfo: updatedDetails as FullChat });
            }
        } else {
            throw new Error("Server indicated failure to update photo after upload.");
        }
    } catch (error: any) {
        handleGlobalApiError(error, "Error Updating Channel Photo", error.message || "Could not update channel photo.");
    } finally {
        setIsUpdatingPhoto(false);
    }
  }, [toast, handleGlobalApiError, selectedManagingChannel, onChannelDetailsUpdatedAppLevel, channelDetails]);

  const fetchParticipants = useCallback(async (inputPeer: InputPeer, offset: number = 0, limit: number = 50) => {
    if (!inputPeer) return;
    setIsLoadingParticipants(true);
    try {
      const response: ChannelParticipantsResponse = await telegramService.telegramApiInstance.call('channels.getParticipants', {
        channel: inputPeer,
        filter: { _: 'channelParticipantsRecent' }, 
        offset: offset,
        limit: limit,
        hash: 0,
      });
      
      if (response && response.participants) {
        const enrichedParticipants = response.participants.map(p => {
            const user = response.users.find(u => String(u.id) === String(p.user_id));
            return { ...p, user: user };
        });

        setParticipants(prev => offset === 0 ? enrichedParticipants : [...prev, ...enrichedParticipants]);
        setHasMoreParticipants(enrichedParticipants.length === limit && response.count > (offset + enrichedParticipants.length)); 
      } else {
        setParticipants(prev => offset === 0 ? [] : prev);
        setHasMoreParticipants(false);
      }
    } catch (error: any) {
      handleGlobalApiError(error, "Error Fetching Participants", "Could not load channel participants.");
      setParticipants(prev => offset === 0 ? [] : prev);
      setHasMoreParticipants(false);
    } finally {
      setIsLoadingParticipants(false);
    }
  }, [handleGlobalApiError]);

  const handleSearchMembers = useCallback(async () => {
    if (!memberSearchTerm.trim() || !selectedManagingChannel?.inputPeer) {
      setMemberSearchResults([]);
      return;
    }
    setIsSearchingMembers(true);
    setMemberSearchResults([]);
    try {
      const users = await telegramService.searchUsers(memberSearchTerm);
      setMemberSearchResults(users || []);
      if (!users || users.length === 0) {
        toast({ title: "No Users Found", description: `No users matched "${memberSearchTerm}".`});
      }
    } catch (error: any) {
      handleGlobalApiError(error, "Error Searching Users", "Could not perform user search.");
      setMemberSearchResults([]);
    } finally {
      setIsSearchingMembers(false);
    }
  }, [memberSearchTerm, selectedManagingChannel?.inputPeer, toast, handleGlobalApiError]);

  const handleAddMemberToChannel = useCallback(async (channelInputPeer: InputPeer, userToAdd: any) => {
    if (!userToAdd.id || userToAdd.access_hash === undefined) {
      toast({ title: "Error", description: "Invalid user data for adding (missing ID or access hash).", variant: "destructive"});
      return;
    }
    setIsAddingMember(String(userToAdd.id));
    try {
      const inputUser: InputPeer = {
        _: 'inputPeerUser',
        user_id: userToAdd.id,
        access_hash: userToAdd.access_hash,
      };
      
      const success = await telegramService.inviteUserToChannel(channelInputPeer, inputUser);
      if (success) {
        toast({ title: "Member Invited", description: `${userToAdd.first_name || 'User'} invited to the channel.` });
        if (channelInputPeer) fetchParticipants(channelInputPeer, 0);
      } else {
        throw new Error("Server indicated failure to invite user.");
      }
    } catch (error: any) {
      handleGlobalApiError(error, "Error Adding Member", error.message || "Could not add member to channel.");
    } finally {
      setIsAddingMember(null);
    }
  }, [toast, handleGlobalApiError, fetchParticipants]);
  
  return {
    channelDetails,
    isLoadingChannelDetails,
    editableTitle,
    setEditableTitle,
    isUpdatingTitle,
    isUpdatingAbout,
    isUpdatingUsername,
    isCheckingUsername,
    usernameAvailability,
    setUsernameAvailability, // Expose setter for dialog to reset
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
  };
}
    
