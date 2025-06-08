
'use client';

import { telegramApiInstance, sleep } from './telegramAPI';
import { isUserConnected } from './telegramAuth';
import { getDialogFilters, transformDialogToCloudFolder, ALL_CHATS_FILTER_ID } from './telegramDialogs';
import type { InputPeer, CloudChannelConfigV1, CloudChannelType, CloudChannelConfigEntry, CloudFolder, FullChat, UpdatedChannelPhoto } from '@/types';

export const CLOUDIFIER_APP_SIGNATURE_V1 = "TELEGRAM_CLOUDIFIER_V1.0";
export const IDENTIFICATION_MESSAGE_ID = 2;
export const CONFIG_MESSAGE_ID = 3;
export const IDENTIFICATION_MESSAGE_PREFIX = "Initializing Cloud Storage: ";
export const IDENTIFICATION_MESSAGE_SUFFIX = "... This message ensures the configuration message ID is stable.";

const CLOUDIFIER_MANAGED_FOLDER_ID = 20001; 
const CLOUDIFIER_MANAGED_FOLDER_NAME = "Cloudifier Storage";


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

export async function updateChannelPhotoService(channelInputPeer: InputPeer, photoFileId: any, photoInputFile: any): Promise<UpdatedChannelPhoto | null> {
    if (!channelInputPeer || channelInputPeer._ !== 'inputPeerChannel') {
        throw new Error("Invalid input peer for updating channel photo.");
    }
    if (!photoInputFile) { 
        throw new Error("InputPhoto (uploaded) is required to update channel photo.");
    }
    try {
        const result = await telegramApiInstance.call('channels.editPhoto', {
            channel: channelInputPeer,
            photo: photoInputFile, 
        });
        if (result && result.updates) {
            const photoUpdate = result.updates.find((u: any) => u._ === 'updateChatParticipants' || u._ === 'updateChannelPhoto' || (u._ === 'updateChannel' && u.photo));
            if (photoUpdate) {
                const newPhotoObject = photoUpdate.photo || (photoUpdate.participants ? photoUpdate.participants.chat?.photo : null);
                 if(newPhotoObject) {
                    return { photo: newPhotoObject, date: Date.now()/1000 };
                 }
            }
        }
        return null;
    } catch (error: any) {
        throw error;
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
  try {
    const result = await telegramApiInstance.call('contacts.getContacts', { hash: 0 });
    return result.users || [];
  } catch (error) {
    throw error; 
  }
}
    
