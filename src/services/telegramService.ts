
'use client';

import MTProto from '@mtproto/core/envs/browser';
import type { CloudFolder, CloudFile, GetChatsPaginatedResponse, MediaHistoryResponse } from '@/types';

const API_ID_STRING = process.env.NEXT_PUBLIC_TELEGRAM_API_ID;
const API_HASH = process.env.NEXT_PUBLIC_TELEGRAM_API_HASH;

let API_ID: number | undefined = undefined;

if (API_ID_STRING) {
  API_ID = parseInt(API_ID_STRING, 10);
  if (isNaN(API_ID)) {
    const errorMessage = 'CRITICAL: NEXT_PUBLIC_TELEGRAM_API_ID is not a valid number. Real connection will fail. Please ensure it is a number in your .env.local file and you have restarted your development server.';
    console.error(errorMessage);
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
      });
      console.log('MTProto client initialized successfully in API class for browser environment.');

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
            return this.call(method, params, options); 
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

            if (type === 'PHONE') { 
              console.log(`Setting default DC to ${dcId} due to PHONE_MIGRATE.`);
              await this.mtproto.setDefaultDc(dcId);
            } else { 
              console.log(`Retrying ${method} with dcId ${dcId}.`);
              options = { ...options, dcId };
            }
            return this.call(method, params, options); 
        } else {
            console.error(`Could not parse migrate DC from: ${error_message}`);
        }
      }
      
      let processedError: Error;
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
      
      if (originalError !== processedError && typeof originalError === 'object' && originalError !== null) {
        (processedError as any).originalErrorObject = originalError;
      }
      return Promise.reject(processedError);
    }
  }
}

const api = new API(); 

let userSession: {
  phone?: string; 
  phone_code_hash?: string;
  user?: any;
  srp_id?: string; 
  srp_params?: { 
    g: number;
    p: Uint8Array;
    salt1: Uint8Array;
    salt2: Uint8Array;
    srp_B: Uint8Array;
  };
} = {};

const USER_SESSION_KEY = 'telegram_user_session';
const USER_PHONE_KEY = 'telegram_user_phone'; // Added for storing phone number

function saveUserToLocalStorage(user: any) {
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(USER_SESSION_KEY, JSON.stringify(user));
      if (userSession.phone) { 
        localStorage.setItem(USER_PHONE_KEY, userSession.phone);
      }
      console.log('User session (and phone) saved to localStorage.');
    } catch (e) {
      console.error('Error saving user session to localStorage:', e);
    }
  }
}

function loadUserFromLocalStorage(): any | null {
  if (typeof window !== 'undefined') {
    try {
      const storedUser = localStorage.getItem(USER_SESSION_KEY);
      const storedPhone = localStorage.getItem(USER_PHONE_KEY); // Load phone
      if (storedUser) {
        const parsedUser = JSON.parse(storedUser);
        if (storedPhone) { // If phone was stored, restore it to userSession
            userSession.phone = storedPhone; 
        }
        console.log('User session (and phone) loaded from localStorage.');
        return parsedUser;
      }
    } catch (e) {
      console.error('Error loading user session from localStorage:', e);
      localStorage.removeItem(USER_SESSION_KEY); 
      localStorage.removeItem(USER_PHONE_KEY); // Clear phone too
    }
  }
  return null;
}

export function getUserSessionDetails(): { phone?: string; user?: any } {
    // Ensure userSession.phone is available if userSession.user is
    // This is useful for display purposes on the UI if the user reloads
    if (userSession.user && !userSession.phone && typeof window !== 'undefined') {
        const storedPhone = localStorage.getItem(USER_PHONE_KEY);
        if (storedPhone) userSession.phone = storedPhone;
    }
    return { phone: userSession.phone, user: userSession.user };
}


if (typeof window !== 'undefined') {
    const loadedUser = loadUserFromLocalStorage();
    if (loadedUser) {
        userSession.user = loadedUser;
    }
}

export async function sendCode(fullPhoneNumber: string): Promise<string> {
  userSession = { phone: fullPhoneNumber }; 
  console.log(`Attempting to send code to ${fullPhoneNumber} via API class`);

  const sendCodePayload = {
    phone_number: fullPhoneNumber,
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
    console.error('Error in sendCode function after api.call:', error.message, (error as any).originalErrorObject || error);
    const message = error.message || 'Failed to send code.';
     if (message === 'AUTH_RESTART' || (error.originalErrorObject?.error_message === 'AUTH_RESTART')) {
         throw new Error('AUTH_RESTART');
    }
    throw new Error(message);
  }
}

export async function signIn(fullPhoneNumber: string, code: string): Promise<{ user?: any; error?: string; srp_id?: string }> {
  if (!userSession.phone_code_hash) {
    console.error('phone_code_hash missing for signIn. Call sendCode first.');
    throw new Error('phone_code_hash not set. Call sendCode first.');
  }
  if (userSession.phone !== fullPhoneNumber) {
    console.warn(`Phone number mismatch: session has ${userSession.phone}, trying to sign in with ${fullPhoneNumber}. Using session phone: ${userSession.phone}.`);
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
    delete userSession.phone_code_hash; 
    return { user: result.user };

  } catch (error: any) {
    const errorMessage = error.message || (error.originalErrorObject?.error_message);
    console.warn('Error in signIn function after api.call:', errorMessage, error.originalErrorObject || error);

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
        
        userSession.srp_id = passwordData.srp_id.toString(); 
        userSession.srp_params = { 
            g: passwordData.current_algo.g,
            p: passwordData.current_algo.p, 
            salt1: passwordData.current_algo.salt1, 
            salt2: passwordData.current_algo.salt2, 
            srp_B: passwordData.srp_B 
        };
        
        delete userSession.phone_code_hash; // Crucial to delete before throwing 2FA_REQUIRED

        const twoFactorError: any = new Error('2FA_REQUIRED');
        twoFactorError.srp_id = userSession.srp_id; 
        throw twoFactorError;

      } catch (getPasswordError: any) {
        // Check if it's the expected 2FA_REQUIRED error re-thrown from above
        if (getPasswordError.message === '2FA_REQUIRED' && getPasswordError.srp_id) {
          console.log('2FA required, password details fetched. srp_id:', getPasswordError.srp_id);
        } else {
          // For any other error during getPassword
          console.error('Error fetching password details for 2FA:', getPasswordError.message, getPasswordError.originalErrorObject || getPasswordError);
        }
        delete userSession.phone_code_hash; // Ensure it's cleared in all error paths within getPassword
        throw getPasswordError; // Re-throw to be caught by page.tsx or propagate original error
      }
    }
    delete userSession.phone_code_hash; 
    throw new Error(errorMessage || 'Failed to sign in.');
  }
}


export async function checkPassword(password: string): Promise<any> {
  if (!userSession.srp_id || !userSession.srp_params) {
    console.error("SRP parameters not available for checkPassword. 2FA flow not properly initiated or srp_params missing.");
    delete userSession.srp_params;
    delete userSession.srp_id;
    throw new Error('SRP parameters not available. Please try the login process again.');
  }

  try {
    const { g, p, salt1, salt2, srp_B } = userSession.srp_params;
    console.log("Attempting to get SRPParams for checkPassword with provided password and stored srp_params using api.mtproto.crypto.getSRPParams.");
    
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
            srp_id: userSession.srp_id, 
            A: A, 
            M1: M1, 
        }
    });

    console.log('2FA password check result:', checkResult);
    if (checkResult.user) {
        userSession.user = checkResult.user;
        saveUserToLocalStorage(userSession.user); 
    }
    delete userSession.srp_params;
    delete userSession.srp_id;
    return checkResult.user;

  } catch (error: any) {
    console.error('Error checking password:', error.message, error.originalErrorObject || error);
    delete userSession.srp_params;
    delete userSession.srp_id;

    const message = error.message || (error.originalErrorObject?.error_message || 'Failed to check 2FA password.');
    if (message === 'PASSWORD_HASH_INVALID') {
        throw new Error('Invalid password. Please try again. (PASSWORD_HASH_INVALID)');
    }
    if (message === 'SRP_ID_INVALID') {
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
  offsetId: number = 0 
): Promise<MediaHistoryResponse> {
  if (!userSession.user) {
    console.warn('User not signed in. Cannot fetch chat media history.');
    return { files: [], hasMore: false, nextOffsetId: offsetId };
  }
  if (!inputPeer) {
    console.warn('Input peer is missing. Cannot fetch chat media history.');
    return { files: [], hasMore: false, nextOffsetId: offsetId };
  }

  console.log('Fetching chat media history with params:', { inputPeer, limit, offsetId });
  try {
    const historyResult = await api.call('messages.getHistory', {
      peer: inputPeer,
      offset_id: offsetId,
      offset_date: 0, 
      add_offset: 0, 
      limit: limit,
      max_id: 0, 
      min_id: 0, 
      hash: 0,   
    });

    console.log('Chat media history raw result:', historyResult);

    const mediaFiles: CloudFile[] = [];
    let newOffsetId: number | undefined = offsetId; 
    let hasMore = false;

    if (historyResult.messages && historyResult.messages.length > 0) {
      historyResult.messages.forEach((msg: any) => {
        // Only process messages that are messageMediaPhoto or messageMediaDocument
        if (msg.media && (msg.media._ === 'messageMediaPhoto' || msg.media._ === 'messageMediaDocument')) {
          let fileType: CloudFile['type'] = 'unknown';
          let fileName = `file_${msg.id}`;
          let fileSize: string | undefined;
          let dataAiHint: string | undefined;
          
          if (msg.media._ === 'messageMediaPhoto' && msg.media.photo) {
            fileType = 'image';
            fileName = `photo_${msg.id}.jpg`; 
            const photoDetails = historyResult.photos?.find((p:any) => p.id?.toString() === msg.media.photo.id?.toString());
            if (photoDetails && photoDetails.sizes) {
                const largestSize = photoDetails.sizes.sort((a:any,b:any) => (b.w*b.h) - (a.w*a.h))[0];
                if(largestSize && largestSize.size) fileSize = formatFileSize(largestSize.size);
            }
            dataAiHint = "photograph image";
          } else if (msg.media._ === 'messageMediaDocument' && msg.media.document) {
            const docDetails = historyResult.documents?.find((d:any) => d.id?.toString() === msg.media.document.id?.toString());
            if (docDetails) {
                fileName = docDetails.attributes?.find((attr: any) => attr._ === 'documentAttributeFilename')?.file_name || `document_${msg.id}`;
                fileSize = docDetails.size ? formatFileSize(docDetails.size) : undefined;
                if (docDetails.mime_type?.startsWith('image/')) {
                    fileType = 'image';
                    dataAiHint = "graphic image";
                } else if (docDetails.mime_type?.startsWith('video/')) {
                    fileType = 'video';
                    dataAiHint = "video clip";
                } else if (docDetails.mime_type?.startsWith('audio/')) {
                    fileType = 'audio';
                    dataAiHint = "audio recording";
                } else {
                    fileType = 'document';
                    dataAiHint = "document file";
                }
            }
          }
          
          // Ensure we only add if a valid fileType was determined (not 'unknown' unless it has a size from document)
          if (fileType !== 'unknown' || (fileType === 'unknown' && fileSize)) {
            mediaFiles.push({
              id: msg.id.toString(),
              messageId: msg.id,
              name: fileName,
              type: fileType,
              size: fileSize,
              lastModified: new Date(msg.date * 1000).toLocaleDateString(),
              dataAiHint: dataAiHint,
              telegramMessage: msg, 
            });
          }
        }
      });

      if (mediaFiles.length > 0) { 
        newOffsetId = mediaFiles[mediaFiles.length - 1].messageId;
      } else if (historyResult.messages.length > 0) { 
        newOffsetId = historyResult.messages[historyResult.messages.length - 1].id;
      }
      
      hasMore = historyResult.messages.length === limit; // More accurately, hasMore is true if the API potentially has more items.
                                                        // If we filtered all `limit` messages out, hasMore could still be true.
    } else {
        hasMore = false; 
    }
    
    return {
      files: mediaFiles, // mediaFiles already contains only the filtered items
      nextOffsetId: newOffsetId,
      hasMore: hasMore, 
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
      hash: 0, 
    });
    console.log('Dialogs raw result:', dialogsResult);

    const transformedFolders = transformDialogsToCloudFolders(dialogsResult);

    let newOffsetDate = offsetDate;
    let newOffsetId = offsetId;
    let newOffsetPeerInput = offsetPeer; 
    let hasMore = false;

    if (dialogsResult.dialogs && dialogsResult.dialogs.length > 0) {
      hasMore = dialogsResult.dialogs.length === limit;

      if (hasMore) {
        const lastDialog = dialogsResult.dialogs[dialogsResult.dialogs.length - 1];
        newOffsetId = lastDialog.top_message; 
        newOffsetPeerInput = lastDialog.peer; 

        if (newOffsetPeerInput._ === 'peerUser') {
            const user = dialogsResult.users.find((u:any) => u.id?.toString() === newOffsetPeerInput.user_id?.toString());
            if (user) {
                 newOffsetPeerInput = { _: 'inputPeerUser', user_id: user.id, access_hash: user.access_hash };
            } else {
                console.warn("Could not find user for peerUser offset, peer:", newOffsetPeerInput);
                newOffsetPeerInput = { _: 'inputPeerEmpty' }; 
            }
        } else if (newOffsetPeerInput._ === 'peerChat') {
             newOffsetPeerInput = { _: 'inputPeerChat', chat_id: newOffsetPeerInput.chat_id };
        } else if (newOffsetPeerInput._ === 'peerChannel') {
            const chat = dialogsResult.chats.find((c:any) => c.id?.toString() === newOffsetPeerInput.channel_id?.toString());
             if (chat) {
                newOffsetPeerInput = { _: 'inputPeerChannel', channel_id: chat.id, access_hash: chat.access_hash };
            } else {
                console.warn("Could not find channel for peerChannel offset, peer:", newOffsetPeerInput);
                newOffsetPeerInput = { _: 'inputPeerEmpty' }; 
            }
        } else {
            console.warn("Unknown peer type for offset, peer:", newOffsetPeerInput);
            newOffsetPeerInput = { _: 'inputPeerEmpty' }; 
        }

        const messages = dialogsResult.messages || [];
        const lastMessageDetails = messages.find((msg: any) => msg.id?.toString() === newOffsetId?.toString() &&
          ( (msg.peer_id?.user_id?.toString() === lastDialog.peer.user_id?.toString()) ||
            (msg.peer_id?.chat_id?.toString() === lastDialog.peer.chat_id?.toString()) ||
            (msg.peer_id?.channel_id?.toString() === lastDialog.peer.channel_id?.toString())
          )
        );

        if (lastMessageDetails && typeof lastMessageDetails.date === 'number') {
          newOffsetDate = lastMessageDetails.date;
        } else {
          console.warn("Could not determine nextOffsetDate accurately for main chat list. Last dialog:", lastDialog, "Found message:", lastMessageDetails);
        }
      }
    } else {
        hasMore = false; 
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
    if(peer.user_id) return `User ${peer.user_id.toString()}`; 
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
            const user = users.find((u:any) => u.id?.toString() === peerId);
            if (user) {
                inputPeer = { _: 'inputPeerUser', user_id: user.id, access_hash: user.access_hash };
            }
        } else if (peer._ === 'peerChat') {
            peerId = peer.chat_id?.toString();
            const chatAssociated = chats.find((c:any) => c.id?.toString() === peerId);
            if (chatAssociated) { 
                inputPeer = { _: 'inputPeerChat', chat_id: chatAssociated.id };
            }
        } else if (peer._ === 'peerChannel') {
            peerId = peer.channel_id?.toString();
            const chatAssociated = chats.find((c:any) => c.id?.toString() === peerId); 
            if (chatAssociated) { 
                inputPeer = { _: 'inputPeerChannel', channel_id: chatAssociated.id, access_hash: chatAssociated.access_hash };
            }
        }
    } catch (e) {
        console.error("Error constructing inputPeer for dialog:", dialog, e);
    }


    if (!peerId || !inputPeer) { 
        console.warn("Could not determine peerId or valid inputPeer for dialog:", dialog.peer, "Peer Data:", peer, "InputPeer attempt:", inputPeer);
        return null; 
    }

    const uniqueSuffix = dialog.top_message?.toString() || Date.now().toString(); 
    const folderIdBase = `chat-${peerId}-${uniqueSuffix}`;


    return {
      id: folderIdBase,
      name: chatTitle,
      isChatFolder: true,
      inputPeer: inputPeer, 
      files: [], 
      folders: [], 
    };
  }).filter(folder => folder !== null) as CloudFolder[]; 
}


export async function signOut(): Promise<void> {
  try {
    await api.call('auth.logOut');
    console.log('Signed out successfully from Telegram server.');
  } catch (error: any) {
    console.error('Error signing out from Telegram server:', error.message, error.originalErrorObject || error);
  } finally {
    userSession = {}; 
    if (typeof window !== 'undefined') {
      localStorage.removeItem(USER_SESSION_KEY); 
      localStorage.removeItem(USER_PHONE_KEY);
      try {
        if (api && api.mtproto && typeof (api.mtproto as any).clearStorage === 'function') {
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
  if (userSession.user) {
    try {
        await api.call('users.getUsers', {id: [{_: 'inputUserSelf'}]});
        console.log("User session is active (checked with users.getUsers).");
        return true;
    } catch (error: any) {
        const errorMessage = error.message || error.originalErrorObject?.error_message;
        const authErrorMessages = ['AUTH_KEY_UNREGISTERED', 'USER_DEACTIVATED', 'SESSION_REVOKED', 'SESSION_EXPIRED', 'API_ID_INVALID', 'API_KEY_INVALID', 'AUTH_RESTART'];

        if (errorMessage && authErrorMessages.some(authMsg => errorMessage.includes(authMsg))) {
            console.warn("User session no longer valid or API keys incorrect:", errorMessage, "Logging out locally.");
            await signOut(); 
            return false;
        }
        console.warn("API call failed during connected check, but might not be an auth error. User object exists locally.", errorMessage, error.originalErrorObject || error);
        return true; 
    }
  }
  return false;
}

console.log('Telegram service (telegramService.ts) loaded with API class wrapper and update listeners.');
if (API_ID === undefined || !API_HASH) {
  console.error("CRITICAL: Telegram API_ID or API_HASH is not configured correctly in .env.local. Service will not function. Ensure NEXT_PUBLIC_TELEGRAM_API_ID and NEXT_PUBLIC_TELEGRAM_API_HASH are set and the dev server was restarted.");
}

if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  (window as any).telegramServiceApi = api;
  (window as any).telegramUserSession = userSession;
}

    