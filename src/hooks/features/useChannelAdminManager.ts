
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
  
  // Edit Info Tab
  const [editableTitle, setEditableTitle] = useState("");
  const [isUpdatingTitle, setIsUpdatingTitle] = useState(false);
  const [isUpdatingAbout, setIsUpdatingAbout] = useState(false);
  const [isUpdatingPhoto, setIsUpdatingPhoto] = useState(false);

  // Invites Tab
  const [isUpdatingUsername, setIsUpdatingUsername] = useState(false);
  const [isCheckingUsername, setIsCheckingUsername] = useState(false);
  const [isExportingInvite, setIsExportingInvite] = useState(false);

  // Participants Tab
  const [participants, setParticipants] = useState<ChannelParticipant[]>([]);
  const [isLoadingParticipants, setIsLoadingParticipants] = useState(false);
  const [hasMoreParticipants, setHasMoreParticipants] = useState(true);

  // Add Members Tab
  const [memberSearchTerm, setMemberSearchTerm] = useState("");
  const [memberSearchResults, setMemberSearchResults] = useState<any[]>([]);
  const [isSearchingMembers, setIsSearchingMembers] = useState(false);
  const [isAddingMember, setIsAddingMember] = useState<string | null>(null); // Store ID of user being added


  const resetAdminManagerState = useCallback(() => {
    setChannelDetails(null);
    setIsLoadingChannelDetails(false);
    setEditableTitle("");
    setIsUpdatingTitle(false);
    setIsUpdatingAbout(false);
    setIsUpdatingPhoto(false);
    setIsUpdatingUsername(false);
    setIsCheckingUsername(false);
    setIsExportingInvite(false);
    setParticipants([]);
    setIsLoadingParticipants(false);
    setHasMoreParticipants(true);
    setMemberSearchTerm("");
    setMemberSearchResults([]);
    setIsSearchingMembers(false);
    setIsAddingMember(null);
  }, []);
  
  const fetchChannelDetails = useCallback(async (channelToFetch: CloudFolder) => {
    if (!channelToFetch.inputPeer) {
      setChannelDetails(null);
      setIsLoadingChannelDetails(false);
      return;
    }
    setIsLoadingChannelDetails(true);
    try {
      const details = await telegramService.getChannelFullInfo(channelToFetch.inputPeer);
      setChannelDetails(details);
      setEditableTitle(details?.title || channelToFetch.name); // Initialize editable title
      if (details && onChannelDetailsUpdated) {
        onChannelDetailsUpdated({ ...channelToFetch, name: details.title || channelToFetch.name, fullChannelInfo: details });
      }
    } catch (error: any) {
      handleGlobalApiError(error, "Error Fetching Channel Details", "Could not load channel information. Ensure you have admin rights.");
      setChannelDetails(null);
      setEditableTitle(channelToFetch.name); // Fallback to original name
    } finally {
      setIsLoadingChannelDetails(false);
    }
  }, [handleGlobalApiError, onChannelDetailsUpdated]);

  const updateChannelTitle = useCallback(async (inputPeer: InputPeer, newTitle: string) => {
    setIsUpdatingTitle(true);
    try {
      const success = await telegramService.editChannelTitle(inputPeer, newTitle);
      if (success) {
        toast({ title: "Title Updated", description: "Channel title has been successfully updated." });
        setChannelDetails(prev => prev ? { ...prev, title: newTitle } : null);
        setEditableTitle(newTitle);
        if (selectedManagingChannel && onChannelDetailsUpdated) {
             onChannelDetailsUpdated({ ...selectedManagingChannel, name: newTitle, fullChannelInfo: {...(channelDetails || {} as FullChat), title: newTitle }});
        }
      } else {
        throw new Error("Server indicated failure to update title.");
      }
    } catch (error: any) {
      handleGlobalApiError(error, "Error Updating Title", "Could not update channel title.");
    } finally {
      setIsUpdatingTitle(false);
    }
  }, [toast, handleGlobalApiError, selectedManagingChannel, onChannelDetailsUpdated, channelDetails]);


  const updateChannelDescription = useCallback(async (inputPeer: InputPeer, about: string) => {
    setIsUpdatingAbout(true);
    try {
      const success = await telegramService.updateChannelAbout(inputPeer, about);
      if (success) {
        toast({ title: "Description Updated", description: "Channel description has been successfully updated." });
        setChannelDetails(prevDetails => prevDetails ? { ...prevDetails, about: about } : null);
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
        toast({ title: "Username Updated", description: `Channel username set to "${username}". Public link: t.me/${username}` });
        setChannelDetails(prevDetails => prevDetails ? { ...prevDetails, username: username } : null);
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
    if (!userToAdd.id || userToAdd.access_hash === undefined) { // access_hash can be 0, so check for undefined
      toast({ title: "Error", description: "Invalid user data for adding (missing ID or access hash).", variant: "destructive"});
      return;
    }
    setIsAddingMember(String(userToAdd.id)); // Set ID of user being added
    try {
      const inputUser: InputPeer = {
        _: 'inputPeerUser',
        user_id: userToAdd.id,
        access_hash: userToAdd.access_hash,
      };
      
      const success = await telegramService.inviteUserToChannel(channelInputPeer, inputUser);
      if (success) {
        toast({ title: "Member Invited", description: `${userToAdd.first_name || 'User'} invited to the channel.` });
        if (channelInputPeer) fetchParticipants(channelInputPeer, 0); // Refresh participant list
      } else {
        throw new Error("Server indicated failure to invite user.");
      }
    } catch (error: any) {
      handleGlobalApiError(error, "Error Adding Member", error.message || "Could not add member to channel.");
    } finally {
      setIsAddingMember(null);
    }
  }, [toast, handleGlobalApiError, fetchParticipants]);


  useEffect(() => {
    if (selectedManagingChannel && selectedManagingChannel.inputPeer) {
      // If the selected channel ID changes OR (no details are loaded AND not currently loading) OR (page passed initial info and we haven't used it)
      if (channelDetails?.id !== selectedManagingChannel.id || 
          (!channelDetails && !isLoadingChannelDetails) ||
          (selectedManagingChannel.fullChannelInfo && !channelDetails && channelDetails?.id !== selectedManagingChannel.id)) {
        
        resetAdminManagerState(); // Reset all sub-states
        if (selectedManagingChannel.fullChannelInfo && (!channelDetails || channelDetails.id !== selectedManagingChannel.id) ) {
            setChannelDetails(selectedManagingChannel.fullChannelInfo); 
            setEditableTitle(selectedManagingChannel.fullChannelInfo.title || selectedManagingChannel.name);
        } else {
            fetchChannelDetails(selectedManagingChannel);
        }
      }
    } else if (!selectedManagingChannel) {
       resetAdminManagerState();
    }
  }, [selectedManagingChannel, fetchChannelDetails, channelDetails, isLoadingChannelDetails, resetAdminManagerState]);
  
  return {
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
  };
}

    
