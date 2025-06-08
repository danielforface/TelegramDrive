
'use client';

import { telegramApiInstance } from './telegramAPI';
import { isUserConnected } from './telegramAuth';
import type { CloudFolder, DialogFilter, GetChatsPaginatedResponse, InputPeer, MessagesDialogFilters } from '@/types';

export const ALL_CHATS_FILTER_ID = 0;

function getPeerTitle(peer: any, chats: any[], users: any[]): string {
  if (!peer) return 'Unknown Peer';
  try {
    const peerUserIdStr = peer.user_id ? String(peer.user_id) : undefined;
    const peerChatIdStr = peer.chat_id ? String(peer.chat_id) : undefined;
    const peerChannelIdStr = peer.channel_id ? String(peer.channel_id) : undefined;

    if (peer._ === 'peerUser' && peerUserIdStr) {
      const user = users.find(u => String(u.id) === peerUserIdStr);
      if (user) {
        const name = `${user.first_name || ''} ${user.last_name || ''}`.trim();
        return name || `User ${peerUserIdStr}`;
      }
      return `User ${peerUserIdStr}`;
    } else if (peer._ === 'peerChat' && peerChatIdStr) {
      const chat = chats.find(c => String(c.id) === peerChatIdStr);
      return chat ? chat.title : `Chat ${peerChatIdStr}`;
    } else if (peer._ === 'peerChannel' && peerChannelIdStr) {
      const channel = chats.find(c => String(c.id) === peerChannelIdStr);
      return channel ? channel.title : `Channel ${peerChannelIdStr}`;
    }
  } catch (e) {
    // Fallback if properties are missing
    if(peer.user_id) return `User ${String(peer.user_id)}`;
    if(peer.chat_id) return `Chat ${String(peer.chat_id)}`;
    if(peer.channel_id) return `Channel ${String(peer.channel_id)}`;
  }
  return 'Invalid Peer Data';
}

export function transformDialogToCloudFolder(dialog: any, chats: any[], users: any[], isAppManagedCloud?: boolean, cloudConfig?: any): CloudFolder | null {
    if (!dialog || !dialog.peer) {
      return null;
    }
    const peer = dialog.peer;
    const chatTitle = getPeerTitle(peer, chats || [], users || []);
    let inputPeerForApiCalls: InputPeer | undefined;

    const peerUserId = peer.user_id ? String(peer.user_id) : undefined;
    const peerChatId = peer.chat_id ? String(peer.chat_id) : undefined;
    const peerChannelId = peer.channel_id ? String(peer.channel_id) : undefined;

    try {
        if (peer._ === 'peerUser' && peerUserId) {
            const userAssociated = users?.find((u:any) => String(u.id) === peerUserId);
            if (userAssociated && userAssociated.access_hash !== undefined) {
                inputPeerForApiCalls = { _: 'inputPeerUser', user_id: userAssociated.id, access_hash: userAssociated.access_hash };
            } else if (dialog.peer.access_hash !== undefined) { // Fallback to dialog peer access hash
                 inputPeerForApiCalls = { _: 'inputPeerUser', user_id: peer.user_id, access_hash: dialog.peer.access_hash };
            }
        } else if (peer._ === 'peerChat' && peerChatId) {
            inputPeerForApiCalls = { _: 'inputPeerChat', chat_id: peer.chat_id };
        } else if (peer._ === 'peerChannel' && peerChannelId) {
            const chatAssociated = chats?.find((c:any) => String(c.id) === peerChannelId);
            if (chatAssociated && chatAssociated.access_hash !== undefined) {
                inputPeerForApiCalls = { _: 'inputPeerChannel', channel_id: chatAssociated.id, access_hash: chatAssociated.access_hash };
            } else if (dialog.peer.access_hash !== undefined) { // Fallback
                inputPeerForApiCalls = { _: 'inputPeerChannel', channel_id: peer.channel_id, access_hash: dialog.peer.access_hash };
            }
        }
    } catch (e) {
      // console.error("Error determining inputPeer:", e);
    }
    
    // Last resort if specific entity not found in chats/users array but peer has access_hash
    if (!inputPeerForApiCalls) {
      if (peer._ === 'peerUser' && peer.user_id != null && peer.access_hash != null) {
         inputPeerForApiCalls = { _: 'inputPeerUser', user_id: peer.user_id, access_hash: peer.access_hash };
      } else if (peer._ === 'peerChannel' && peer.channel_id != null && peer.access_hash != null) {
         inputPeerForApiCalls = { _: 'inputPeerChannel', channel_id: peer.channel_id, access_hash: peer.access_hash };
      } else if (peer._ === 'peerChat' && peer.chat_id != null ) { // Basic chats don't usually have access_hash in peer
         inputPeerForApiCalls = { _: 'inputPeerChat', chat_id: peer.chat_id };
      }
    }

    if (!inputPeerForApiCalls) {
        // console.warn("Could not determine inputPeer for dialog:", dialog);
        return null; // Cannot proceed without a valid inputPeer
    }

    // Generate a unique ID for the CloudFolder
    let cloudFolderId: string;
    if (peer._ === 'peerUser' && peer.user_id != null) {
        cloudFolderId = `user-${peer.user_id}`;
    } else if (peer._ === 'peerChat' && peer.chat_id != null) {
        cloudFolderId = `chat-${peer.chat_id}`;
    } else if (peer._ === 'peerChannel' && peer.channel_id != null) {
        cloudFolderId = `channel-${peer.channel_id}`;
    } else {
        // Fallback ID for safety, though should be rare with prior checks
        cloudFolderId = `malformed-peer-${dialog.top_message || Date.now() + Math.random()}`;
    }

    return {
      id: cloudFolderId,
      name: chatTitle,
      isChatFolder: true, // Default for dialogs unless specified otherwise
      inputPeer: inputPeerForApiCalls,
      files: [], // Typically populated later
      folders: [], // Typically populated later or by VFS config
      isAppManagedCloud: isAppManagedCloud,
      cloudConfig: cloudConfig,
    };
}

function transformDialogsToCloudFolders(dialogsResult: any): CloudFolder[] {
  const { dialogs, chats, users } = dialogsResult;
  if (!dialogs || !Array.isArray(dialogs)) {
    return [];
  }
  const transformed = dialogs.map((dialog: any) => transformDialogToCloudFolder(dialog, chats, users))
                .filter(folder => folder !== null) as CloudFolder[];
  return transformed;
}

export async function getDialogFilters(): Promise<DialogFilter[]> {
  if (!(await isUserConnected())) {
    return [];
  }
  try {
    const result: MessagesDialogFilters | DialogFilter[] = await telegramApiInstance.call('messages.getDialogFilters');

    if (Array.isArray(result)) { // Sometimes it's just an array of filters
      return result as DialogFilter[];
    } else if (result && result._ === 'messages.dialogFilters' && Array.isArray(result.filters)) {
      return result.filters;
    } else {
      // console.warn("Unexpected result from getDialogFilters:", result);
      return [];
    }
  } catch (error: any) {
    // console.error("Error fetching dialog filters:", error);
    return []; // Return empty on error or if not connected
  }
}

export async function getTelegramChats(
  limit: number,
  offsetDate: number = 0,
  offsetId: number = 0,
  offsetPeer: any = { _: 'inputPeerEmpty' },
  folderId?: number // Telegram's folder_id, not our ALL_CHATS_FILTER_ID
): Promise<GetChatsPaginatedResponse> {
  if (!(await isUserConnected())) {
    return { folders: [], nextOffsetDate: 0, nextOffsetId: 0, nextOffsetPeer: { _: 'inputPeerEmpty' }, hasMore: false };
  }

  const params: any = {
      offset_date: offsetDate,
      offset_id: offsetId,
      offset_peer: offsetPeer || { _: 'inputPeerEmpty' },
      limit: limit,
      hash: 0, // Using 0 for non-delta updates
  };

  if (folderId !== undefined && folderId !== ALL_CHATS_FILTER_ID) { // ALL_CHATS_FILTER_ID means no folder_id param
    params.folder_id = folderId;
  }

  try {
    const dialogsResult = await telegramApiInstance.call('messages.getDialogs', params);
    const transformedFolders = transformDialogsToCloudFolders(dialogsResult);

    let newOffsetDate = offsetDate;
    let newOffsetId = offsetId;
    let newOffsetPeerInput = { ...offsetPeer }; // Start with current, update if possible
    let hasMore = false;

    if (dialogsResult.messages && dialogsResult.messages.length > 0) {
      // Determine `hasMore`
      if (dialogsResult._ === 'messages.dialogsSlice' && dialogsResult.count) {
          // `count` is total number of dialogs in this slice/folder
          hasMore = dialogsResult.dialogs.length < dialogsResult.count && dialogsResult.dialogs.length > 0;
      } else if (dialogsResult._ === 'messages.dialogs') { // This type means all dialogs were returned
          hasMore = false;
      } else { // Fallback: assume more if we received the limit
          hasMore = dialogsResult.dialogs.length >= limit;
      }

      // Determine next offsets if there are dialogs
      if (dialogsResult.dialogs && dialogsResult.dialogs.length > 0) {
          const lastDialog = dialogsResult.dialogs[dialogsResult.dialogs.length - 1];
          // Find the corresponding message for the last dialog to get its date and ID
          const lastMessageInDialogs = dialogsResult.messages.find((m: any) => String(m.id) === String(lastDialog.top_message));

          if (lastMessageInDialogs) {
              newOffsetId = lastMessageInDialogs.id;
              newOffsetDate = lastMessageInDialogs.date;

              // Construct inputPeer for the offset
              if (lastDialog.peer && lastDialog.peer._) {
                  if (lastDialog.peer._ === 'peerUser') {
                      const user = dialogsResult.users?.find((u:any) => String(u.id) === String(lastDialog.peer.user_id));
                      if (user && user.access_hash != null) newOffsetPeerInput = { _: 'inputPeerUser', user_id: user.id, access_hash: user.access_hash};
                      else if (lastDialog.peer.access_hash != null) newOffsetPeerInput = { _: 'inputPeerUser', user_id: lastDialog.peer.user_id, access_hash: lastDialog.peer.access_hash};
                      else newOffsetPeerInput = { _: 'inputPeerEmpty' }; // Safety
                  } else if (lastDialog.peer._ === 'peerChat') {
                      newOffsetPeerInput = { _: 'inputPeerChat', chat_id: lastDialog.peer.chat_id };
                  } else if (lastDialog.peer._ === 'peerChannel') {
                       const channel = dialogsResult.chats?.find((c:any) => String(c.id) === String(lastDialog.peer.channel_id));
                       if (channel && channel.access_hash != null) newOffsetPeerInput = { _: 'inputPeerChannel', channel_id: channel.id, access_hash: channel.access_hash };
                       else if (lastDialog.peer.access_hash != null) newOffsetPeerInput = { _: 'inputPeerChannel', channel_id: lastDialog.peer.channel_id, access_hash: lastDialog.peer.access_hash};
                       else newOffsetPeerInput = { _: 'inputPeerEmpty' }; // Safety
                  } else {
                      newOffsetPeerInput = { _: 'inputPeerEmpty' };
                  }
              } else {
                newOffsetPeerInput = { _: 'inputPeerEmpty' }; // Peer info missing
              }
          } else if (dialogsResult.messages.length > 0 && dialogsResult.dialogs.length < limit) {
             // If we got messages but fewer dialogs than limit, assume no more for this specific query
             hasMore = false;
          }
      } else { // No dialogs returned, so no more.
          hasMore = false;
      }
    } else { // No messages, implies no more dialogs
        hasMore = false;
    }
    
    // Ensure offsetPeer is not inputPeerSelf which can cause issues
    if (!newOffsetPeerInput || !newOffsetPeerInput._ || newOffsetPeerInput._ === 'inputPeerSelf') {
        newOffsetPeerInput = { _: 'inputPeerEmpty' };
    }

    return {
      folders: transformedFolders,
      nextOffsetDate: newOffsetDate,
      nextOffsetId: newOffsetId,
      nextOffsetPeer: newOffsetPeerInput,
      hasMore: hasMore,
    };

  } catch (error:any) {
    if (error.message?.includes('FOLDER_ID_INVALID') && folderId !== undefined) {
      throw new Error(`FOLDER_ID_INVALID: Folder ID ${folderId} is invalid.`);
    }
    throw error; // Re-throw other errors
  }
}

export async function updateDialogFiltersOrder(order: number[]): Promise<boolean> {
  try {
    const result = await telegramApiInstance.call('messages.updateDialogFiltersOrder', { order });
    return result === true || (typeof result === 'object' && result._ === 'boolTrue');
  } catch (error: any) {
    // console.error("Error updating dialog filters order:", error);
    throw error;
  }
}

export async function exportChatlistInvite(filterId: number): Promise<{ link: string } | null> {
  try {
    const inputChatlist = {
        _: 'inputChatlistDialogFilter',
        filter_id: filterId
    };
    const result = await telegramApiInstance.call('chatlists.exportChatlistInvite', {
        chatlist: inputChatlist,
        title: '', // Title for the invite, can be empty
        peers: []  // Specific peers for the invite, can be empty
    });
    // Response structure can vary, check for invite.url or result.url
    if (result && result.invite && result.invite.url) {
        return { link: result.invite.url };
    }
    if (result && result.url) { // Alternative response structure
        return { link: result.url };
    }
    // console.warn("No invite link found in exportChatlistInvite response:", result);
    return null;
  } catch (error: any) {
    // console.error("Error exporting chatlist invite:", error);
    throw error;
  }
}

export async function updateDialogFilter(
  filterIdToUpdate: number | null, // null for creating a new filter
  filterData?: DialogFilter // The filter object itself
): Promise<boolean> {
  const params: any = {
    flags: 0,
  };

  if (filterIdToUpdate !== null) {
    params.id = filterIdToUpdate;
  } else {
    // If creating a new filter, filterData is mandatory.
    if (!filterData) {
        // console.error("Filter data is required when creating a new dialog filter.");
        return false;
    }
  }
  
  // If filterData is provided, it means we are setting/updating the filter.
  if (filterData) {
    params.flags |= (1 << 0); // Set the 'filter' flag
    params.filter = filterData;
  }

  try {
    const result = await telegramApiInstance.call('messages.updateDialogFilter', params);
    return result === true || (typeof result === 'object' && result._ === 'boolTrue');
  } catch (error: any) {
    // console.error("Error updating dialog filter:", error);
    throw error;
  }
}
