
"use client";

import { useState, useCallback, useEffect } from 'react';
import type { InputPeer, FullChat, ChannelParticipant, ChannelParticipantsResponse, CloudFolder, UpdatedChannelPhoto } from '@/types';
import * as telegramService from '@/services/telegramService';
import type { useToast } from "@/hooks/use-toast";

interface UseChannelAdminManagerProps {
  toast: ReturnType<typeof useToast>['toast'];
  handleGlobalApiError: (error: any, title: string, defaultMessage: string, doPageReset?: boolean) => void;
  selectedManagingChannel: CloudFolder | null;
  onChannelDetailsUpdated?: (updatedFolder: CloudFolder) => void;
}

export function useChannelAdminManager({
  toast,
  handleGlobalApiError,
  selectedManagingChannel,
  onChannelDetailsUpdated,
}: UseChannelAdminManagerProps) {
  const [channelDetails, setChannelDetails] = useState<FullChat | null>(null);
  const [isLoadingChannelDetails, setIsLoadingChannelDetails] = useState(false);
  const [isUpdatingAbout, setIsUpdatingAbout] = useState(false);
  const [isUpdatingUsername, setIsUpdatingUsername] = useState(false);
  const [isCheckingUsername, setIsCheckingUsername] = useState(false);
  const [isExportingInvite, setIsExportingInvite] = useState(false);
  const [isUpdatingPhoto, setIsUpdatingPhoto] = useState(false);

  const [participants, setParticipants] = useState<ChannelParticipant[]>([]);
  const [isLoadingParticipants, setIsLoadingParticipants] = useState(false);
  const [hasMoreParticipants, setHasMoreParticipants] = useState(true);

  // For Add Members Tab
  const [memberSearchTerm, setMemberSearchTerm] = useState("");
  const [memberSearchResults, setMemberSearchResults] = useState<any[]>([]); // Store user objects
  const [isSearchingMembers, setIsSearchingMembers] = useState(false);
  const [isAddingMember, setIsAddingMember] = useState(false);


  const resetAdminManagerState = useCallback(() => {
    setChannelDetails(null);
    setIsLoadingChannelDetails(false);
    setIsUpdatingAbout(false);
    setIsUpdatingUsername(false);
    setIsCheckingUsername(false);
    setIsExportingInvite(false);
    setIsUpdatingPhoto(false);
    setParticipants([]);
    setIsLoadingParticipants(false);
    setHasMoreParticipants(true);
    setMemberSearchTerm("");
    setMemberSearchResults([]);
    setIsSearchingMembers(false);
    setIsAddingMember(false);
  }, []);
  
  const fetchChannelDetails = useCallback(async (channelToFetch: CloudFolder | null) => {
    if (!channelToFetch || !channelToFetch.inputPeer) {
      setChannelDetails(null);
      setIsLoadingChannelDetails(false);
      return;
    }
    setIsLoadingChannelDetails(true);
    try {
      const details = await telegramService.getChannelFullInfo(channelToFetch.inputPeer);
      setChannelDetails(details);
      if (details && onChannelDetailsUpdated) {
        // Pass the updated fullChannelInfo back up to the page state via the callback
        onChannelDetailsUpdated({ ...channelToFetch, fullChannelInfo: details });
      }
    } catch (error: any) {
      handleGlobalApiError(error, "Error Fetching Channel Details", "Could not load channel information. Ensure you have admin rights.");
      setChannelDetails(null);
    } finally {
      setIsLoadingChannelDetails(false);
    }
  }, [handleGlobalApiError, onChannelDetailsUpdated]);

  const updateChannelDescription = useCallback(async (inputPeer: InputPeer, about: string) => {
    setIsUpdatingAbout(true);
    try {
      const success = await telegramService.updateChannelAbout(inputPeer, about);
      if (success) {
        toast({ title: "Description Updated", description: "Channel description has been successfully updated." });
        const newDetails = prevDetails => prevDetails ? { ...prevDetails, about: about } : null;
        setChannelDetails(newDetails);
        if (selectedManagingChannel && onChannelDetailsUpdated) {
             onChannelDetailsUpdated({ ...selectedManagingChannel, fullChannelInfo: {...(channelDetails || {} as FullChat), about: about }});
        }
      } else {
        throw new Error("Server indicated failure to update description.");
      }
    } catch (error: any) {
      handleGlobalApiError(error, "Error Updating Description", "Could not update channel description.");
    } finally {
      setIsUpdatingAbout(false);
    }
  }, [toast, handleGlobalApiError, selectedManagingChannel, onChannelDetailsUpdated, channelDetails]);

  const checkUsernameAvailability = useCallback(async (inputPeer: InputPeer, username: string) => {
    setIsCheckingUsername(true);
    try {
      const isAvailable = await telegramService.checkChatUsername(inputPeer, username);
      toast({ title: "Username Check", description: `Username "${username}" is ${isAvailable ? 'available' : 'not available or invalid'}.` });
      return isAvailable;
    } catch (error: any) {
      toast({ title: "Username Check Failed", description: error.message || "Could not check username.", variant: "destructive" });
      return false;
    } finally {
      setIsCheckingUsername(false);
    }
  }, [toast]);

  const setChannelUsername = useCallback(async (inputPeer: InputPeer, username: string) => {
    setIsUpdatingUsername(true);
    try {
      const success = await telegramService.updateChatUsername(inputPeer, username);
      if (success) {
        toast({ title: "Username Updated", description: `Channel username set to "${username}".` });
        const newDetails = prevDetails => prevDetails ? { ...prevDetails, username: username } : null;
        setChannelDetails(newDetails);
         if (selectedManagingChannel && onChannelDetailsUpdated) {
             onChannelDetailsUpdated({ ...selectedManagingChannel, fullChannelInfo: {...(channelDetails || {} as FullChat), username: username }});
        }
      } else {
        throw new Error("Server indicated failure to update username.");
      }
    } catch (error: any) {
      handleGlobalApiError(error, "Error Setting Username", error.message || "Could not set channel username.");
    } finally {
      setIsUpdatingUsername(false);
    }
  }, [toast, handleGlobalApiError, selectedManagingChannel, onChannelDetailsUpdated, channelDetails]);

  const generateInviteLink = useCallback(async (inputPeer: InputPeer) => {
    setIsExportingInvite(true);
    try {
      const link = await telegramService.exportChannelInviteLink(inputPeer);
      if (link) {
        toast({ title: "Invite Link Generated", description: `Link: ${link}` });
        const newDetails = prevDetails => prevDetails ? { ...prevDetails, exported_invite: { ...(prevDetails.exported_invite || {}), link: link, _:"chatInviteExported" } } : null;
        setChannelDetails(newDetails);
         if (selectedManagingChannel && onChannelDetailsUpdated) {
             onChannelDetailsUpdated({ ...selectedManagingChannel, fullChannelInfo: {...(channelDetails || {} as FullChat), exported_invite: { ...(channelDetails?.exported_invite || {}), link:link, _:"chatInviteExported"} }});
        }
      } else {
        toast({ title: "Failed to Generate Link", description: "Could not generate an invite link.", variant: "destructive" });
      }
    } catch (error: any) {
      handleGlobalApiError(error, "Error Generating Invite Link", error.message || "Could not generate invite link.");
    } finally {
      setIsExportingInvite(false);
    }
  }, [toast, handleGlobalApiError, selectedManagingChannel, onChannelDetailsUpdated, channelDetails]);

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

        let inputFileForPhoto;
        if(uploadedFileResult && uploadedFileResult.media && uploadedFileResult.media.photo){ 
            inputFileForPhoto = {
                 _: 'inputPhoto', 
                 id: uploadedFileResult.media.photo.id,
                 access_hash: uploadedFileResult.media.photo.access_hash,
                 file_reference: uploadedFileResult.media.photo.file_reference,
            };
        } else if (uploadedFileResult && uploadedFileResult._?.startsWith('inputFile')) { 
             inputFileForPhoto = uploadedFileResult; 
        } else {
            throw new Error("Photo upload did not return a valid InputFile structure.");
        }
        
        const updatedPhotoInfo: UpdatedChannelPhoto | null = await telegramService.updateChannelPhotoService(inputPeer, uploadedFileResult.id, inputFileForPhoto);

        if (updatedPhotoInfo && updatedPhotoInfo.photo) {
            toast({ title: "Channel Photo Updated", description: "The channel photo has been successfully updated." });
            const newDetails = prevDetails => prevDetails ? { ...prevDetails, chat_photo: updatedPhotoInfo.photo } : null;
            setChannelDetails(newDetails);
            if (selectedManagingChannel && onChannelDetailsUpdated) { 
                 onChannelDetailsUpdated({ ...selectedManagingChannel, fullChannelInfo: {...(channelDetails || {} as FullChat), chat_photo: updatedPhotoInfo.photo }});
            }
        } else {
            throw new Error("Server indicated failure to update photo after upload.");
        }
    } catch (error: any) {
        handleGlobalApiError(error, "Error Updating Channel Photo", error.message || "Could not update channel photo.");
    } finally {
        setIsUpdatingPhoto(false);
    }
  }, [toast, handleGlobalApiError, selectedManagingChannel, onChannelDetailsUpdated, channelDetails]);

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
        setHasMoreParticipants(enrichedParticipants.length === limit); 
      } else {
        setParticipants(prev => offset === 0 ? [] : prev);
        setHasMoreParticipants(false);
      }
    } catch (error: any) {
      handleGlobalApiError(error, "Error Fetching Participants", "Could not load channel participants.");
      setParticipants(prev => offset === 0 ? [] : prev); // Keep existing on error if paginating
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
      // Using contacts.search. Limit to a reasonable number for UI.
      // This searches users AND contacts.
      const result = await telegramService.telegramApiInstance.call('contacts.search', {
        q: memberSearchTerm,
        limit: 10,
      });
      setMemberSearchResults(result.users || []);
      if (!result.users || result.users.length === 0) {
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
    if (!userToAdd.id) {
      toast({ title: "Error", description: "Invalid user data for adding.", variant: "destructive"});
      return;
    }
    setIsAddingMember(true);
    try {
      const inputUser: InputPeer = {
        _: 'inputUser', // It's inputUser, not inputPeerUser for channels.inviteToChannel
        user_id: userToAdd.id,
        access_hash: userToAdd.access_hash,
      };
      
      await telegramService.telegramApiInstance.call('channels.inviteToChannel', {
        channel: channelInputPeer,
        users: [inputUser],
      });
      toast({ title: "Member Invited", description: `${userToAdd.first_name || 'User'} invited to the channel.` });
      // Optionally, re-fetch participants or update UI optimistically
      if (channelInputPeer) fetchParticipants(channelInputPeer, 0); // Refresh participant list
    } catch (error: any) {
      // Handle specific errors like USER_NOT_MUTUAL_CONTACT, CHANNELS_TOO_MUCH, USERS_TOO_MUCH etc.
      handleGlobalApiError(error, "Error Adding Member", error.message || "Could not add member to channel.");
    } finally {
      setIsAddingMember(false);
    }
  }, [toast, handleGlobalApiError, fetchParticipants]);


  useEffect(() => {
    if (selectedManagingChannel && selectedManagingChannel.inputPeer) {
      if (channelDetails?.id !== selectedManagingChannel.id || // If different channel is selected
          (!channelDetails && !isLoadingChannelDetails) || // Or no details loaded yet
          (selectedManagingChannel.fullChannelInfo && !channelDetails)) { // Or page passed initial info
        
        if (selectedManagingChannel.fullChannelInfo && !channelDetails) {
            setChannelDetails(selectedManagingChannel.fullChannelInfo); // Use pre-loaded if available
        } else {
            fetchChannelDetails(selectedManagingChannel);
        }
        setParticipants([]); 
        setHasMoreParticipants(true);
        setMemberSearchTerm("");
        setMemberSearchResults([]);
      }
    } else if (!selectedManagingChannel) {
       resetAdminManagerState();
    }
  }, [selectedManagingChannel, fetchChannelDetails, channelDetails, isLoadingChannelDetails, resetAdminManagerState]);
  
  return {
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
    // Add Members state and handlers
    memberSearchTerm,
    setMemberSearchTerm,
    handleSearchMembers,
    isSearchingMembers,
    memberSearchResults,
    handleAddMemberToChannel,
    isAddingMember,
  };
}

    