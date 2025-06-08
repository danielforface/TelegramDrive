
"use client";

import { useState, useCallback, useEffect, useRef } from 'react';
import type { InputPeer, FullChat, ChannelParticipant, ChannelParticipantsResponse, CloudFolder, UpdatedChannelPhoto, CloudChannelConfigV1 } from '@/types';
import * as telegramService from '@/services/telegramService'; // Corrected import
import type { useToast } from "@/hooks/use-toast";

export type UsernameAvailabilityStatus = 'idle' | 'checking' | 'available' | 'unavailable' | 'error' | null;

interface UseChannelAdminManagerProps {
  toast: ReturnType<typeof useToast>['toast'];
  handleGlobalApiError: (error: any, title: string, defaultMessage: string, doPageReset?: boolean) => void;
  selectedManagingChannel: CloudFolder | null;
  onChannelDetailsUpdatedAppLevel: (updatedFolder: CloudFolder) => void; // Callback to inform page.tsx
  isOpen: boolean; // To trigger re-fetches when dialog opens
  activeTab: string; // To fetch tab-specific data
}

const MAX_PARTICIPANTS_PER_FETCH = 100;

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
  const [isCheckingUsername, setIsCheckingUsername] = useState(false);
  const [usernameAvailability, setUsernameAvailability] = useState<UsernameAvailabilityStatus>('idle');
  const [isUpdatingUsername, setIsUpdatingUsername] = useState(false);
  const [isExportingInvite, setIsExportingInvite] = useState(false);

  const [participants, setParticipants] = useState<ChannelParticipant[]>([]);
  const [isLoadingParticipants, setIsLoadingParticipants] = useState(false);
  const [hasMoreParticipants, setHasMoreParticipants] = useState(true);
  const [participantOffset, setParticipantOffset] = useState(0); // For fetching participants by offset

  const [contactList, setContactList] = useState<any[]>([]);
  const [isLoadingContacts, setIsLoadingContacts] = useState(false);
  const [hasFetchedContactsOnce, setHasFetchedContactsOnce] = useState(false);
  const [memberSearchTerm, setMemberSearchTerm] = useState('');
  const [memberSearchResults, setMemberSearchResults] = useState<any[]>([]);
  const [isSearchingMembers, setIsSearchingMembers] = useState(false);
  const [isAddingMember, setIsAddingMember] = useState<string | null>(null); // Store user ID being added

  // Refs to track previous state for effects
  const prevIsOpenRef = useRef(isOpen);
  const prevSelectedChannelIdRef = useRef<string | null>(selectedManagingChannel?.id || null);


  const resetAdminManagerState = useCallback(() => {
    console.log("[AdminManager_ResetState] Resetting admin manager state.");
    setChannelDetails(null);
    setIsLoadingChannelDetails(false);
    setIsUpdatingTitle(false);
    setIsUpdatingAbout(false);
    setIsUpdatingPhoto(false);
    setIsCheckingUsername(false);
    setUsernameAvailability('idle');
    setIsUpdatingUsername(false);
    setIsExportingInvite(false);
    setParticipants([]);
    setIsLoadingParticipants(false);
    setHasMoreParticipants(true);
    setParticipantOffset(0);
    // setContactList([]); // Do not reset contactList on every channel change unless necessary
    // setIsLoadingContacts(false); // Managed by its own fetch cycle
    // setHasFetchedContactsOnce(false); // Only reset if contacts are truly global and need refresh per dialog instance
    setMemberSearchTerm('');
    setMemberSearchResults([]);
    setIsSearchingMembers(false);
    setIsAddingMember(null);
  }, []);

  const fetchChannelDetails = useCallback(async (channelToFetch: CloudFolder) => {
    if (!channelToFetch || !channelToFetch.inputPeer) {
      handleGlobalApiError({ message: "InputPeer missing for channel details." }, "Load Error", "Cannot load channel details.");
      setIsLoadingChannelDetails(false);
      setChannelDetails(null);
      return;
    }
    console.log("[AdminManager_FetchChannelDetails] Fetching details for:", channelToFetch.name);
    setIsLoadingChannelDetails(true);
    try {
      const fullInfo = await telegramService.getChannelFullInfo(channelToFetch.inputPeer);
      if (fullInfo) {
        setChannelDetails(fullInfo);
        // Update parent immediately with potentially more complete info
        onChannelDetailsUpdatedAppLevel({ ...channelToFetch, fullChannelInfo: fullInfo });
      } else {
        setChannelDetails(null);
        throw new Error("No channel details returned from API.");
      }
    } catch (error) {
      handleGlobalApiError(error, "Error Loading Channel Details", "Could not fetch full channel information.");
      setChannelDetails(null);
    } finally {
      setIsLoadingChannelDetails(false);
    }
  }, [handleGlobalApiError, onChannelDetailsUpdatedAppLevel]);

  const fetchParticipants = useCallback(async (peer: InputPeer, offset: number = 0) => {
    if (isLoadingParticipants && offset > 0) return; // Don't load more if already loading
    console.log("[AdminManager_FetchParticipants] Fetching participants for:", peer, "Offset:", offset);
    setIsLoadingParticipants(true);
    try {
      const result = await telegramApiInstance.call('channels.getParticipants', {
        channel: peer,
        filter: { _: 'channelParticipantsRecent' }, // Or other filters as needed
        offset: offset,
        limit: MAX_PARTICIPANTS_PER_FETCH,
        hash: 0,
      });

      if (result && result.participants) {
        const newParticipants = (result.participants as any[]).map(p => {
            const userDetail = result.users?.find((u:any) => String(u.id) === String(p.user_id || p.userId || p.participant?.user_id || p.participant?.userId));
            return { ...p, user: userDetail || null };
        });

        setParticipants(prev => offset === 0 ? newParticipants : [...prev, ...newParticipants]);
        setParticipantOffset(offset + newParticipants.length);
        setHasMoreParticipants(newParticipants.length === MAX_PARTICIPANTS_PER_FETCH && result.count > offset + newParticipants.length);
      } else {
        setHasMoreParticipants(false);
      }
    } catch (error) {
      handleGlobalApiError(error, "Error Fetching Participants", "Could not load channel members.");
      setHasMoreParticipants(false);
    } finally {
      setIsLoadingParticipants(false);
    }
  }, [handleGlobalApiError, isLoadingParticipants]); // Removed participants from deps

  const fetchContacts = useCallback(async () => {
    if (isLoadingContacts) return;
    console.log("[AdminManager_FetchContacts] Initiating contact fetch...");
    setIsLoadingContacts(true);
    try {
      const contactsData = await telegramService.getContacts();
      console.log("[AdminManager_FetchContacts] Received contactsData:", contactsData);
      setContactList(contactsData || []);
      setHasFetchedContactsOnce(true);
      console.log("[AdminManager_FetchContacts] Contacts fetched and set. Count:", contactsData?.length || 0);
    } catch (error: any) {
      handleGlobalApiError(error, "Error Fetching Contacts", "Could not load your contact list.");
      setContactList([]);
      setHasFetchedContactsOnce(true); // Mark as fetched even on error to avoid loops
    } finally {
      setIsLoadingContacts(false);
    }
  }, [handleGlobalApiError, isLoadingContacts]);


  // Effect 1: Handle dialog opening/closing and selected channel changes for main details
  useEffect(() => {
    console.log("[AdminManager_Effect1] Checking conditions. isOpen:", isOpen, "Selected Channel ID:", selectedManagingChannel?.id);
    if (isOpen && selectedManagingChannel) {
      const currentChannelId = selectedManagingChannel.id;
      // Only reset and fetch if dialog just opened OR a different channel is selected
      if (!prevIsOpenRef.current || prevSelectedChannelIdRef.current !== currentChannelId) {
        console.log("[AdminManager_Effect1] Dialog opened or channel changed. Resetting and loading details for:", selectedManagingChannel.name);
        resetAdminManagerState(); // Clear previous state
        setIsLoadingChannelDetails(true); // Set loading before any operation

        if (selectedManagingChannel.fullChannelInfo && String(selectedManagingChannel.fullChannelInfo.id) === String(selectedManagingChannel.id.replace('channel-',''))) {
          console.log("[AdminManager_Effect1] Using cached fullChannelInfo for:", selectedManagingChannel.name);
          setChannelDetails(selectedManagingChannel.fullChannelInfo);
          setIsLoadingChannelDetails(false);
        } else {
          console.log("[AdminManager_Effect1] Fetching fresh channel details for:", selectedManagingChannel.name);
          fetchChannelDetails(selectedManagingChannel);
        }
      }
    } else if (!isOpen && prevIsOpenRef.current) {
      console.log("[AdminManager_Effect1] Dialog closed. Resetting state.");
      resetAdminManagerState();
    }
    prevIsOpenRef.current = isOpen;
    prevSelectedChannelIdRef.current = selectedManagingChannel?.id || null;
  }, [isOpen, selectedManagingChannel, fetchChannelDetails, resetAdminManagerState, handleGlobalApiError]);


  // Effect 2: Fetch tab-specific data when the tab or channelDetails change
  useEffect(() => {
    console.log("[AdminManager_Effect2] Tab effect. Tab:", activeTab, "Channel Details Loaded:", !!channelDetails, "isLoadingDetails:", isLoadingChannelDetails);
    if (!isOpen || !channelDetails || isLoadingChannelDetails) {
        if (isOpen && !channelDetails && !isLoadingChannelDetails) {
            console.log("[AdminManager_Effect2] Tab effect: Dialog open, but no channelDetails and not loading. Tab:", activeTab);
        }
        return;
    }

    const peer = selectedManagingChannel?.inputPeer;
    if (!peer) return;

    if (activeTab === "participants" && participants.length === 0 && hasMoreParticipants && !isLoadingParticipants) {
      console.log("[AdminManager_Effect2] Fetching initial participants for tab:", activeTab);
      fetchParticipants(peer, 0);
    } else if (activeTab === "add-members" && !hasFetchedContactsOnce && !isLoadingContacts && !isSearchingMembers) {
      console.log("[AdminManager_Effect2] Fetching initial contacts for tab:", activeTab);
      fetchContacts();
    }
  }, [
    isOpen,
    activeTab,
    channelDetails, // Depends on main details being loaded
    isLoadingChannelDetails,
    selectedManagingChannel,
    participants.length,
    hasMoreParticipants,
    isLoadingParticipants,
    fetchParticipants,
    contactList.length, // Re-evaluate if contact list becomes empty
    isLoadingContacts,
    hasFetchedContactsOnce,
    isSearchingMembers,
    fetchContacts,
  ]);

  const updateChannelTitle = async (peer: InputPeer, newTitle: string) => {
    setIsUpdatingTitle(true);
    try {
      const success = await telegramService.editChannelTitle(peer, newTitle);
      if (success) {
        toast({ title: "Title Updated", description: `Channel title changed to "${newTitle}".` });
        // Fetch the latest full details to update UI and potentially config
        if (selectedManagingChannel) {
          const currentConfig = await telegramService.getCloudChannelConfig(peer);
          if (currentConfig && currentConfig.app_signature === telegramService.CLOUDIFIER_APP_SIGNATURE_V1) {
            currentConfig.channel_title_at_creation = newTitle; // Or use a 'current_title' field
            currentConfig.last_updated_timestamp_utc = new Date().toISOString();
            try {
              await telegramService.updateCloudChannelConfig(peer, currentConfig);
              toast({ title: "Config Updated", description: "Channel title in VFS config also updated." });
            } catch (configError: any) {
              toast({ title: "Config Update Failed", description: `Could not update VFS config: ${configError.message}`, variant: "destructive" });
            }
          }
          // Update local and parent state
          setChannelDetails(prev => prev ? { ...prev, title: newTitle } as FullChat : null);
          onChannelDetailsUpdatedAppLevel({
            ...selectedManagingChannel,
            name: newTitle, // Update name on the CloudFolder object
            fullChannelInfo: channelDetails ? { ...channelDetails, title: newTitle } as FullChat : undefined,
            cloudConfig: currentConfig // Pass updated config if available
          });

        }
      } else {
        throw new Error("Telegram API did not confirm title update.");
      }
    } catch (error) {
      handleGlobalApiError(error, "Error Updating Title", "Could not update channel title.");
    } finally {
      setIsUpdatingTitle(false);
    }
  };

  const updateChannelDescription = async (peer: InputPeer, newDescription: string) => {
    setIsUpdatingAbout(true);
    try {
      const success = await telegramService.updateChannelAbout(peer, newDescription);
      if (success) {
        toast({ title: "Description Updated", description: "Channel description has been saved." });
        setChannelDetails(prev => prev ? { ...prev, about: newDescription } as FullChat : null);
        if (selectedManagingChannel) {
            onChannelDetailsUpdatedAppLevel({
                ...selectedManagingChannel,
                fullChannelInfo: channelDetails ? { ...channelDetails, about: newDescription } as FullChat : undefined
            });
        }
      } else {
        throw new Error("Telegram API did not confirm description update.");
      }
    } catch (error) {
      handleGlobalApiError(error, "Error Updating Description", "Could not update channel description.");
    } finally {
      setIsUpdatingAbout(false);
    }
  };

  const updateChannelPhoto = async (peer: InputPeer, photoFile: File) => {
    setIsUpdatingPhoto(true);
    try {
      const inputFile = await telegramService.uploadFileToServerForPhoto(photoFile, (progress) => {
        // console.log(`Photo upload progress: ${progress}%`); // Optional progress update
      });
      
      const inputChatPhoto: any = { _: 'inputChatUploadedPhoto', file: inputFile };

      const updateResult = await telegramService.updateChannelPhotoService(peer, inputChatPhoto);
      toast({ title: "Photo Updated", description: "Channel photo has been changed." });
      
      // Update local state. updateResult might contain the new photo object
      if (updateResult?.photo) {
          setChannelDetails(prev => prev ? { ...prev, chat_photo: updateResult.photo } as FullChat : null);
           if (selectedManagingChannel) {
                onChannelDetailsUpdatedAppLevel({
                    ...selectedManagingChannel,
                    fullChannelInfo: channelDetails ? { ...channelDetails, chat_photo: updateResult.photo } as FullChat : undefined
                });
            }
      } else {
          // If updateResult is null but successful, refetch details to get the photo
          if (selectedManagingChannel) fetchChannelDetails(selectedManagingChannel);
      }

    } catch (error) {
      handleGlobalApiError(error, "Error Updating Photo", "Could not update channel photo.");
    } finally {
      setIsUpdatingPhoto(false);
    }
  };

  const checkUsernameAvailability = async (peer: InputPeer, username: string) => {
    if (!username || username.length < 5) {
      setUsernameAvailability('unavailable'); // Or 'too_short' if you want a specific state
      return;
    }
    setIsCheckingUsername(true);
    setUsernameAvailability('checking');
    try {
      await telegramService.checkChatUsername(peer, username);
      setUsernameAvailability('available');
    } catch (error: any) {
      if (error.message === 'USERNAME_INVALID' || error.message === 'USERNAME_OCCUPIED') {
        setUsernameAvailability('unavailable');
      } else if (error.message === 'USERNAME_PURCHASE_AVAILABLE') {
        setUsernameAvailability('unavailable'); // Treat as unavailable for setting via this UI
        toast({title: "Username Not Available", description: "This username is premium or purchasable and cannot be set this way.", variant: "default", duration: 6000});
      } else {
        setUsernameAvailability('error');
        // Do not toast for general errors here, let input UI show 'error'
      }
    } finally {
      setIsCheckingUsername(false);
    }
  };

  const setChannelUsername = async (peer: InputPeer, username: string) => {
    setIsUpdatingUsername(true);
    try {
      const success = await telegramService.updateChatUsername(peer, username);
      if (success) {
        toast({ title: "Username Set!", description: `Public link is now t.me/${username}` });
        setChannelDetails(prev => prev ? { ...prev, username: username, exported_invite: null } as FullChat : null); // Username change might invalidate old invite
        if (selectedManagingChannel) {
            onChannelDetailsUpdatedAppLevel({
                ...selectedManagingChannel,
                fullChannelInfo: channelDetails ? { ...channelDetails, username: username, exported_invite: null } as FullChat : undefined
            });
        }
        setUsernameAvailability('idle'); // Reset after successful set
      } else {
        throw new Error("Telegram API did not confirm username update.");
      }
    } catch (error) {
      handleGlobalApiError(error, "Error Setting Username", "Could not set public username.");
      setUsernameAvailability('error'); // Or re-check
    } finally {
      setIsUpdatingUsername(false);
    }
  };

  const generateInviteLink = async (peer: InputPeer) => {
    setIsExportingInvite(true);
    try {
      const link = await telegramService.exportChannelInviteLink(peer);
      if (link) {
        toast({ title: "Invite Link Generated", description: `New link: ${link}` });
        setChannelDetails(prev => prev ? { ...prev, exported_invite: { _: 'chatInviteExported', link: link } } as FullChat : null);
        if (selectedManagingChannel) {
            onChannelDetailsUpdatedAppLevel({
                ...selectedManagingChannel,
                fullChannelInfo: channelDetails ? { ...channelDetails, exported_invite: { _: 'chatInviteExported', link: link } } as FullChat : undefined
            });
        }
      } else {
        throw new Error("Telegram API did not return an invite link.");
      }
    } catch (error) {
      handleGlobalApiError(error, "Error Generating Invite Link", "Could not generate a new private invite link.");
    } finally {
      setIsExportingInvite(false);
    }
  };

  const handleSearchMembers = async () => {
    if (!memberSearchTerm.trim()) {
      setMemberSearchResults([]);
      return;
    }
    setIsSearchingMembers(true);
    try {
      const users = await telegramService.searchUsers(memberSearchTerm);
      setMemberSearchResults(users);
    } catch (error) {
      handleGlobalApiError(error, "Error Searching Users", "Could not perform user search.");
      setMemberSearchResults([]);
    } finally {
      setIsSearchingMembers(false);
    }
  };

  const handleAddMemberToChannel = async (channelPeer: InputPeer, userToAdd: any) => {
    if (!userToAdd || !userToAdd.id) return;
    setIsAddingMember(String(userToAdd.id));
    try {
      const userPeer: InputPeer = { _: 'inputPeerUser', user_id: userToAdd.id, access_hash: userToAdd.access_hash };
      const success = await telegramService.inviteUserToChannel(channelPeer, userPeer);
      if (success) {
        toast({ title: "Member Added", description: `${userToAdd.first_name || 'User'} has been invited/added.` });
        // Optionally, re-fetch participants or update count
        if(selectedManagingChannel) fetchChannelDetails(selectedManagingChannel);
        setMemberSearchTerm(''); // Clear search after adding
        setMemberSearchResults([]);
      } else {
        throw new Error("Failed to add member, API did not confirm.");
      }
    } catch (error: any) {
      if (error.message?.includes('USER_ALREADY_PARTICIPANT')) {
         toast({ title: "Already Member", description: `${userToAdd.first_name || 'User'} is already in this channel.`, variant: "default" });
      } else if (error.message?.includes('USERS_TOO_MUCH')) {
        toast({ title: "Limit Reached", description: "Too many users in the channel or invite list.", variant: "destructive" });
      } else if (error.message?.includes('USER_NOT_MUTUAL_CONTACT') || error.message?.includes('PEER_FLOOD')) {
        toast({ title: "Cannot Add User", description: `Could not add ${userToAdd.first_name || 'User'}. They may have privacy settings restricting this, or you might be temporarily rate-limited.`, variant: "destructive", duration: 7000 });
      }
      else {
        handleGlobalApiError(error, "Error Adding Member", `Could not add ${userToAdd.first_name || 'User'} to the channel.`);
      }
    } finally {
      setIsAddingMember(null);
    }
  };


  return {
    channelDetails,
    isLoadingChannelDetails,
    isUpdatingTitle,
    isUpdatingAbout,
    isUpdatingPhoto,
    isCheckingUsername,
    usernameAvailability,
    setUsernameAvailability, // Expose for direct reset from dialog if needed on input change
    isUpdatingUsername,
    isExportingInvite,
    participants,
    isLoadingParticipants,
    hasMoreParticipants,
    fetchParticipants: (peer: InputPeer) => fetchParticipants(peer, participantOffset), // Pass current offset
    contactList,
    isLoadingContacts,
    memberSearchTerm,
    setMemberSearchTerm,
    memberSearchResults,
    isSearchingMembers,
    handleSearchMembers,
    isAddingMember,
    handleAddMemberToChannel,
    // Actions
    updateChannelTitle,
    updateChannelDescription,
    updateChannelPhoto,
    checkUsernameAvailability,
    setChannelUsername,
    generateInviteLink,
    fetchChannelDetails, // Expose if manual refresh from dialog is ever needed for main details
  };
}

