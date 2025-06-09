
'use client';

import { telegramApiInstance, sleep } from './telegramAPI';
import { isUserConnected, getUserSessionDetails } from './telegramAuth';
import { getDialogFilters, transformDialogToCloudFolder, ALL_CHATS_FILTER_ID } from './telegramDialogs';
import type { InputPeer, CloudChannelConfigV1, CloudChannelType, CloudChannelConfigEntry, CloudFolder, FullChat, UpdatedChannelPhoto } from '@/types';
import { UPLOAD_PART_SIZE, TEN_MB, uploadFile } from './telegramFiles'; // Import for reusing upload logic if needed

export const CLOUDIFIER_APP_SIGNATURE_V1 = "TELEGRAM_CLOUDIFIER_V1.0";
export const IDENTIFICATION_MESSAGE_ID = 2;
export const CONFIG_MESSAGE_ID = 3;
export const IDENTIFICATION_MESSAGE_PREFIX = "Initializing Cloud Storage: ";
export const IDENTIFICATION_MESSAGE_SUFFIX = "... This message ensures the configuration message ID is stable.";

const CLOUDIFIER_MANAGED_FOLDER_ID = 20001;
const CLOUDIFIER_MANAGED_FOLDER_NAME = "Cloudifier Storage";
export const GLOBAL_DRIVE_CONFIG_FILENAME = "telegram_cloudifier_global_drive_config_v1.json";
export const GLOBAL_DRIVE_CONFIG_CAPTION_KEY = "app_feature";
export const GLOBAL_DRIVE_CONFIG_CAPTION_VALUE = "telegram_cloudifier_global_drive_config_v1";

function generateRandomLong(): string {
  const buffer = new Uint8Array(8);
  crypto.getRandomValues(buffer);
  const view = new DataView(buffer.buffer);
  return view.getBigInt64(0, true).toString();
}

export async function getSelfInputPeer(): Promise<InputPeer | null> {
  if (!(await isUserConnected())) return null;
  try {
    // Fetching self user to ensure access_hash is up-to-date if needed,
    // though 'inputPeerSelf' doesn't require access_hash.
    const selfUser = await telegramApiInstance.call('users.getUsers', { id: [{ _: 'inputUserSelf' }] });
    if (selfUser && selfUser.length > 0) {
      return { _: 'inputPeerSelf' };
    }
    return null;
  } catch (error) {
    // console.error("Error getting self input peer:", error);
    return null;
  }
}

export async function searchSelfMessagesByCaption(
  captionKey: string,
  captionValue: string
): Promise<any | null> { // Returns the message object if found
  const selfPeer = await getSelfInputPeer();
  if (!selfPeer) return null;

  try {
    // Fetch a reasonable number of recent messages from Saved Messages
    // Telegram search by caption isn't a direct API feature, so we filter client-side or rely on broad search.
    // Using messages.search with inputPeerSelf
    const searchResults = await telegramApiInstance.call('messages.search', {
      peer: selfPeer,
      q: '', // Empty query, relying on filter or manual check
      filter: { _: 'inputMessagesFilterPinned' }, // Check pinned messages first
      min_date: 0,
      max_date: 0,
      offset_id: 0,
      add_offset: 0,
      limit: 10, // Check last 10 pinned
      max_id: 0,
      min_id: 0,
      hash: 0,
    });
    
    if (searchResults && searchResults.messages) {
      for (const message of searchResults.messages) {
        if (message.message) { // Caption is in message.message for documents
          try {
            const parsedCaption = JSON.parse(message.message);
            if (parsedCaption && parsedCaption[captionKey] === captionValue) {
              return message; // Found the config message
            }
          } catch (e) { /* ignore messages with non-JSON captions */ }
        }
      }
    }
    // If not found in pinned, could extend to search more messages, but that's less efficient.
    // For now, relying on it being pinned.
  } catch (error) {
    // console.error("Error searching self messages:", error);
  }
  return null;
}

export async function uploadTextAsFileToSelfChat(
  fileName: string,
  textContent: string,
  mimeType: string,
  captionJson: object
): Promise<any | null> { // Returns the sent message object
  const selfPeer = await getSelfInputPeer();
  if (!selfPeer) throw new Error("Could not get self peer to upload file.");

  const fileData = new TextEncoder().encode(textContent);
  const blob = new Blob([fileData], { type: mimeType });
  const file = new File([blob], fileName, { type: mimeType });

  const captionString = JSON.stringify(captionJson);

  // Use the existing uploadFile service
  try {
    const sentMessageContainer = await uploadFile(selfPeer, file, (progress) => {
      // console.log(`Uploading ${fileName} to self chat: ${progress}%`);
    }, undefined /* no signal */, captionString);
    
    // The structure of sentMessageContainer can vary.
    // Often it's an 'updates' object containing the message.
    if (sentMessageContainer && (sentMessageContainer._ === 'updates' || sentMessageContainer._ === 'updatesCombined')) {
        const updatesArray = sentMessageContainer.updates || [];
        for (const update of updatesArray) {
            if (update._ === 'updateNewMessage' || update._ === 'updateNewChannelMessage' || update._ === 'updateShortSentMessage') {
                if (update.message && update.message.media && update.message.media.document && update.message.media.document.attributes) {
                    const fnAttr = update.message.media.document.attributes.find((a:any) => a._ === 'documentAttributeFilename');
                    if (fnAttr && fnAttr.file_name === fileName && update.message.message === captionString) {
                        return update.message;
                    }
                }
            }
        }
    } else if (sentMessageContainer && sentMessageContainer.media && sentMessageContainer.media.document) { // Simpler response
        return sentMessageContainer;
    }
    // console.warn("Could not confirm exact sent message object after upload:", sentMessageContainer);
    // Fallback: try to fetch the last message sent to self chat if specific object not found (less reliable)
    const history = await telegramApiInstance.call('messages.getHistory', { peer: selfPeer, limit: 1, offset_id: 0, offset_date: 0, add_offset: 0, max_id: 0, min_id: 0, hash: 0 });
    if (history && history.messages && history.messages.length > 0) {
        const lastMsg = history.messages[0];
         if (lastMsg.media && lastMsg.media.document && lastMsg.media.document.attributes) {
            const fnAttr = lastMsg.media.document.attributes.find((a:any) => a._ === 'documentAttributeFilename');
            if (fnAttr && fnAttr.file_name === fileName && lastMsg.message === captionString) {
                return lastMsg;
            }
        }
    }
    return null; // Or throw error if critical
  } catch (error) {
    // console.error(`Error uploading ${fileName} to self chat:`, error);
    throw error;
  }
}

export async function pinSelfChatMessage(messageId: number, silent: boolean = true): Promise<boolean> {
  const selfPeer = await getSelfInputPeer();
  if (!selfPeer) return false;
  try {
    const result = await telegramApiInstance.call('messages.updatePinnedMessage', {
      silent: silent,
      unpin: false, // Explicitly false to pin
      peer: selfPeer,
      id: messageId,
    });
    return result && (result._ === 'updates' || result._ === 'updatesCombined');
  } catch (error) {
    // console.error("Error pinning self chat message:", error);
    return false;
  }
}

export async function unpinAllSelfChatMessages(): Promise<boolean> {
  const selfPeer = await getSelfInputPeer();
  if (!selfPeer) return false;
  try {
    const result = await telegramApiInstance.call('messages.unpinAllMessages', {
      peer: selfPeer,
    });
    // messages.affectedHistory seems to be the success response
    return result && result._ === 'messages.affectedHistory';
  } catch (error) {
    // console.error("Error unpinning all self chat messages:", error);
    // It might fail if nothing is pinned, which is fine.
    if ((error as any).message?.includes('PINNED_DIALOGS_TOO_MUCH') || (error as any).message?.includes('MESSAGE_NOT_MODIFIED')) {
        return true; // Treat as success if there was nothing to unpin or already unpinned.
    }
    return false;
  }
}


export async function getCloudChannelConfig(channelInputPeer: InputPeer): Promise<CloudChannelConfigV1 | null> {
  if (!channelInputPeer || channelInputPeer._ !== 'inputPeerChannel') return null;
  try {
    const configMessagesResult = await telegramApiInstance.call('channels.getMessages', {
      channel: channelInputPeer,
      id: [{ _: 'inputMessageID', id: CONFIG_MESSAGE_ID }],
    });

    if (configMessagesResult && configMessagesResult.messages && Array.isArray(configMessagesResult.messages)) {
      const configMessage = configMessagesResult.messages.find((m:any) => m.id === CONFIG_MESSAGE_ID && m._ === 'message');
      if (configMessage && typeof configMessage.message === 'string' && configMessage.message.trim() !== '') {
        try {
          const tempConfig = JSON.parse(configMessage.message);
          if (tempConfig && tempConfig.app_signature === CLOUDIFIER_APP_SIGNATURE_V1) {
            return tempConfig as CloudChannelConfigV1;
          }
        } catch (parseError) {
          // console.error("Error parsing config message:", parseError, configMessage.message);
          return null;
        }
      }
    }
  } catch (error: any) {
    // console.error(`Error fetching config for channel ${channelInputPeer.channel_id}:`, error);
  }
  return null;
}

export async function updateCloudChannelConfig(channelInputPeer: InputPeer, newConfig: CloudChannelConfigV1): Promise<boolean> {
  try {
    const newConfigJson = JSON.stringify(newConfig, null, 2);
    if (new TextEncoder().encode(newConfigJson).length >= 4000) {
      throw new Error("Updated configuration message is too large.");
    }
    const result = await telegramApiInstance.call('messages.editMessage', {
      peer: channelInputPeer,
      id: CONFIG_MESSAGE_ID,
      message: newConfigJson,
      no_webpage: true,
    });
    return !!result;
  } catch (error: any) {
    // console.error(`Error updating config for channel ${channelInputPeer.channel_id}:`, error);
    throw error; // Re-throw to allow specific handling in hook
  }
}

export async function ensureChannelInCloudFolder(channelInputPeer: InputPeer, channelTitleForLog: string, isNewChannelCreation: boolean = false): Promise<boolean> {
  if (!channelInputPeer || channelInputPeer._ !== 'inputPeerChannel') return false;

  try {
    const existingFilters = await getDialogFilters();
    let cloudifierFolder = existingFilters.find(f => f.id === CLOUDIFIER_MANAGED_FOLDER_ID);
    let updateNeeded = false;
    const includePeersFlag = (1 << 10);
    const broadcastsFlag = (1 << 4);

    if (cloudifierFolder) {
      if (cloudifierFolder.title !== CLOUDIFIER_MANAGED_FOLDER_NAME) {
        cloudifierFolder.title = CLOUDIFIER_MANAGED_FOLDER_NAME;
        updateNeeded = true;
      }
      if (cloudifierFolder.include_peers === undefined) {
        cloudifierFolder.include_peers = [];
      }
      if (!cloudifierFolder.include_peers.some(p =>
          p._ === 'inputPeerChannel' && String(p.channel_id) === String(channelInputPeer.channel_id)
      )) {
        cloudifierFolder.include_peers.push(channelInputPeer);
        updateNeeded = true;
      }
      cloudifierFolder.include_peers = cloudifierFolder.include_peers.filter(p => p._ === 'inputPeerChannel');

      if (cloudifierFolder.include_peers.length > 0 && !(cloudifierFolder.flags & includePeersFlag)) {
          cloudifierFolder.flags |= includePeersFlag;
          updateNeeded = true;
      } else if (cloudifierFolder.include_peers.length === 0 && (cloudifierFolder.flags & includePeersFlag)) {
           cloudifierFolder.flags &= ~includePeersFlag;
           updateNeeded = true;
      }
      if (!(cloudifierFolder.flags & broadcastsFlag)) {
          cloudifierFolder.flags |= broadcastsFlag;
          updateNeeded = true;
      }

      if (updateNeeded) {
        await telegramApiInstance.call('messages.updateDialogFilter', { id: CLOUDIFIER_MANAGED_FOLDER_ID, filter: cloudifierFolder });
      }
    } else {
      const newFilter: DialogFilter = {
        _: 'dialogFilter',
        id: CLOUDIFIER_MANAGED_FOLDER_ID,
        title: CLOUDIFIER_MANAGED_FOLDER_NAME,
        include_peers: [channelInputPeer].filter(p => p._ === 'inputPeerChannel'),
        pinned_peers: [],
        exclude_peers: [],
        contacts: false, non_contacts: false, groups: false, broadcasts: true, bots: false,
        exclude_muted: false, exclude_read: false, exclude_archived: false,
        flags: includePeersFlag | broadcastsFlag
      };
      await telegramApiInstance.call('messages.updateDialogFilter', { id: CLOUDIFIER_MANAGED_FOLDER_ID, filter: newFilter });
      updateNeeded = true;
    }
    if (updateNeeded && !isNewChannelCreation) {
      // console.log(`Ensured channel "${channelTitleForLog}" is in "${CLOUDIFIER_MANAGED_FOLDER_NAME}". Update performed.`);
    }
    return updateNeeded;
  } catch (error) {
    // console.error(`Error ensuring channel ${channelTitleForLog} in Cloudifier folder:`, error);
    return false;
  }
}


export async function createManagedCloudChannel(
  title: string,
  type: CloudChannelType
): Promise<{ channelInfo: any; configMessageInfo: any; initialConfig: CloudChannelConfigV1 } | null> {
  if (!(await isUserConnected())) {
    throw new Error("User not connected. Cannot create cloud channel.");
  }

  const channelAbout = `Managed by Telegram Cloudifier. Type: ${type}. Config Signature: ${CLOUDIFIER_APP_SIGNATURE_V1}.`;

  try {
    const createChannelResult = await telegramApiInstance.call('channels.createChannel', {
      title: title,
      about: channelAbout,
      megagroup: type === 'supergroup',
      for_import: false,
    });

    if (!createChannelResult || !createChannelResult.chats || createChannelResult.chats.length === 0) {
      throw new Error("Channel creation failed on Telegram's side: No channel data returned.");
    }

    const newChannel = createChannelResult.chats[0];
    const channelInputPeer: InputPeer = {
      _: 'inputPeerChannel',
      channel_id: newChannel.id,
      access_hash: newChannel.access_hash,
    };

    const identificationMessageText = `${IDENTIFICATION_MESSAGE_PREFIX}${title}${IDENTIFICATION_MESSAGE_SUFFIX}`;
    try {
        await telegramApiInstance.call('messages.sendMessage', {
            peer: channelInputPeer,
            message: identificationMessageText,
            random_id: String(Date.now()) + String(Math.random()),
            no_webpage: true,
        });
    } catch (initMsgError) {
        // console.warn("Failed to send identification message, but proceeding:", initMsgError);
    }

    const now = new Date().toISOString();
    const initialConfig: CloudChannelConfigV1 = {
      app_signature: CLOUDIFIER_APP_SIGNATURE_V1,
      channel_title_at_creation: title,
      created_timestamp_utc: now,
      last_updated_timestamp_utc: now,
      root_entries: {},
    };
    const configJsonString = JSON.stringify(initialConfig, null, 2);

    if (new TextEncoder().encode(configJsonString).length >= 4000) {
        await telegramApiInstance.call('channels.deleteChannel', { channel: channelInputPeer });
        throw new Error("Internal error: Initial configuration message is too large. Channel creation aborted and cleaned up.");
    }

    const configMessageResult = await telegramApiInstance.call('messages.sendMessage', {
      peer: channelInputPeer,
      message: configJsonString,
      random_id: String(Date.now()) + String(Math.random()),
      no_webpage: true,
    });

    let sentConfigMessageInfo = null;
    const updatesArray = Array.isArray(configMessageResult.updates) ? configMessageResult.updates : (configMessageResult.updates?.updates || []);

    for (const update of updatesArray) {
        if (update._ === 'updateNewChannelMessage' && update.message && update.message.message === configJsonString) {
            sentConfigMessageInfo = update.message;
            break;
        }
    }
     if (!sentConfigMessageInfo && configMessageResult.id && configMessageResult.message === configJsonString) {
        sentConfigMessageInfo = configMessageResult;
    }

    if (!sentConfigMessageInfo) {
        sentConfigMessageInfo = { id: (configMessageResult as any).id || CONFIG_MESSAGE_ID, note: "Config message sent, but full object not found in immediate response. Expected ID 3." };
    }

    await sleep(500);
    await ensureChannelInCloudFolder(channelInputPeer, newChannel.title, true);

    return { channelInfo: newChannel, configMessageInfo: sentConfigMessageInfo, initialConfig };

  } catch (error: any) {
    throw error;
  }
}

export async function fetchAndVerifyManagedCloudChannels(): Promise<CloudFolder[]> {
  if (!(await isUserConnected())) {
    return [];
  }

  const verifiedCloudChannels: CloudFolder[] = [];
  let allDialogs: any[] = [];
  let allChatsFromDialogs: any[] = [];
  let allUsersFromDialogs: any[] = [];

  try {
    const dialogsResult = await telegramApiInstance.call('messages.getDialogs', {
      offset_date: 0,
      offset_id: 0,
      offset_peer: { _: 'inputPeerEmpty' },
      limit: 200,
      hash: 0,
    });

    if (dialogsResult && dialogsResult.dialogs) {
      allDialogs = dialogsResult.dialogs;
      allChatsFromDialogs = dialogsResult.chats || [];
      allUsersFromDialogs = dialogsResult.users || [];
    } else {
      return [];
    }
  } catch (error: any) {
    return [];
  }

  for (const dialog of allDialogs) {
    if (dialog.peer?._ !== 'peerChannel') {
      continue;
    }

    const channelInfo = allChatsFromDialogs.find(c => String(c.id) === String(dialog.peer.channel_id));
    if (!channelInfo || channelInfo.access_hash === undefined) {
      continue;
    }

    const channelInputPeer: InputPeer = {
      _: 'inputPeerChannel',
      channel_id: channelInfo.id,
      access_hash: channelInfo.access_hash,
    };

    let isIdentified = false;
    let parsedConfig: CloudChannelConfigV1 | null = null;

    try {
      const messagesResult = await telegramApiInstance.call('channels.getMessages', {
        channel: channelInputPeer,
        id: [
            { _: 'inputMessageID', id: IDENTIFICATION_MESSAGE_ID },
            { _: 'inputMessageID', id: CONFIG_MESSAGE_ID }
        ],
      });

      if (messagesResult && messagesResult.messages && Array.isArray(messagesResult.messages)) {
        const idMessage = messagesResult.messages.find((m: any) => m.id === IDENTIFICATION_MESSAGE_ID && m._ === 'message');
        const configMessage = messagesResult.messages.find((m: any) => m.id === CONFIG_MESSAGE_ID && m._ === 'message');

        if (idMessage && typeof idMessage.message === 'string') {
          const expectedIdText = `${IDENTIFICATION_MESSAGE_PREFIX}${channelInfo.title}${IDENTIFICATION_MESSAGE_SUFFIX}`;
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
          } catch (parseError) { /* console.error("Error parsing config for channel:", channelInfo.title, parseError); */ }
        }
      }
    } catch (error: any) {
      // console.debug(`Skipping channel ${channelInfo.title} during verification (getMessages error):`, error.message);
    }

    if (isIdentified && parsedConfig) {
      const cloudFolder = transformDialogToCloudFolder(dialog, allChatsFromDialogs, allUsersFromDialogs, true, parsedConfig);
      if (cloudFolder) {
        verifiedCloudChannels.push(cloudFolder);
        await ensureChannelInCloudFolder(channelInputPeer, channelInfo.title);
      }
    }
  }
  return verifiedCloudChannels;
}


export async function addVirtualFolderToCloudChannel(
  channelInputPeer: InputPeer,
  parentVirtualPath: string,
  newFolderName: string,
  folderStructureToPaste?: { [name: string]: CloudChannelConfigEntry }
): Promise<CloudChannelConfigV1 | null> {
  if (!channelInputPeer) {
    throw new Error("Channel inputPeer is required.");
  }
  if (!newFolderName || newFolderName.includes('/') || newFolderName === '.' || newFolderName === '..') {
    throw new Error("Invalid folder name. Cannot contain '/', or be '.' or '..'.");
  }

  const currentConfig = await getCloudChannelConfig(channelInputPeer);
  if (!currentConfig) {
    throw new Error("Could not retrieve or validate current cloud channel configuration.");
  }

  let targetEntries = currentConfig.root_entries;
  const normalizedParentPath = parentVirtualPath.startsWith('/') ? parentVirtualPath : '/' + parentVirtualPath;
  const pathSegments = normalizedParentPath.split('/').filter(segment => segment.length > 0);

  for (const segment of pathSegments) {
    if (!targetEntries[segment] || targetEntries[segment].type !== 'folder' || !targetEntries[segment].entries) {
       throw new Error(`Path segment "${segment}" not found or not a folder in config for path "${parentVirtualPath}". Review config structure.`);
    }
    targetEntries = targetEntries[segment].entries!;
  }

  let finalFolderName = newFolderName;
  if (targetEntries[finalFolderName] && folderStructureToPaste) {
    finalFolderName = `${newFolderName}_copy`;
    let copyIndex = 1;
    while (targetEntries[finalFolderName]) {
        finalFolderName = `${newFolderName}_copy${copyIndex++}`;
    }
  } else if (targetEntries[finalFolderName]) {
    throw new Error(`Folder "${newFolderName}" already exists at path "${parentVirtualPath}".`);
  }

  const now = new Date().toISOString();
  targetEntries[finalFolderName] = {
    type: 'folder',
    name: finalFolderName,
    created_at: now,
    modified_at: now,
    entries: folderStructureToPaste || {},
  };

  currentConfig.last_updated_timestamp_utc = now;
  const success = await updateCloudChannelConfig(channelInputPeer, currentConfig);
  return success ? currentConfig : null;
}

export async function removeVirtualFolderFromCloudChannel(
  channelInputPeer: InputPeer,
  virtualFolderPathToRemove: string
): Promise<CloudChannelConfigV1 | null> {
  if (!channelInputPeer) {
    throw new Error("Channel inputPeer is required for removing virtual folder.");
  }
  const normalizedPathToRemove = virtualFolderPathToRemove.startsWith('/') ? virtualFolderPathToRemove : '/' + virtualFolderPathToRemove;
  if (normalizedPathToRemove === '/') {
    throw new Error("Cannot remove the root directory.");
  }

  const currentConfig = await getCloudChannelConfig(channelInputPeer);
  if (!currentConfig) {
    throw new Error("Could not retrieve or validate current cloud channel configuration for deletion.");
  }

  const segments = normalizedPathToRemove.split('/').filter(segment => segment.length > 0);
  const folderNameToDelete = segments.pop();
  if (!folderNameToDelete) {
    throw new Error("Invalid path for deletion, folder name not found.");
  }

  let parentEntries = currentConfig.root_entries;
  for (const segment of segments) {
    if (!parentEntries[segment] || parentEntries[segment].type !== 'folder' || !parentEntries[segment].entries) {
      throw new Error(`Path segment "${segment}" not found or not a folder in config while trying to find parent of "${folderNameToDelete}".`);
    }
    parentEntries = parentEntries[segment].entries!;
  }

  if (!parentEntries[folderNameToDelete] || parentEntries[folderNameToDelete].type !== 'folder') {
    throw new Error(`Virtual folder "${folderNameToDelete}" not found at path "${segments.join('/') || '/'}" for deletion.`);
  }

  delete parentEntries[folderNameToDelete];
  currentConfig.last_updated_timestamp_utc = new Date().toISOString();
  const success = await updateCloudChannelConfig(channelInputPeer, currentConfig);
  return success ? currentConfig : null;
}


export async function getChannelFullInfo(channelInputPeer: InputPeer): Promise<FullChat | null> {
  if (!channelInputPeer || channelInputPeer._ !== 'inputPeerChannel') {
    throw new Error("Invalid input peer for fetching channel details.");
  }
  try {
    const result = await telegramApiInstance.call('channels.getFullChannel', {
      channel: channelInputPeer,
    });
    if (result && result.full_chat) {
        const fullChatWithResolved = {
          ...result.full_chat,
          users: result.users || [],
          chats: result.chats || [],
        };
        return fullChatWithResolved;
    }
    return null;
  } catch (error: any) {
    throw error;
  }
}

export async function updateChannelAbout(channelInputPeer: InputPeer, about: string): Promise<boolean> {
   if (!channelInputPeer || channelInputPeer._ !== 'inputPeerChannel') {
    throw new Error("Invalid input peer for updating channel about.");
  }
  try {
    const result = await telegramApiInstance.call('channels.editAbout', {
      channel: channelInputPeer,
      about: about,
    });
    return result === true || (typeof result === 'object' && result._ === 'boolTrue');
  } catch (error: any) {
    throw error;
  }
}

export async function checkChatUsername(channelInputPeer: InputPeer, username: string): Promise<boolean> {
   if (!channelInputPeer || channelInputPeer._ !== 'inputPeerChannel') {
    throw new Error("Invalid input peer for checking username.");
  }
  try {
    const result = await telegramApiInstance.call('channels.checkUsername', {
      channel: channelInputPeer,
      username: username,
    });
    return result === true || (typeof result === 'object' && result._ === 'boolTrue');
  } catch (error: any) {
    const errorMessage = error.message || error.originalErrorObject?.error_message;
    if (errorMessage === 'USERNAME_PURCHASE_AVAILABLE') {
      throw new Error('USERNAME_PURCHASE_AVAILABLE');
    }
    throw error;
  }
}

export async function updateChatUsername(channelInputPeer: InputPeer, username: string): Promise<boolean> {
   if (!channelInputPeer || channelInputPeer._ !== 'inputPeerChannel') {
    throw new Error("Invalid input peer for updating username.");
  }
  try {
    const result = await telegramApiInstance.call('channels.updateUsername', {
      channel: channelInputPeer,
      username: username,
    });
    return result === true || (typeof result === 'object' && result._ === 'boolTrue');
  } catch (error: any) {
    throw error;
  }
}

export async function exportChannelInviteLink(channelInputPeer: InputPeer): Promise<string | null> {
   if (!channelInputPeer || channelInputPeer._ !== 'inputPeerChannel') {
    throw new Error("Invalid input peer for exporting invite link.");
  }
  try {
    const result = await telegramApiInstance.call('messages.exportChatInvite', {
      peer: channelInputPeer,
    });
    if (result && result._ === 'chatInviteExported' && result.link) {
      return result.link;
    }
    return null;
  } catch (error: any) {
    throw error;
  }
}

export async function updateChannelPhotoService(channelInputPeer: InputPeer, photoInputChatPhoto: any): Promise<UpdatedChannelPhoto | null> {
    if (!channelInputPeer || channelInputPeer._ !== 'inputPeerChannel') {
        throw new Error("Invalid input peer for updating channel photo.");
    }
    if (!photoInputChatPhoto) { // This should be of type InputChatPhoto
        throw new Error("InputChatPhoto is required to update channel photo.");
    }
    try {
        const result = await telegramApiInstance.call('channels.editPhoto', {
            channel: channelInputPeer,
            photo: photoInputChatPhoto,
        });

        if (result && (result._ === 'updates' || result._ === 'updatesCombined')) {
            // Try to find the updated channel photo in result.chats
            if (result.chats && Array.isArray(result.chats)) {
                const updatedChannelEntity = result.chats.find(
                    (c: any) => c._ === 'channel' && String(c.id) === String(channelInputPeer.channel_id)
                );
                if (updatedChannelEntity && updatedChannelEntity.photo) {
                    return { photo: updatedChannelEntity.photo, date: result.date || Math.floor(Date.now() / 1000) };
                }
            }
            // Fallback to looking for updateChannelPhoto in result.updates
            if (result.updates && Array.isArray(result.updates)) {
                for (const singleUpdate of result.updates) {
                    if (singleUpdate._ === 'updateChannelPhoto' && String(singleUpdate.channel_id) === String(channelInputPeer.channel_id)) {
                        return { photo: singleUpdate.photo, date: singleUpdate.date };
                    }
                }
            }
        } else if (result && result._ === 'updateShort' && result.update) {
            // Handle simpler update types if the API ever returns them for this
            const singleUpdate = result.update;
             if (singleUpdate._ === 'updateChannelPhoto' && String(singleUpdate.channel_id) === String(channelInputPeer.channel_id)) {
                return { photo: singleUpdate.photo, date: result.date };
            }
        }
        // console.warn("Could not extract updated photo from channels.editPhoto response:", JSON.stringify(result, null, 2));
        return null; // Photo might have updated but wasn't easily extractable from this response structure
    } catch (error: any) {
        throw error;
    }
}

export async function uploadFileToServerForPhoto(
  fileToUpload: File,
  onProgress: (percent: number) => void,
  signal?: AbortSignal
): Promise<any> { // Should return an InputFile or InputFileBig
  const client_file_id_str = String(Date.now()) + String(Math.floor(Math.random() * 1000000)); // Unique enough for client-side
  const isBigFile = fileToUpload.size > (10 * 1024 * 1024); // 10MB threshold for big file
  const partSize = 512 * 1024; // 512KB
  const totalParts = Math.ceil(fileToUpload.size / partSize);

  onProgress(0);

  for (let i = 0; i < totalParts; i++) {
    if (signal?.aborted) {
      throw new Error('Upload aborted by user.');
    }
    const offset = i * partSize;
    const chunkBlob = fileToUpload.slice(offset, offset + partSize);
    const chunkBuffer = await chunkBlob.arrayBuffer();
    const chunkBytes = new Uint8Array(chunkBuffer);

    try {
      let partUploadResult;
      if (isBigFile) {
        partUploadResult = await telegramApiInstance.call('upload.saveBigFilePart', {
          file_id: client_file_id_str,
          file_part: i,
          file_total_parts: totalParts,
          bytes: chunkBytes,
        }, { signal });
      } else {
        partUploadResult = await telegramApiInstance.call('upload.saveFilePart', {
          file_id: client_file_id_str,
          file_part: i,
          bytes: chunkBytes,
        }, { signal });
      }
      if (partUploadResult?._ !== 'boolTrue' && partUploadResult !== true) {
        throw new Error(`Failed to save file part ${i}. Server response: ${JSON.stringify(partUploadResult)}`);
      }
      const progressPercent = Math.round(((i + 1) / totalParts) * 100);
      onProgress(progressPercent);
    } catch (error: any) {
      throw error;
    }
  }
  if (isBigFile) {
    return { _: 'inputFileBig', id: client_file_id_str, parts: totalParts, name: fileToUpload.name };
  } else {
    return { _: 'inputFile', id: client_file_id_str, parts: totalParts, name: fileToUpload.name, md5_checksum: '' };
  }
}


export async function editChannelTitle(channelInputPeer: InputPeer, newTitle: string): Promise<boolean> {
  if (!channelInputPeer || channelInputPeer._ !== 'inputPeerChannel') {
    throw new Error("Invalid input peer for editing channel title.");
  }
  if (!newTitle.trim()) {
    throw new Error("Channel title cannot be empty.");
  }
  try {
    const result = await telegramApiInstance.call('channels.editTitle', {
      channel: channelInputPeer,
      title: newTitle.trim(),
    });

    const config = await getCloudChannelConfig(channelInputPeer);
    if (config && config.app_signature === CLOUDIFIER_APP_SIGNATURE_V1) {
        config.channel_title_at_creation = newTitle.trim();
        config.last_updated_timestamp_utc = new Date().toISOString();
        await updateCloudChannelConfig(channelInputPeer, config);
    }

    return result === true || (typeof result === 'object' && result._ === 'boolTrue');
  } catch (error: any) {
    throw error;
  }
}

export async function searchUsers(query: string, limit: number = 10): Promise<any[]> {
  if (!query.trim()) {
    return [];
  }
  try {
    const result = await telegramApiInstance.call('contacts.search', {
      q: query,
      limit: limit,
    });
    return result.users || [];
  } catch (error: any) {
    throw error;
  }
}

export async function inviteUserToChannel(channelInputPeer: InputPeer, userToInviteInputPeer: InputPeer): Promise<boolean> {
  if (!channelInputPeer || channelInputPeer._ !== 'inputPeerChannel') {
    throw new Error("Invalid channel input peer for inviting user.");
  }
  if (!userToInviteInputPeer || userToInviteInputPeer._ !== 'inputPeerUser') {
    throw new Error("Invalid user input peer for inviting to channel.");
  }
  try {
    const result = await telegramApiInstance.call('channels.inviteToChannel', {
      channel: channelInputPeer,
      users: [userToInviteInputPeer],
    });
    return !!result;
  } catch (error: any) {
    throw error;
  }
}

export async function getContacts(): Promise<any[]> {
  console.log("[TelegramCloud_GetContacts] Attempting to fetch contacts...");
  try {
    const result = await telegramApiInstance.call('contacts.getContacts', { hash: 0 });
    console.log("[TelegramCloud_GetContacts] Raw API Result:", JSON.stringify(result, null, 2));

    if (result && result._ === 'contacts.contacts' && Array.isArray(result.contacts) && Array.isArray(result.users)) {
      console.log(`[TelegramCloud_GetContacts] Received ${result.contacts.length} contact entries and ${result.users.length} user objects.`);
      
      const mutualContacts = result.contacts
        .map((contact: any) => {
          const userDetail = result.users.find((user: any) => String(user.id) === String(contact.user_id));
          if (!userDetail) {
            console.warn(`[TelegramCloud_GetContacts] User ID ${contact.user_id} from contacts not found in users array.`);
            return null;
          }
          // Prefer the 'mutual_contact' flag on the User object, fallback to 'mutual' on Contact.
          const isMutual = userDetail.mutual_contact === true || contact.mutual === true;
          return isMutual ? userDetail : null;
        })
        .filter((user: any) => user !== null);
      
      console.log(`[TelegramCloud_GetContacts] Processed and filtered ${mutualContacts.length} mutual contacts successfully.`);
      return mutualContacts;
    }
    console.warn("[TelegramCloud_GetContacts] Unexpected structure in contacts.getContacts response. Expected 'contacts.contacts' with 'contacts' and 'users' arrays. Result:", result);
    return [];
  } catch (error) {
    console.error("[TelegramCloud_GetContacts] Error fetching contacts:", error);
    throw error;
  }
}
    

// Removed the redundant export block below, as constants are already exported with `export const`
// Constants for Global Drive Config File
// export { GLOBAL_DRIVE_CONFIG_FILENAME, GLOBAL_DRIVE_CONFIG_CAPTION_KEY, GLOBAL_DRIVE_CONFIG_CAPTION_VALUE };

