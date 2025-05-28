
'use client';

import MTProto from '@mtproto/core/envs/browser';
import type { CloudFolder, CloudFile, GetChatsPaginatedResponse, MediaHistoryResponse } from '@/types';
import { sha256 } from '@cryptography/sha256';
import bigInt from 'big-integer';

const API_ID_STRING = process.env.NEXT_PUBLIC_TELEGRAM_API_ID;
const API_HASH = process.env.NEXT_PUBLIC_TELEGRAM_API_HASH;

let API_ID: number | undefined = undefined;

if (API_ID_STRING) {
  API_ID = parseInt(API_ID_STRING, 10);
  if (isNaN(API_ID)) {
    console.error(
      'CRITICAL: NEXT_PUBLIC_TELEGRAM_API_ID is not a valid number. Real connection will fail. Please ensure it is a number in your .env.local file and you have restarted your development server.'
    );
    API_ID = undefined;
  }
} else {
   console.warn(
    'CRITICAL: NEXT_PUBLIC_TELEGRAM_API_ID is not set in environment variables. Real connection will fail. Please ensure it is set in your .env.local file and you have restarted your development server.'
  );
}

if (!API_HASH) {
  console.warn(
    'CRITICAL: NEXT_PUBLIC_TELEGRAM_API_HASH is not set in environment variables. Real connection will fail. Please ensure it is set in your .env.local file and you have restarted your development server.'
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

let userSession: {
  phone?: string;
  phone_code_hash?: string;
  user?: any;
  srp_id?: string; // Stored as string
  srp_params?: {
    g: number;
    p: Uint8Array;
    salt1: Uint8Array;
    salt2: Uint8Array;
    srp_B: Uint8Array;
  };
} = {};

const USER_SESSION_KEY = 'telegram_user_session';

function saveUserToLocalStorage(user: any) {
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(USER_SESSION_KEY, JSON.stringify(user));
      console.log('User session saved to localStorage.');
    } catch (e) {
      console.error('Error saving user session to localStorage:', e);
    }
  }
}

function loadUserFromLocalStorage(): any | null {
  if (typeof window !== 'undefined') {
    try {
      const storedUser = localStorage.getItem(USER_SESSION_KEY);
      if (storedUser) {
        console.log('User session loaded from localStorage.');
        return JSON.parse(storedUser);
      }
    } catch (e) {
      console.error('Error loading user session from localStorage:', e);
      localStorage.removeItem(USER_SESSION_KEY); // Clear corrupted data
    }
  }
  return null;
}

// Initialize userSession from localStorage when the service loads
if (typeof window !== 'undefined') {
    const loadedUser = loadUserFromLocalStorage();
    if (loadedUser) {
        userSession.user = loadedUser;
    }
}
class API {
  public mtproto: MTProto;

  constructor() {
    if (API_ID === undefined || !API_HASH) {
      const errorMessage = "CRITICAL: Telegram API_ID or API_HASH is missing or invalid. \n" +
                         "Please ensure NEXT_PUBLIC_TELEGRAM_API_ID (as a number) and NEXT_PUBLIC_TELEGRAM_API_HASH (as a string) \n" +
                         "are correctly set in your .env.local file. \n" +
                         "You MUST restart your development server (e.g., 'npm run dev') after creating or modifying the .env.local file for changes to take effect.";
      console.error(errorMessage);
      throw new Error(errorMessage);
    }
    try {
      this.mtproto = new MTProto({
        api_id: API_ID,
        api_hash: API_HASH,
        // storageOptions will default to localStorage in browser env
      });
      console.log('MTProto client initialized successfully in API class for browser environment.');

      // Setup update listeners
      this.mtproto.updates.on('updatesTooLong', (updateInfo: any) => {
        console.log('MTProto update: updatesTooLong:', updateInfo);
      });
      this.mtproto.updates.on('updateShortMessage', (updateInfo: any) => {
        console.log('MTProto update: updateShortMessage:', updateInfo);
      });
      this.mtproto.updates.on('updateShortChatMessage', (updateInfo: any) => {
        console.log('MTProto update: updateShortChatMessage:', updateInfo);
      });
      this.mtproto.updates.on('updateShort', (updateInfo: any) => {
        console.log('MTProto update: updateShort:', updateInfo);
      });
      this.mtproto.updates.on('updatesCombined', (updateInfo: any) => {
        console.log('MTProto update: updatesCombined:', updateInfo);
      });
      this.mtproto.updates.on('updates', (updateInfo: any) => {
        console.log('MTProto update: updates:', updateInfo);
      });
      this.mtproto.updates.on('updateShortSentMessage', (updateInfo: any) => {
        console.log('MTProto update: updateShortSentMessage:', updateInfo);
      });

    } catch (initError: any) {
        console.error("CRITICAL: Failed to initialize MTProto client in API constructor:", initError);
        throw new Error(`MTProto client initialization failed: ${initError.message || JSON.stringify(initError)}`);
    }
  }

  async call(method: string, params: any = {}, options: any = {}): Promise<any> {
    try {
      const result = await this.mtproto.call(method, params, options);
      return result;
    } catch (originalError: any) {
      console.warn(`MTProto call '${method}' raw error object:`, JSON.stringify(originalError, null, 2), originalError);

      const { error_code, error_message } = originalError;

      if (error_code === 420 && typeof error_message === 'string' && error_message.startsWith('FLOOD_WAIT_')) {
        const secondsStr = error_message.split('FLOOD_WAIT_')[1];
        const seconds = parseInt(secondsStr, 10);
        if (!isNaN(seconds)) {
            const ms = seconds * 1000;
            console.log(`Flood wait: waiting ${seconds}s before retrying ${method}.`);
            await sleep(ms);
            return this.call(method, params, options); // Retry the call
        } else {
            console.error(`Could not parse flood wait time from: ${error_message}`);
        }
      }

      if (error_code === 303 && typeof error_message === 'string' && error_message.includes('_MIGRATE_')) {
        const migrateMatch = error_message.match(/([A-Z_]+)_MIGRATE_(\d+)/);
        if (migrateMatch && migrateMatch[1] && migrateMatch[2]) {
            const type = migrateMatch[1];
            const dcId = Number(migrateMatch[2]);

            console.log(`${type}_MIGRATE_X error. Attempting to migrate to DC ${dcId} for ${method}...`);

            if (type === 'PHONE') { // Specific handling for PHONE_MIGRATE_X
              console.log(`Setting default DC to ${dcId} due to PHONE_MIGRATE.`);
              await this.mtproto.setDefaultDc(dcId);
            } else { // For other MIGRATE errors, pass dcId in options
              console.log(`Retrying ${method} with dcId ${dcId}.`);
              options = { ...options, dcId };
            }
            return this.call(method, params, options); // Retry the call
        } else {
            console.error(`Could not parse migrate DC from: ${error_message}`);
        }
      }
      
      let processedError;
      if (originalError instanceof Error && originalError.message) {
        processedError = originalError;
      } else if (typeof originalError === 'object' && originalError !== null && (originalError.error_message || originalError.message)) {
        processedError = new Error(originalError.error_message || originalError.message);
      } else {
        const authMethods = ['auth.sendCode', 'auth.signIn', 'auth.checkPassword'];
        if (authMethods.includes(method)) {
            console.warn(`Low-level or empty error during ${method}. Clearing potentially problematic local session parts.`);
            delete userSession.phone_code_hash;
            delete userSession.srp_id;
            delete userSession.srp_params;
        }
        processedError = new Error(`MTProto call '${method}' failed. Raw error: ${JSON.stringify(originalError)}`);
      }
      
      // Attach the original error object for further inspection if needed
      if (originalError !== processedError && typeof originalError === 'object' && originalError !== null) {
        (processedError as any).originalErrorObject = originalError;
      }
      return Promise.reject(processedError);
    }
  }
}

const api = new API(); // Singleton instance

export async function sendCode(phoneNumber: string): Promise<string> {
  userSession = { phone: phoneNumber }; // Reset relevant parts of session for new attempt
  console.log(`Attempting to send code to ${phoneNumber} via API class`);

  const sendCodePayload = {
    phone_number: phoneNumber,
    settings: {
      _: 'codeSettings',
    },
  };

  try {
    const result = await api.call('auth.sendCode', sendCodePayload);
    if (!result.phone_code_hash) throw new Error("phone_code_hash not received from Telegram.");
    userSession.phone_code_hash = result.phone_code_hash;
    console.log('Verification code sent, phone_code_hash:', userSession.phone_code_hash);
    return userSession.phone_code_hash;
  } catch (error: any) {
    console.error('Error in sendCode function after api.call:', error.message, error.originalErrorObject || error);
    const message = error.message || 'Failed to send code.';
     if (message === 'AUTH_RESTART' || (error.originalErrorObject?.error_message === 'AUTH_RESTART')) {
         throw new Error('AUTH_RESTART');
    }
    throw new Error(message);
  }
}

export async function signIn(code: string): Promise<{ user?: any; error?: string; srp_id?: string }> {
  if (!userSession.phone || !userSession.phone_code_hash) {
    console.error('Phone number or phone_code_hash missing for signIn. Call sendCode first.');
    delete userSession.phone_code_hash; // Clear potentially stale hash
    throw new Error('Phone number and phone_code_hash not set. Call sendCode first.');
  }

  try {
    const result = await api.call('auth.signIn', {
      phone_number: userSession.phone,
      phone_code_hash: userSession.phone_code_hash,
      phone_code: code,
    });

    if (result._ === 'auth.authorizationSignUpRequired') {
      throw new Error('Sign up required. This app currently only supports sign in for existing accounts.');
    }

    console.log('Signed in successfully (or 2FA needed):', result);
    if (result.user) {
        userSession.user = result.user;
        saveUserToLocalStorage(userSession.user);
    }
    delete userSession.phone_code_hash; // Clear hash after use
    return { user: result.user };

  } catch (error: any) {
    console.warn('Error in signIn function after api.call:', error.message, error.originalErrorObject || error);
    const errorMessage = error.message || (error.originalErrorObject?.error_message);

    if (errorMessage === 'SESSION_PASSWORD_NEEDED') {
      console.log('2FA password needed. Fetching password details...');
      try {
        const passwordData = await api.call('account.getPassword');
        console.log('Password data received (account.getPassword):', passwordData);

        if (!passwordData.srp_id || !passwordData.current_algo || !passwordData.srp_B) {
             console.error("Failed to get complete SRP parameters from account.getPassword. Response:", passwordData);
             delete userSession.phone_code_hash;
             throw new Error('Failed to initialize 2FA: Missing critical SRP parameters.');
        }

        userSession.srp_id = passwordData.srp_id.toString(); // Ensure srp_id is string
        userSession.srp_params = { // Store all necessary params for SRP calculation
            g: passwordData.current_algo.g,
            p: passwordData.current_algo.p, // Uint8Array
            salt1: passwordData.current_algo.salt1, // Uint8Array
            salt2: passwordData.current_algo.salt2, // Uint8Array
            srp_B: passwordData.srp_B // Uint8Array
        };

        const twoFactorError: any = new Error('2FA_REQUIRED');
        twoFactorError.srp_id = userSession.srp_id; // Pass srp_id along with the error
        throw twoFactorError;

      } catch (getPasswordError: any) {
        console.error('Error fetching password details for 2FA:', getPasswordError.message, getPasswordError.originalErrorObject || getPasswordError);
        delete userSession.phone_code_hash;
        if (getPasswordError.message === '2FA_REQUIRED' && getPasswordError.srp_id) throw getPasswordError; // Re-throw if it's the specific 2FA error
        const message = getPasswordError.message || 'Failed to fetch 2FA details.';
        throw new Error(message);
      }
    }
    delete userSession.phone_code_hash; // Clear hash on other errors too
    throw new Error(errorMessage || 'Failed to sign in.');
  }
}


export async function checkPassword(password: string): Promise<any> {
  if (!userSession.srp_id || !userSession.srp_params) {
    console.error("SRP parameters not available for checkPassword. 2FA flow not properly initiated or srp_params missing.");
    // Clean up to prevent inconsistent state
    delete userSession.srp_params;
    delete userSession.srp_id;
    throw new Error('SRP parameters not available. Please try the login process again.');
  }

  try {
    const { g, p, salt1, salt2, srp_B } = userSession.srp_params;
    console.log("Attempting to get SRPParams for checkPassword with provided password and stored srp_params.");

    // Use mtproto-core's built-in SRP calculation
    const { A, M1 } = await api.mtproto.crypto.getSRPParams({
        g,
        p,
        salt1,
        salt2,
        gB: srp_B,
        password,
    });
    console.log("SRP A and M1 computed by library. Calling auth.checkPassword...");

    const checkResult = await api.call('auth.checkPassword', {
        password: {
            _: 'inputCheckPasswordSRP',
            srp_id: userSession.srp_id, // srp_id from account.getPassword
            A: A, // Uint8Array from getSRPParams
            M1: M1, // Uint8Array from getSRPParams
        }
    });

    console.log('2FA password check result:', checkResult);
    if (checkResult.user) {
        userSession.user = checkResult.user;
        saveUserToLocalStorage(userSession.user);
    }
    // Clean up SRP session data after attempt (success or fail)
    delete userSession.srp_params;
    delete userSession.srp_id;
    return checkResult.user;

  } catch (error: any) {
    console.error('Error checking password:', error.message, error.originalErrorObject || error);
    // Clean up SRP session data on error
    delete userSession.srp_params;
    delete userSession.srp_id;

    const message = error.message || (error.originalErrorObject?.error_message || 'Failed to check 2FA password.');
    if (message === 'PASSWORD_HASH_INVALID') {
        throw new Error('Invalid password. Please try again. (PASSWORD_HASH_INVALID)');
    }
    if (message === 'SRP_ID_INVALID') {
        // This means the srp_id is no longer valid, user should restart 2FA
        throw new Error('Session for 2FA has expired or is invalid. Please try logging in again. (SRP_ID_INVALID)');
    }
    throw new Error(message);
  }
}

function formatFileSize(bytes: number, decimals = 2): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

export async function getChatMediaHistory(
  inputPeer: any,
  limit: number,
  offsetId: number = 0 // ID of the last message from which to get history (0 for initial load)
): Promise<MediaHistoryResponse> {
  if (!userSession.user) {
    console.warn('User not signed in. Cannot fetch chat media history.');
    return { files: [], hasMore: false };
  }
  if (!inputPeer) {
    console.warn('Input peer is missing. Cannot fetch chat media history.');
    return { files: [], hasMore: false };
  }

  console.log('Fetching chat media history with params:', { inputPeer, limit, offsetId });
  try {
    // Important: filter for media types directly in getHistory is not standard MTProto.
    // We fetch all messages and filter client-side.
    const historyResult = await api.call('messages.getHistory', {
      peer: inputPeer,
      offset_id: offsetId,
      offset_date: 0, // Not typically used with offset_id for basic pagination
      add_offset: 0, 
      limit: limit,
      max_id: 0, // Use offset_id for pagination from older messages
      min_id: 0, // Not typically used for fetching older messages
      hash: 0,   // For message history, hash is usually 0
    });

    console.log('Chat media history raw result:', historyResult);

    const mediaFiles: CloudFile[] = [];
    let newOffsetId: number | undefined = offsetId;
    let hasMore = false;

    if (historyResult.messages && historyResult.messages.length > 0) {
      historyResult.messages.forEach((msg: any) => {
        // Filter out messages without media or specific types we don't want (like webpage previews if they're not documents)
        if (msg.media && msg.media._ !== 'messageMediaEmpty' && msg.media._ !== 'messageMediaWebPage') {
          let fileType: CloudFile['type'] = 'unknown';
          let fileName = `file_${msg.id}`;
          let fileSize: string | undefined;
          let dataAiHint: string | undefined;

          if (msg.media._ === 'messageMediaPhoto' && msg.media.photo) {
            fileType = 'image';
            fileName = `photo_${msg.id}.jpg`; // Generic name
            const photo = historyResult.photos?.find((p:any) => p.id?.toString() === msg.media.photo.id?.toString());
            if (photo && photo.sizes) {
                // Find largest available size (often the last one, or sort by w*h or type)
                const largestSize = photo.sizes.sort((a:any,b:any) => (b.w*b.h) - (a.w*a.h))[0];
                if(largestSize && largestSize.size) fileSize = formatFileSize(largestSize.size);
            }
            dataAiHint = "photograph image";
          } else if (msg.media._ === 'messageMediaDocument' && msg.media.document) {
            // More detailed handling for documents
            const doc = historyResult.documents?.find((d:any) => d.id?.toString() === msg.media.document.id?.toString());
            if (doc) {
                fileName = doc.attributes?.find((attr: any) => attr._ === 'documentAttributeFilename')?.file_name || `document_${msg.id}`;
                fileSize = doc.size ? formatFileSize(doc.size) : undefined;
                if (doc.mime_type?.startsWith('image/')) {
                    fileType = 'image';
                    dataAiHint = "graphic image";
                } else if (doc.mime_type?.startsWith('video/')) {
                    fileType = 'video';
                    dataAiHint = "video clip";
                } else if (doc.mime_type?.startsWith('audio/')) {
                    fileType = 'audio';
                    dataAiHint = "audio recording";
                } else {
                    fileType = 'document';
                    dataAiHint = "document file";
                }
            }
          }
          // TODO: Add more specific handlers for video (messageMediaVideo), audio (messageMediaAudio) if they exist
          // and if their structure differs from messageMediaDocument with a video/audio mime type.

          mediaFiles.push({
            id: msg.id.toString(),
            messageId: msg.id,
            name: fileName,
            type: fileType,
            size: fileSize,
            lastModified: new Date(msg.date * 1000).toLocaleDateString(),
            dataAiHint: dataAiHint,
            telegramMessage: msg, // Store the full message object
            // url: will be constructed later if download is implemented
          });
        }
      });

      if (mediaFiles.length > 0) {
        newOffsetId = mediaFiles[mediaFiles.length - 1].messageId;
      } else if (historyResult.messages.length > 0) {
        // If all messages in this batch were text/non-media, use the last text message id as offset
        newOffsetId = historyResult.messages[historyResult.messages.length - 1].id;
      }
      
      // Determine if there are more messages to fetch.
      // A simple check: if the number of messages received is less than the limit,
      // or if the total count (if available and reliable) suggests no more.
      // For `messages.getHistory`, `messages.length < limit` is a common way.
      // `historyResult.count` refers to total messages in chat, not what's left.
      hasMore = historyResult.messages.length === limit;
    } else {
        hasMore = false; // No messages returned in this batch
    }
    
    // Filter out any non-media files if they accidentally slipped through
    // (e.g. if initial type was 'unknown' but had no size or other media indicators)
    const filteredMediaFiles = mediaFiles.filter(f => f.type !== 'unknown' || (f.type === 'unknown' && f.size));


    return {
      files: filteredMediaFiles,
      nextOffsetId: newOffsetId,
      hasMore: hasMore && filteredMediaFiles.length > 0, // Only consider hasMore if actual media was found in this batch
    };

  } catch (error:any) {
    console.error('Error fetching chat media history:', error.message, error.originalErrorObject || error);
    const message = error.message || 'Failed to fetch chat media.';
    throw new Error(message);
  }
}


export async function getTelegramChats(
  limit: number,
  offsetDate: number = 0,
  offsetId: number = 0,
  offsetPeer: any = { _: 'inputPeerEmpty' }
): Promise<GetChatsPaginatedResponse> {
  if (!userSession.user) {
    console.warn('User not signed in. Cannot fetch chats.');
    return { folders: [], nextOffsetDate: 0, nextOffsetId: 0, nextOffsetPeer: { _: 'inputPeerEmpty' }, hasMore: false };
  }

  console.log('Fetching user dialogs (chats) with params:', { limit, offsetDate, offsetId, offsetPeer });
  try {
    const dialogsResult = await api.call('messages.getDialogs', {
      offset_date: offsetDate,
      offset_id: offsetId,
      offset_peer: offsetPeer,
      limit: limit,
      hash: 0, // Usually 0 for initial fetches or when not using complicated diffs
    });
    console.log('Dialogs raw result:', dialogsResult);

    const transformedFolders = transformDialogsToCloudFolders(dialogsResult);

    let newOffsetDate = offsetDate;
    let newOffsetId = offsetId;
    let newOffsetPeerInput = offsetPeer; 
    let hasMore = false;

    if (dialogsResult.dialogs && dialogsResult.dialogs.length > 0) {
      // If we received as many dialogs as we asked for, assume there might be more.
      hasMore = dialogsResult.dialogs.length === limit;

      if (hasMore) {
        // The next offset is based on the last dialog received in this batch
        const lastDialog = dialogsResult.dialogs[dialogsResult.dialogs.length - 1];
        newOffsetId = lastDialog.top_message; // The ID of the top message in this dialog
        newOffsetPeerInput = lastDialog.peer; // The peer object of this dialog

        // Convert to InputPeer for the next call's offset_peer
        if (newOffsetPeerInput._ === 'peerUser') {
            const user = dialogsResult.users.find((u:any) => u.id.toString() === newOffsetPeerInput.user_id.toString());
            if (user) {
                 newOffsetPeerInput = { _: 'inputPeerUser', user_id: user.id, access_hash: user.access_hash };
            } else {
                console.warn("Could not find user for peerUser offset, peer:", newOffsetPeerInput);
                newOffsetPeerInput = { _: 'inputPeerEmpty' }; // Fallback
            }
        } else if (newOffsetPeerInput._ === 'peerChat') {
             newOffsetPeerInput = { _: 'inputPeerChat', chat_id: newOffsetPeerInput.chat_id };
        } else if (newOffsetPeerInput._ === 'peerChannel') {
            const chat = dialogsResult.chats.find((c:any) => c.id.toString() === newOffsetPeerInput.channel_id.toString());
             if (chat) {
                newOffsetPeerInput = { _: 'inputPeerChannel', channel_id: chat.id, access_hash: chat.access_hash };
            } else {
                console.warn("Could not find channel for peerChannel offset, peer:", newOffsetPeerInput);
                newOffsetPeerInput = { _: 'inputPeerEmpty' }; // Fallback
            }
        } else {
            console.warn("Unknown peer type for offset, peer:", newOffsetPeerInput);
            newOffsetPeerInput = { _: 'inputPeerEmpty' }; // Fallback
        }


        // Find the date of the top_message of the last dialog for offset_date
        const messages = dialogsResult.messages || [];
        const lastMessageDetails = messages.find((msg: any) => msg.id === newOffsetId &&
          ( (msg.peer_id?.user_id?.toString() === lastDialog.peer.user_id?.toString()) ||
            (msg.peer_id?.chat_id?.toString() === lastDialog.peer.chat_id?.toString()) ||
            (msg.peer_id?.channel_id?.toString() === lastDialog.peer.channel_id?.toString())
          )
        );

        if (lastMessageDetails && typeof lastMessageDetails.date === 'number') {
          newOffsetDate = lastMessageDetails.date;
        } else {
          console.warn("Could not determine nextOffsetDate accurately from message details for main chat list. Last dialog:", lastDialog, "Found message:", lastMessageDetails, "Messages list:", messages);
          // Fallback or keep existing offsetDate if unsure, or use last dialog's peer date if available (though less precise)
        }
      }
    } else {
        hasMore = false; // No dialogs returned in this batch
    }

    return {
      folders: transformedFolders,
      nextOffsetDate: newOffsetDate,
      nextOffsetId: newOffsetId,
      nextOffsetPeer: newOffsetPeerInput,
      hasMore: hasMore,
    };

  } catch (error:any) {
    console.error('Error fetching dialogs:', error.message, error.originalErrorObject || error);
    const message = error.message || 'Failed to fetch chats.';
    throw new Error(message);
  }
}

// Helper to get a displayable title for a peer
function getPeerTitle(peer: any, chats: any[], users: any[]): string {
  if (!peer) return 'Unknown Peer';
  try {
    const peerUserIdStr = peer.user_id?.toString();
    const peerChatIdStr = peer.chat_id?.toString();
    const peerChannelIdStr = peer.channel_id?.toString();

    if (peer._ === 'peerUser' && peerUserIdStr) {
      const user = users.find(u => u.id?.toString() === peerUserIdStr);
      if (user) {
        const name = `${user.first_name || ''} ${user.last_name || ''}`.trim();
        return name || `User ${peerUserIdStr}`;
      }
      return `User ${peerUserIdStr}`;
    } else if (peer._ === 'peerChat' && peerChatIdStr) {
      const chat = chats.find(c => c.id?.toString() === peerChatIdStr);
      return chat ? chat.title : `Chat ${peerChatIdStr}`;
    } else if (peer._ === 'peerChannel' && peerChannelIdStr) {
      const channel = chats.find(c => c.id?.toString() === peerChannelIdStr);
      return channel ? channel.title : `Channel ${peerChannelIdStr}`;
    }
  } catch (e) {
    console.error("Error in getPeerTitle processing peer:", peer, e);
    if(peer.user_id) return `User ${peer.user_id.toString()}`; // Basic fallback
    if(peer.chat_id) return `Chat ${peer.chat_id.toString()}`;
    if(peer.channel_id) return `Channel ${peer.channel_id.toString()}`;
  }
  console.warn("Could not determine peer title for:", JSON.stringify(peer));
  return 'Invalid Peer Data';
}


function transformDialogsToCloudFolders(dialogsResult: any): CloudFolder[] {
  const { dialogs, chats, users } = dialogsResult;

  if (!dialogs || !Array.isArray(dialogs)) {
    console.warn('No dialogs found or dialogs is not an array in the result.');
    return [];
  }

  return dialogs.map((dialog: any): CloudFolder | null => {
    if (!dialog || !dialog.peer) {
      console.warn("Skipping invalid dialog object (no peer):", dialog);
      return null;
    }
    const peer = dialog.peer;
    const chatTitle = getPeerTitle(peer, chats || [], users || []);

    let peerId: string | undefined;
    let inputPeer: any | undefined;

    try {
        if (peer._ === 'peerUser') {
            peerId = peer.user_id?.toString();
            const user = users.find(u => u.id?.toString() === peerId);
            if (user) {
                inputPeer = { _: 'inputPeerUser', user_id: user.id, access_hash: user.access_hash };
            }
        } else if (peer._ === 'peerChat') {
            peerId = peer.chat_id?.toString();
            inputPeer = { _: 'inputPeerChat', chat_id: peer.chat_id };
        } else if (peer._ === 'peerChannel') {
            peerId = peer.channel_id?.toString();
            const chatAssociated = chats.find((c:any) => c.id?.toString() === peerId); // Renamed variable to avoid conflict
            if (chatAssociated) { // Check if chat is found
                inputPeer = { _: 'inputPeerChannel', channel_id: chatAssociated.id, access_hash: chatAssociated.access_hash };
            }
        }
    } catch (e) {
        console.error("Error constructing inputPeer for dialog:", dialog, e);
    }


    if (!peerId || !inputPeer) { // If inputPeer couldn't be constructed
        console.warn("Could not determine peerId or valid inputPeer for dialog:", dialog.peer, "Peer Data:", peer, "InputPeer attempt:", inputPeer);
        return null; // Skip this dialog if essential peer info is missing
    }

    // Use a combination for a more unique ID, especially if top_message can be 0 or similar across dialogs
    const uniqueSuffix = dialog.top_message?.toString() || Date.now().toString(); 
    const folderIdBase = `chat-${peerId}-${uniqueSuffix}`;


    return {
      id: folderIdBase,
      name: chatTitle,
      isChatFolder: true,
      inputPeer: inputPeer, // Store the constructed inputPeer
      files: [], // Media files will be fetched on demand when chat is selected
      folders: [], // No predefined subfolders like "Images", "Videos"
    };
  }).filter(folder => folder !== null) as CloudFolder[]; // Filter out nulls from map
}


export async function signOut(): Promise<void> {
  try {
    await api.call('auth.logOut');
    console.log('Signed out successfully from Telegram server.');
  } catch (error: any) {
    console.error('Error signing out from Telegram server:', error.message, error.originalErrorObject || error);
    // Even if server logout fails, proceed with local cleanup
  } finally {
    // Clear local session state
    userSession = {}; // Reset the in-memory session object
    if (typeof window !== 'undefined') {
      localStorage.removeItem(USER_SESSION_KEY); // Remove from localStorage
      try {
        // Attempt to clear mtproto-core's internal storage if method exists
        // This part is speculative and depends on the library's browser API
        if (api && api.mtproto && (api.mtproto as any).clearStorage === 'function') {
          await (api.mtproto as any).clearStorage();
          console.log('mtproto-core internal storage cleared.');
        }
      } catch (e) {
        console.error('Error trying to clear mtproto-core storage:', e);
      }
      console.log('Local userSession object and localStorage session cleared.');
    }
  }
}

export async function isUserConnected(): Promise<boolean> {
  // First, check if we have a user object in our local session
  if (userSession.user) {
    try {
        // Make a lightweight API call to confirm session validity with Telegram
        await api.call('users.getUsers', {id: [{_: 'inputUserSelf'}]});
        console.log("User session is active (checked with users.getUsers).");
        return true;
    } catch (error: any) {
        // Handle errors that indicate an invalid session
        const errorMessage = error.message || error.originalErrorObject?.error_message;
        const authErrorMessages = ['AUTH_KEY_UNREGISTERED', 'USER_DEACTIVATED', 'SESSION_REVOKED', 'SESSION_EXPIRED', 'API_ID_INVALID', 'API_KEY_INVALID', 'AUTH_RESTART'];

        if (errorMessage && authErrorMessages.some(authMsg => errorMessage.includes(authMsg))) {
            console.warn("User session no longer valid or API keys incorrect:", errorMessage, "Logging out locally.");
            await signOut(); // Perform local and attempt server logout
            return false;
        }
        // For other errors, it might be a temporary network issue.
        // If user object exists locally, we might still consider them "connected" for UI purposes,
        // but further calls might fail. For now, let's assume valid if user object exists and error is not auth-related.
        console.warn("API call failed during connected check, but might not be an auth error. User object exists locally.", errorMessage, error.originalErrorObject || error);
        return true; // Or false, depending on how strictly you want to handle this
    }
  }
  // No local user session
  return false;
}

console.log('Telegram service (telegramService.ts) loaded with API class wrapper and update listeners.');
if (API_ID === undefined || !API_HASH) {
  console.error("CRITICAL: Telegram API_ID or API_HASH is not configured correctly in .env.local. Service will not function. Ensure NEXT_PUBLIC_TELEGRAM_API_ID and NEXT_PUBLIC_TELEGRAM_API_HASH are set and the dev server was restarted.");
}

// For debugging in browser console
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  (window as any).telegramServiceApi = api;
  (window as any).telegramUserSession = userSession;
}
