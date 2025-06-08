
"use client";

import { useState, useCallback, useEffect } from 'react';
import type { InputPeer, FullChat, ChannelParticipant, ChannelParticipantsResponse, CloudFolder, UpdatedChannelPhoto } from '@/types';
import * as telegramService from '@/services/telegramService';
import type { useToast } from "@/hooks/use-toast";

interface UseChannelAdminManagerProps {
  toast: ReturnType<typeof useToast>['toast'];
  handleGlobalApiError: (error: any, title: string, defaultMessage: string, doPageReset?: boolean) => void;
  selectedManagingChannel: CloudFolder | null; // From usePageDialogsVisibility
  onChannelDetailsUpdated?: (updatedFolder: CloudFolder) => void; // Callback to update folder list in page.tsx
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
  // const [participantsOffset, setParticipantsOffset] = useState<string | undefined>(undefined); // For pagination if needed

  const fetchChannelDetails = useCallback(async (inputPeer: InputPeer) => {
    setIsLoadingChannelDetails(true);
    try {
      const details = await telegramService.getChannelFullInfo(inputPeer);
      setChannelDetails(details);
      if (details && selectedManagingChannel && onChannelDetailsUpdated) {
        onChannelDetailsUpdated({ ...selectedManagingChannel, fullChannelInfo: details });
      }
    } catch (error: any) {
      handleGlobalApiError(error, "Error Fetching Channel Details", "Could not load channel information.");
      setChannelDetails(null);
    } finally {
      setIsLoadingChannelDetails(false);
    }
  }, [handleGlobalApiError, onChannelDetailsUpdated, selectedManagingChannel]);

  const updateChannelDescription = useCallback(async (inputPeer: InputPeer, about: string) => {
    setIsUpdatingAbout(true);
    try {
      const success = await telegramService.updateChannelAbout(inputPeer, about);
      if (success) {
        toast({ title: "Description Updated", description: "Channel description has been successfully updated." });
        setChannelDetails(prev => prev ? { ...prev, about: about } : null);
        if (channelDetails && selectedManagingChannel && onChannelDetailsUpdated) {
             onChannelDetailsUpdated({ ...selectedManagingChannel, fullChannelInfo: {...channelDetails, about: about }});
        }
      } else {
        throw new Error("Server indicated failure to update description.");
      }
    } catch (error: any) {
      handleGlobalApiError(error, "Error Updating Description", "Could not update channel description.");
    } finally {
      setIsUpdatingAbout(false);
    }
  }, [toast, handleGlobalApiError, channelDetails, selectedManagingChannel, onChannelDetailsUpdated]);

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
         if (channelDetails && selectedManagingChannel && onChannelDetailsUpdated) {
             onChannelDetailsUpdated({ ...selectedManagingChannel, fullChannelInfo: {...channelDetails, username: username }});
        }
      } else {
        throw new Error("Server indicated failure to update username.");
      }
    } catch (error: any) {
      handleGlobalApiError(error, "Error Setting Username", error.message || "Could not set channel username.");
    } finally {
      setIsUpdatingUsername(false);
    }
  }, [toast, handleGlobalApiError, channelDetails, selectedManagingChannel, onChannelDetailsUpdated]);

  const generateInviteLink = useCallback(async (inputPeer: InputPeer) => {
    setIsExportingInvite(true);
    try {
      const link = await telegramService.exportChannelInviteLink(inputPeer);
      if (link) {
        toast({ title: "Invite Link Generated", description: `Link: ${link}` });
        setChannelDetails(prev => prev ? { ...prev, exported_invite: { ...(prev.exported_invite || {}), link: link, _:"chatInviteExported" } } : null);
         if (channelDetails && selectedManagingChannel && onChannelDetailsUpdated) {
             onChannelDetailsUpdated({ ...selectedManagingChannel, fullChannelInfo: {...channelDetails, exported_invite: { ...(channelDetails.exported_invite || {}), link:link, _:"chatInviteExported"} }});
        }
      } else {
        toast({ title: "Failed to Generate Link", description: "Could not generate an invite link.", variant: "destructive" });
      }
    } catch (error: any) {
      handleGlobalApiError(error, "Error Generating Invite Link", error.message || "Could not generate invite link.");
    } finally {
      setIsExportingInvite(false);
    }
  }, [toast, handleGlobalApiError, channelDetails, selectedManagingChannel, onChannelDetailsUpdated]);

  const updateChannelPhoto = useCallback(async (inputPeer: InputPeer, photoFile: File) => {
    setIsUpdatingPhoto(true);
    try {
        // Step 1: Upload the file (similar to general file upload but for photo type)
        // This returns an InputFile type object.
        // For simplicity, assuming telegramService.uploadFile can be adapted or a new one created
        // for 'InputPhoto' or 'InputChatUploadedPhoto'.
        // This is a complex part involving file parts if large.
        // Let's assume a simplified upload that gives us an InputFile object.
        const uploadedFileResult = await telegramService.uploadFile(
            inputPeer, // Peer context, though for upload.saveFilePart it's not directly used
            photoFile,
            (progress) => { /* console.log(`Photo upload progress: ${progress}%`) */ },
            undefined, // Abort signal
            undefined, // Caption not needed for photo
            true // Indicate it's for a photo to get correct InputFile type
        );

        let inputFileForPhoto;
        if(uploadedFileResult && uploadedFileResult.media && uploadedFileResult.media.photo){ // if uploadFile returns structure with media.photo
            inputFileForPhoto = {
                 _: 'inputPhoto', // Or inputPhotoUploaded if that's what upload service gives
                 id: uploadedFileResult.media.photo.id,
                 access_hash: uploadedFileResult.media.photo.access_hash,
                 file_reference: uploadedFileResult.media.photo.file_reference,
            };
        } else if (uploadedFileResult && uploadedFileResult._?.startsWith('inputFile')) { // If it's a direct InputFile
             inputFileForPhoto = uploadedFileResult; // This is an approximation
        } else {
            throw new Error("Photo upload did not return a valid InputFile structure.");
        }
        
        // Step 2: Call channels.editPhoto with the InputFile
        const updatedPhotoInfo: UpdatedChannelPhoto | null = await telegramService.updateChannelPhotoService(inputPeer, uploadedFileResult.id, inputFileForPhoto);

        if (updatedPhotoInfo && updatedPhotoInfo.photo) {
            toast({ title: "Channel Photo Updated", description: "The channel photo has been successfully updated." });
            setChannelDetails(prev => prev ? { ...prev, chat_photo: updatedPhotoInfo.photo } : null);
            if (channelDetails && selectedManagingChannel && onChannelDetailsUpdated) {
                 onChannelDetailsUpdated({ ...selectedManagingChannel, fullChannelInfo: {...channelDetails, chat_photo: updatedPhotoInfo.photo }});
            }
        } else {
            throw new Error("Server indicated failure to update photo after upload.");
        }
    } catch (error: any) {
        handleGlobalApiError(error, "Error Updating Channel Photo", error.message || "Could not update channel photo.");
    } finally {
        setIsUpdatingPhoto(false);
    }
  }, [toast, handleGlobalApiError, channelDetails, selectedManagingChannel, onChannelDetailsUpdated]);


  const fetchParticipants = useCallback(async (inputPeer: InputPeer, offset: number = 0, limit: number = 50) => {
    setIsLoadingParticipants(true);
    try {
      // Simplified: Real participant fetching is complex (filters, ranks, etc.)
      // This is a placeholder call structure.
      const response: ChannelParticipantsResponse = await telegramService.telegramApiInstance.call('channels.getParticipants', {
        channel: inputPeer,
        filter: { _: 'channelParticipantsRecent' }, // Or other filters like 'channelParticipantsAdmins'
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
        // setParticipantsOffset(response.next_offset); // If API returns a string offset for this method
        setHasMoreParticipants(enrichedParticipants.length === limit); // Basic pagination check
      } else {
        setParticipants(offset === 0 ? [] : participants);
        setHasMoreParticipants(false);
      }
    } catch (error: any) {
      handleGlobalApiError(error, "Error Fetching Participants", "Could not load channel participants.");
      setParticipants(offset === 0 ? [] : participants);
      setHasMoreParticipants(false);
    } finally {
      setIsLoadingParticipants(false);
    }
  }, [handleGlobalApiError, participants]);


  useEffect(() => {
    if (selectedManagingChannel && selectedManagingChannel.inputPeer) {
      fetchChannelDetails(selectedManagingChannel.inputPeer);
      setParticipants([]); // Reset participants when channel changes
      setHasMoreParticipants(true);
      // setParticipantsOffset(undefined);
      // fetchParticipants(selectedManagingChannel.inputPeer); // Initial participant fetch
    } else {
      setChannelDetails(null);
      setParticipants([]);
    }
  }, [selectedManagingChannel, fetchChannelDetails, fetchParticipants]);


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
    // setParticipantsOffset(undefined);
  }, []);


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
    fetchChannelDetails, // If explicit refresh needed
    updateChannelDescription,
    checkUsernameAvailability,
    setChannelUsername,
    generateInviteLink,
    updateChannelPhoto,
    fetchParticipants,
    resetAdminManagerState,
  };
}
