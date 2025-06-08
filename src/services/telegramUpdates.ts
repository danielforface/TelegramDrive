
'use client';

import { telegramApiInstance } from './telegramAPI';
import { ensureChannelInCloudFolder, IDENTIFICATION_MESSAGE_ID, CONFIG_MESSAGE_ID, IDENTIFICATION_MESSAGE_PREFIX, IDENTIFICATION_MESSAGE_SUFFIX, CLOUDIFIER_APP_SIGNATURE_V1 } from './telegramCloud';
import { transformDialogToCloudFolder } from './telegramDialogs'; // Assuming transformDialogToCloudFolder is exported
import type { InputPeer, CloudFolder, CloudChannelConfigV1 } from '@/types';

let onNewCloudChannelVerifiedCallback: ((cloudFolder: CloudFolder, source: 'update' | 'initialScan') => void) | null = null;
let isTelegramUpdateListenerActive = false;

// Utility to compare InputPeer objects
function areInputPeersEqual(peer1?: InputPeer, peer2?: InputPeer): boolean {
    if (!peer1 || !peer2) return false;
    if (peer1._ !== peer2._) return false;
    switch (peer1._) {
        case 'inputPeerUser':
            return String(peer1.user_id) === String((peer2 as any).user_id); // Compare as strings
        case 'inputPeerChat':
            return String(peer1.chat_id) === String((peer2 as any).chat_id);
        case 'inputPeerChannel':
            return String(peer1.channel_id) === String((peer2 as any).channel_id);
        default:
            // Fallback for other types or if one is undefined
            return JSON.stringify(peer1) === JSON.stringify(peer2);
    }
}


async function verifyAndProcessSinglePotentialCloudChannel(
  messageInputPeer: InputPeer,
  channelObjectFromUpdate: any, // This is a Chat object from Telegram API (e.g., a channel)
  usersForTitleContext: any[] = [] // For getPeerTitle if needed
): Promise<void> {
  if (!onNewCloudChannelVerifiedCallback || !channelObjectFromUpdate || !messageInputPeer || messageInputPeer._ !== 'inputPeerChannel') {
    return;
  }

  // Ensure the inputPeer has access_hash, prefer from channelObject if available and more complete
  const definitiveInputPeer: InputPeer = {
    _: 'inputPeerChannel',
    channel_id: messageInputPeer.channel_id,
    access_hash: messageInputPeer.access_hash, // Initial access_hash
  };
  
  if (channelObjectFromUpdate && channelObjectFromUpdate._ === 'channel' && 
      channelObjectFromUpdate.id === definitiveInputPeer.channel_id && channelObjectFromUpdate.access_hash) {
      definitiveInputPeer.access_hash = channelObjectFromUpdate.access_hash; // Prefer more complete one
  }

  if (!definitiveInputPeer.access_hash) {
    // console.warn("Cannot verify channel, access_hash missing for peer:", definitiveInputPeer);
    return;
  }

  let isIdentified = false;
  let parsedConfig: CloudChannelConfigV1 | null = null;
  const channelTitleForVerification = channelObjectFromUpdate.title || `Channel ${definitiveInputPeer.channel_id}`;


  try {
    const messagesResult = await telegramApiInstance.call('channels.getMessages', {
      channel: definitiveInputPeer,
      id: [
          { _: 'inputMessageID', id: IDENTIFICATION_MESSAGE_ID },
          { _: 'inputMessageID', id: CONFIG_MESSAGE_ID }
      ],
    });

    if (messagesResult && messagesResult.messages && Array.isArray(messagesResult.messages)) {
      const idMessage = messagesResult.messages.find((m: any) => m.id === IDENTIFICATION_MESSAGE_ID && m._ === 'message');
      const configMessage = messagesResult.messages.find((m: any) => m.id === CONFIG_MESSAGE_ID && m._ === 'message');

      if (idMessage && typeof idMessage.message === 'string') {
        const expectedIdText = `${IDENTIFICATION_MESSAGE_PREFIX}${channelTitleForVerification}${IDENTIFICATION_MESSAGE_SUFFIX}`;
        if (idMessage.message === expectedIdText) {
          isIdentified = true;
        }
      }

      if (isIdentified && configMessage && typeof configMessage.message === 'string') {
        try {
          const tempConfig = JSON.parse(configMessage.message);
          if (tempConfig && tempConfig.app_signature === CLOUDIFIER_APP_SIGNATURE_V1) {
            parsedConfig = tempConfig as CloudChannelConfigV1;
          }
        } catch (parseError) { /* console.error("Error parsing config in update:", parseError); */ }
      }
    }
  } catch (error) {
    // console.debug(`Error verifying channel ${channelTitleForVerification} via getMessages:`, error);
    return; // Cannot verify, so exit
  }

  if (isIdentified && parsedConfig) {
    // Need to construct a "dialog-like" object to pass to transformDialogToCloudFolder
    const mockDialog = {
      peer: { // This structure matches what transformDialogToCloudFolder expects from a dialog's peer
        _: 'peerChannel',
        channel_id: definitiveInputPeer.channel_id,
        // access_hash is not directly on dialog.peer, it's on the chat/channel object
      },
      // Other dialog fields like top_message, unread_count are not critical here
    };
    
    const cloudFolder = transformDialogToCloudFolder(
        mockDialog,
        [channelObjectFromUpdate], // Pass the channel object as the "chats" array
        usersForTitleContext,      // Pass any relevant users
        true,                      // isAppManagedCloud
        parsedConfig
    );

    if (cloudFolder) {
      onNewCloudChannelVerifiedCallback(cloudFolder, 'update'); // 'update' because it's from a live event
      await ensureChannelInCloudFolder(definitiveInputPeer, channelTitleForVerification);
    }
  }
}

async function handleTelegramUpdate(updateInfo: any): Promise<void> {
  if (!updateInfo || !onNewCloudChannelVerifiedCallback) return;

  const updatesToProcess: any[] = [];
  const chatsFromUpdate = updateInfo.chats || []; // Chats array from the top-level update object
  const usersFromUpdate = updateInfo.users || []; // Users array

  if (updateInfo._ === 'updatesCombined' || updateInfo._ === 'updates') {
    if (Array.isArray(updateInfo.updates)) {
      updatesToProcess.push(...updateInfo.updates);
    }
     // Merge chats/users from combined update if they exist
     if (Array.isArray(updateInfo.chats)) chatsFromUpdate.push(...updateInfo.chats.filter((c:any) => !chatsFromUpdate.some((existing:any) => existing.id === c.id)));
     if (Array.isArray(updateInfo.users)) usersFromUpdate.push(...updateInfo.users.filter((u:any) => !usersFromUpdate.some((existing:any) => existing.id === u.id)));

  } else {
    updatesToProcess.push(updateInfo); // Single update object
  }

  for (const update of updatesToProcess) {
    let channelEntityFromUpdate: any = null; // This will be the full Channel object
    let peerFromMessageEvent: InputPeer | null = null;

    // Check for new messages in channels that might be our special messages
    if (update._ === 'updateNewChannelMessage' && update.message) {
      const message = update.message;
      // We are interested if ID=2 (identification) or ID=3 (config) is created or EDITED
      if (message.id === IDENTIFICATION_MESSAGE_ID || message.id === CONFIG_MESSAGE_ID) {
        const channelIdFromMessage = message.peer_id?.channel_id || message.to_id?.channel_id; // Correct way to get channel_id from message
        if (channelIdFromMessage) {
          // Find the full channel object from the 'chats' array in the parent updateInfo
          channelEntityFromUpdate = chatsFromUpdate.find((c:any) => String(c.id) === String(channelIdFromMessage));
          peerFromMessageEvent = channelEntityFromUpdate ? {
            _: 'inputPeerChannel',
            channel_id: channelEntityFromUpdate.id,
            access_hash: channelEntityFromUpdate.access_hash, // Crucial for API calls
          } : null;
        }
      }
    } 
    // Also check if the user joined a new channel or a channel's info was updated
    // as it might be a cloud channel they were added to or one whose config was just set up.
    else if (update._ === 'updateChatParticipantAdd' || update._ === 'updateChannel') {
        // updateChannel might contain the channel_id directly or within update.channel
        const channelId = update.channel_id || (update.channel ? update.channel.id : null) || (update.chat ? update.chat.id : null);
        if (channelId) {
            channelEntityFromUpdate = chatsFromUpdate.find((c: any) => String(c.id) === String(channelId));
             peerFromMessageEvent = channelEntityFromUpdate && channelEntityFromUpdate._ === 'channel' && channelEntityFromUpdate.access_hash !== undefined ? {
                _: 'inputPeerChannel',
                channel_id: channelEntityFromUpdate.id,
                access_hash: channelEntityFromUpdate.access_hash
            } : null;
        }
    }
    // Could also handle updateMessageID for when messages are deleted/edited,
    // especially if CONFIG_MESSAGE_ID is edited.

    if (channelEntityFromUpdate && peerFromMessageEvent && peerFromMessageEvent.access_hash) {
      // console.log("Update involves channel, attempting verification:", channelEntityFromUpdate.title);
      await verifyAndProcessSinglePotentialCloudChannel(peerFromMessageEvent, channelEntityFromUpdate, usersFromUpdate);
    }
  }
}


export function initializeTelegramUpdateListener(callback: (cloudFolder: CloudFolder, source: 'update' | 'initialScan') => void): void {
  if (!telegramApiInstance || !telegramApiInstance.getMTProto() || !telegramApiInstance.getMTProto().updates || isTelegramUpdateListenerActive) {
    if (isTelegramUpdateListenerActive) {
        // console.warn("Telegram update listener already active.");
    } else {
        // console.error("Cannot initialize Telegram update listener: MTProto client not ready.");
    }
    return;
  }
  onNewCloudChannelVerifiedCallback = callback;
  // Listen to generic 'updates' which covers most things including new messages, channel updates
  telegramApiInstance.getMTProto().updates.on('updates', handleTelegramUpdate);
  telegramApiInstance.getMTProto().updates.on('updatesCombined', handleTelegramUpdate); // For combined updates
  // console.log("Telegram update listener initialized.");
  isTelegramUpdateListenerActive = true;
}
