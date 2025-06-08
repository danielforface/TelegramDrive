
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
        onChannelDetailsUpdated({ ...channelToFetch, fullChannelInfo: details });
      }
    } catch (error: any) {
      handleGlobalApiError(error, "Error Fetching Channel Details", "Could not load channel information.");
      setChannelDetails(null);
    } finally {
      setIsLoadingChannelDetails(false);
    }
  }, [handleGlobalApiError, onChannelDetailsUpdated]); // setChannelDetails, setIsLoadingChannelDetails are stable

  const updateChannelDescription = useCallback(async (inputPeer: InputPeer, about: string) => {
    setIsUpdatingAbout(true);
    try {
      const success = await telegramService.updateChannelAbout(inputPeer, about);
      if (success) {
        toast({ title: "Description Updated", description: "Channel description has been successfully updated." });
        setChannelDetails(prev => prev ? { ...prev, about: about } : null);
        if (selectedManagingChannel && onChannelDetailsUpdated) { // Use selectedManagingChannel from closure
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
        setChannelDetails(prev => prev ? { ...prev, username: username } : null);
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
        setChannelDetails(prev => prev ? { ...prev, exported_invite: { ...(prev.exported_invite || {}), link: link, _:"chatInviteExported" } } : null);
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
            setChannelDetails(prev => prev ? { ...prev, chat_photo: updatedPhotoInfo.photo } : null);
            if (selectedManagingChannel && onChannelDetailsUpdated) { // Use selectedManagingChannel from closure
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
  }, [handleGlobalApiError]); // Removed participants from here, setParticipants is stable


  // Effect to fetch/reset channel details when selectedManagingChannel changes
  useEffect(() => {
    if (selectedManagingChannel && selectedManagingChannel.inputPeer) {
      resetAdminManagerState(); // Reset states before fetching new details
      fetchChannelDetails(selectedManagingChannel);
    } else if (!selectedManagingChannel) { // Explicitly reset if selection is cleared
      resetAdminManagerState();
    }
  }, [selectedManagingChannel, fetchChannelDetails, resetAdminManagerState]);
  // Note: `selectedManagingChannel` object itself as dependency. If it changes, effect runs.
  // `fetchChannelDetails` and `resetAdminManagerState` are stable due to useCallback with stable dependencies.

  // Effect to fetch participants when channelDetails are available (and other conditions met)
  useEffect(() => {
    if (channelDetails && selectedManagingChannel?.inputPeer && participants.length === 0 && hasMoreParticipants && !isLoadingParticipants) {
      fetchParticipants(selectedManagingChannel.inputPeer, 0);
    }
  }, [channelDetails, selectedManagingChannel?.inputPeer, participants.length, hasMoreParticipants, isLoadingParticipants, fetchParticipants]);

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
    // fetchChannelDetails, // Not needed to be exported if only called internally by useEffect
    updateChannelDescription,
    checkUsernameAvailability,
    setChannelUsername,
    generateInviteLink,
    updateChannelPhoto,
    fetchParticipants,
    resetAdminManagerState,
  };
}

    