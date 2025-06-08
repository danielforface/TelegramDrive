
"use client";

import { useState, useCallback, useEffect, useRef } from 'react'; // Added useRef
import type { InputPeer, FullChat, ChannelParticipant, ChannelParticipantsResponse, CloudFolder, UpdatedChannelPhoto, CloudChannelConfigV1 } from '@/types';
import * as telegramService from '@/services/telegramService';
import type { useToast } from "@/hooks/use-toast";

export type UsernameAvailabilityStatus = 'idle' | 'checking' | 'available' | 'unavailable' | 'error' | null;

interface UseChannelAdminManagerProps {
  toast: ReturnType<typeof useToast>['toast'];
  handleGlobalApiError: (error: any, title: string, defaultMessage: string, doPageReset?: boolean) => void;
  selectedManagingChannel: CloudFolder | null;
  onChannelDetailsUpdatedAppLevel?: (updatedFolder: CloudFolder) => void;
  isOpen?: boolean;
  activeTab?: string;
}

export function useChannelAdminManager({
  toast,
  handleGlobalApiError,
  selectedManagingChannel,
  onChannelDetailsUpdatedAppLevel,
  isOpen,
  activeTab,
}: UseChannelAdminManagerProps) {
  const [channelDetails, setChannelDetails] = useState<FullChat | null>(null);
  const [isLoadingChannelDetails, setIsLoadingChannelDetails] = useState(false);

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

  const [contactList, setContactList] = useState<any[]>([]);
  const [isLoadingContacts, setIsLoadingContacts] = useState(false);
  const [hasFetchedContactsOnce, setHasFetchedContactsOnce] = useState(false);


  const resetAdminManagerState = useCallback(() => {
    console.log("[AdminManager_ResetState] Resetting admin manager state.");
    setChannelDetails(null);
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
    setContactList([]);
    setIsLoadingContacts(false);
    setHasFetchedContactsOnce(false);
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
      if (details && selectedManagingChannel && onChannelDetailsUpdatedAppLevel) {
        onChannelDetailsUpdatedAppLevel({ ...selectedManagingChannel, name: details.title || selectedManagingChannel.name, fullChannelInfo: details });
      }
    } catch (error: any) {
      handleGlobalApiError(error, "Error Fetching Channel Details", "Could not load channel information. Ensure you have admin rights.");
      setChannelDetails(null);
    } finally {
      setIsLoadingChannelDetails(false);
    }
  }, [handleGlobalApiError, onChannelDetailsUpdatedAppLevel, selectedManagingChannel]);

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

  const fetchContacts = useCallback(async () => {
    console.log("[AdminManager_FetchContacts] Initiating contact fetch. isLoadingContacts:", isLoadingContacts, "hasFetchedContactsOnce:", hasFetchedContactsOnce);
    if (isLoadingContacts) {
      console.log("[AdminManager_FetchContacts] Already loading contacts, skipping.");
      return;
    }

    setIsLoadingContacts(true);
    try {
      const contactsData = await telegramService.getContacts();
      console.log("[AdminManager_FetchContacts] Received contactsData:", contactsData);
      setContactList(contactsData || []);
      setHasFetchedContactsOnce(true);
      console.log("[AdminManager_FetchContacts] Contacts fetched and set. Count:", (contactsData || []).length);
    } catch (error: any) {
      console.error("[AdminManager_FetchContacts] Error fetching contacts:", error);
      handleGlobalApiError(error, "Error Fetching Contacts", "Could not load your contacts list.");
      setContactList([]);
      setHasFetchedContactsOnce(true); // Mark as fetched even on error to prevent loops
    } finally {
      setIsLoadingContacts(false);
      console.log("[AdminManager_FetchContacts] Finished contact fetch process.");
    }
  }, [handleGlobalApiError, isLoadingContacts, hasFetchedContactsOnce]);


  const updateChannelTitle = useCallback(async (inputPeer: InputPeer, newTitle: string) => {
    setIsUpdatingTitle(true);
    try {
      const success = await telegramService.editChannelTitle(inputPeer, newTitle);
      if (success) {
        toast({ title: "Title Updated", description: "Channel title has been successfully updated." });
        const newDetails = channelDetails ? { ...channelDetails, title: newTitle } as FullChat : null;
        setChannelDetails(newDetails);
        if (selectedManagingChannel && onChannelDetailsUpdatedAppLevel && newDetails) {
             onChannelDetailsUpdatedAppLevel({ ...selectedManagingChannel, name: newTitle, fullChannelInfo: newDetails });
        }
        // Update channel's VFS config message with the new title
        try {
            const currentConfig = await telegramService.getCloudChannelConfig(inputPeer);
            if (currentConfig && currentConfig.app_signature === telegramService.CLOUDIFIER_APP_SIGNATURE_V1) {
                currentConfig.channel_title_at_creation = newTitle; // Update this field
                currentConfig.last_updated_timestamp_utc = new Date().toISOString();
                await telegramService.updateCloudChannelConfig(inputPeer, currentConfig);
                toast({ title: "VFS Config Updated", description: "Channel title in VFS config also updated.", variant: "default" });
            } else if(currentConfig) {
                toast({ title: "Config Warning", description: "Channel title updated, but VFS config signature mismatch. Config not updated.", variant: "default", duration: 7000});
            } else {
                 toast({ title: "Config Note", description: "Channel title updated. No VFS config found to update.", variant: "default", duration: 5000});
            }
        } catch (configError: any) {
            toast({ title: "VFS Config Update Failed", description: `Channel title updated, but failed to update VFS config: ${configError.message}`, variant: "destructive", duration: 7000 });
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
        const newDetails = channelDetails ? { ...channelDetails, about: about } as FullChat : null;
        setChannelDetails(newDetails);
        if (selectedManagingChannel && onChannelDetailsUpdatedAppLevel && newDetails) {
             onChannelDetailsUpdatedAppLevel({ ...selectedManagingChannel, fullChannelInfo: newDetails });
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
      return isAvailable;
    } catch (error: any) {
      if (error.message === 'USERNAME_PURCHASE_AVAILABLE') {
        setUsernameAvailability('unavailable'); 
        toast({ title: "Username Not Directly Available", description: `"${usernameToCheck}" is a premium/purchasable username and cannot be set directly here.`, variant: "default", duration: 6000 });
      } else {
        setUsernameAvailability('error');
        toast({ title: "Username Check Failed", description: error.message || "Could not check username.", variant: "destructive" });
      }
      return false;
    } finally {
      setIsCheckingUsername(false);
    }
  }, [toast]);

  const setChannelUsernameHook = useCallback(async (inputPeer: InputPeer, usernameToSet: string) => {
    setIsUpdatingUsername(true);
    try {
      const success = await telegramService.updateChatUsername(inputPeer, usernameToSet);
      if (success) {
        toast({ title: "Username Updated", description: `Channel username set to "${usernameToSet}". Public link: t.me/${usernameToSet}` });
        const newDetails = channelDetails ? { ...channelDetails, username: usernameToSet, exported_invite: null } as FullChat : null;
        setChannelDetails(newDetails);
        setUsernameAvailability('idle'); // Reset availability to idle or null, as it's now set
         if (selectedManagingChannel && onChannelDetailsUpdatedAppLevel && newDetails) {
             onChannelDetailsUpdatedAppLevel({ ...selectedManagingChannel, fullChannelInfo: newDetails });
        }
      } else {
        throw new Error("Server indicated failure to update username.");
      }
    } catch (error: any) {
      handleGlobalApiError(error, "Error Setting Username", error.message || "Could not set channel username.");
      setUsernameAvailability('error'); // Set to error on failure
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
        const updatedInvite = { link:link, _:"chatInviteExported"};
        const newDetails = channelDetails ? { ...channelDetails, exported_invite: updatedInvite } as FullChat : null;
        setChannelDetails(newDetails);
         if (selectedManagingChannel && onChannelDetailsUpdatedAppLevel && newDetails) {
             onChannelDetailsUpdatedAppLevel({ ...selectedManagingChannel, fullChannelInfo: newDetails});
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
            const newDetails = channelDetails ? { ...channelDetails, chat_photo: updatedPhotoInfo.photo } as FullChat : null;
            setChannelDetails(newDetails);
            if (selectedManagingChannel && onChannelDetailsUpdatedAppLevel && newDetails) {
                 onChannelDetailsUpdatedAppLevel({ ...selectedManagingChannel, fullChannelInfo: newDetails });
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
        // Re-fetch participants for the current channel
        fetchParticipants(channelInputPeer, 0);
        // Also re-fetch full channel details to update participant count in header/title
        if (selectedManagingChannel?.inputPeer && String(selectedManagingChannel.inputPeer.channel_id) === String(channelInputPeer.channel_id)) {
          fetchChannelDetails(channelInputPeer, selectedManagingChannel.name);
        }
      } else {
        throw new Error("Server indicated failure to invite user.");
      }
    } catch (error: any) {
      handleGlobalApiError(error, "Error Adding Member", error.message || "Could not add member to channel.");
    } finally {
      setIsAddingMember(null);
    }
  }, [toast, handleGlobalApiError, fetchParticipants, selectedManagingChannel, fetchChannelDetails]);

  // Effect 1: Fetch/set initial channel details
  useEffect(() => {
    if (isOpen && selectedManagingChannel) {
      const currentChannelId = selectedManagingChannel.id;
      const currentPeer = selectedManagingChannel.inputPeer;
      const currentChannelName = selectedManagingChannel.name;

      if (!channelDetails || String(channelDetails.id) !== String(currentChannelId)) {
        console.log("[AdminManager_Effect1] Dialog opened or channel changed. Resetting and loading details for:", currentChannelName);
        resetAdminManagerState();
        setIsLoadingChannelDetails(true);

        if (selectedManagingChannel.fullChannelInfo && String(selectedManagingChannel.fullChannelInfo.id) === String(currentChannelId)) {
          console.log("[AdminManager_Effect1] Using cached fullChannelInfo for:", currentChannelName);
          setChannelDetails(selectedManagingChannel.fullChannelInfo);
          setIsLoadingChannelDetails(false);
        } else if (currentPeer) {
          console.log("[AdminManager_Effect1] Fetching fresh channel details for:", currentChannelName);
          fetchChannelDetails(currentPeer, currentChannelName);
        } else {
          console.error("[AdminManager_Effect1] Cannot load channel details: Peer information is missing for:", currentChannelName);
          setIsLoadingChannelDetails(false);
          setChannelDetails(null);
          handleGlobalApiError({message: "Missing Peer"}, "Channel Load Error", "Cannot load channel details: Peer information is missing.", false);
        }
      } else {
         if (isLoadingChannelDetails) {
             console.log("[AdminManager_Effect1] Channel details already match, but was loading. Setting isLoadingChannelDetails to false.");
             setIsLoadingChannelDetails(false);
         }
      }
    } else if (!isOpen) {
      if (channelDetails) { // Only reset if there was data
        console.log("[AdminManager_Effect1] Dialog closed. Resetting state.");
        resetAdminManagerState();
      }
      if (isLoadingChannelDetails) setIsLoadingChannelDetails(false);
      if (isLoadingParticipants) setIsLoadingParticipants(false);
      if (isLoadingContacts) setIsLoadingContacts(false);
    }
  }, [isOpen, selectedManagingChannel, fetchChannelDetails, resetAdminManagerState, handleGlobalApiError, channelDetails, isLoadingChannelDetails, isLoadingParticipants, isLoadingContacts]);

  // Effect 2: Tab-specific data fetching
  useEffect(() => {
    const currentChannelInputPeer = selectedManagingChannel?.inputPeer;
    if (isOpen && currentChannelInputPeer && channelDetails && String(channelDetails.id) === String(selectedManagingChannel?.id) && !isLoadingChannelDetails) {
      console.log(`[AdminManager_Effect2] Active tab: ${activeTab}. Channel details loaded.isLoadingChannelDetails: ${isLoadingChannelDetails}`);
      if (activeTab === 'participants' && participants.length === 0 && hasMoreParticipants && !isLoadingParticipants) {
        console.log("[AdminManager_Effect2] Fetching participants for tab.");
        fetchParticipants(currentChannelInputPeer, 0);
      }
      if (activeTab === 'add-members' && !hasFetchedContactsOnce && !isLoadingContacts && !isSearchingMembers) {
        console.log("[AdminManager_Effect2] Fetching contacts for tab.");
        fetchContacts();
      }
    } else if (isOpen && !channelDetails && !isLoadingChannelDetails) {
        console.log("[AdminManager_Effect2] Tab effect: Dialog open, but no channelDetails and not loading. Tab:", activeTab);
    }
  }, [
    isOpen,
    activeTab,
    selectedManagingChannel?.id,
    selectedManagingChannel?.inputPeer,
    channelDetails, // Rely on channelDetails being set
    participants.length,
    hasMoreParticipants,
    isLoadingParticipants,
    isLoadingContacts,
    isSearchingMembers,
    hasFetchedContactsOnce,
    fetchParticipants,
    fetchContacts,
    isLoadingChannelDetails, // Added to ensure details are loaded first
  ]);

  return {
    channelDetails,
    isLoadingChannelDetails,
    isUpdatingTitle,
    isUpdatingAbout,
    isUpdatingUsername,
    isCheckingUsername,
    usernameAvailability,
    setUsernameAvailability,
    isExportingInvite,
    isUpdatingPhoto,
    participants,
    isLoadingParticipants,
    hasMoreParticipants,
    updateChannelTitle,
    updateChannelDescription,
    checkUsernameAvailability,
    setChannelUsername: setChannelUsernameHook,
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
    contactList,
    isLoadingContacts,
    fetchContacts,
  };
}

