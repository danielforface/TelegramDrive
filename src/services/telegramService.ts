
'use client';

import MTProto from '@mtproto/core/envs/browser';
import type { CloudFolder, CloudFile, GetChatsPaginatedResponse, MediaHistoryResponse, FileDownloadInfo, FileChunkResponse } from '@/types';

const API_ID_STRING = process.env.NEXT_PUBLIC_TELEGRAM_API_ID;
const API_HASH = process.env.NEXT_PUBLIC_TELEGRAM_API_HASH;

let API_ID: number | undefined = undefined;

if (API_ID_STRING) {
  API_ID = parseInt(API_ID_STRING, 10);
  if (isNaN(API_ID)) {
    const errorMessage = "CRITICAL: NEXT_PUBLIC_TELEGRAM_API_ID is not a valid number. Real connection will fail. \n" +
                         "Please ensure it is a number in your .env.local file and you have restarted your development server. \n" +
                         "Example: NEXT_PUBLIC_TELEGRAM_API_ID=123456";
    console.error(errorMessage);
    API_ID = undefined;
  }
} else {
   const envErrorMsg = "CRITICAL: NEXT_PUBLIC_TELEGRAM_API_ID is not set in environment variables. Real connection will fail. \n" +
                      "Please create a .env.local file in the root of your project and add: \n" +
                      "NEXT_PUBLIC_TELEGRAM_API_ID=YOUR_API_ID_HERE \n" +
                      "NEXT_PUBLIC_TELEGRAM_API_HASH=YOUR_API_HASH_HERE \n" +
                      "You MUST restart your development server after creating or modifying the .env.local file.";
  console.warn(envErrorMsg);
}

if (!API_HASH) {
  const envErrorMsg = "CRITICAL: NEXT_PUBLIC_TELEGRAM_API_HASH is not set in environment variables. Real connection will fail. \n" +
                      "Please ensure it is set in your .env.local file and you have restarted your development server. \n" +
                      "Example: NEXT_PUBLIC_TELEGRAM_API_HASH=your_actual_api_hash";
  console.warn(envErrorMsg);
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
    console.log(`API Call: ${method}`, params, options);
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

            if (type === 'PHONE' || type === 'NETWORK' || type === 'USER') { // NETWORK and USER migrate also require setDefaultDc
              console.log(`Setting default DC to ${dcId} due to ${type}_MIGRATE.`);
              await this.mtproto.setDefaultDc(dcId);
            } else { // For FILE_MIGRATE etc., pass dcId in options for this call
              console.log(`Retrying ${method} with dcId ${dcId}.`);
              options = { ...options, dcId };
            }
            return this.call(method, params, options); // Retry the call
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
const USER_PHONE_KEY = 'telegram_user_phone';

function saveUserDataToLocalStorage() {
  if (typeof window !== 'undefined') {
    try {
      if (userSession.user) {
        localStorage.setItem(USER_SESSION_KEY, JSON.stringify(userSession.user));
      } else {
        localStorage.removeItem(USER_SESSION_KEY);
      }
      if (userSession.phone) {
        localStorage.setItem(USER_PHONE_KEY, userSession.phone);
      } else {
        localStorage.removeItem(USER_PHONE_KEY);
      }
      console.log('User data (user object and phone) state synced with localStorage.');
    } catch (e) {
      console.error('Error saving user data to localStorage:', e);
    }
  }
}

function loadUserDataFromLocalStorage() {
  if (typeof window !== 'undefined') {
    try {
      const storedUser = localStorage.getItem(USER_SESSION_KEY);
      const storedPhone = localStorage.getItem(USER_PHONE_KEY);
      if (storedUser) {
        userSession.user = JSON.parse(storedUser);
        console.log('User object loaded from localStorage.');
      }
      if (storedPhone) {
        userSession.phone = storedPhone;
        console.log('User phone loaded from localStorage.');
      }
    } catch (e) {
      console.error('Error loading user data from localStorage:', e);
      localStorage.removeItem(USER_SESSION_KEY);
      localStorage.removeItem(USER_PHONE_KEY);
    }
  }
}

if (typeof window !== 'undefined') {
    loadUserDataFromLocalStorage();
}

export function getUserSessionDetails(): { phone?: string; user?: any } {
    if (userSession.user && !userSession.phone && typeof window !== 'undefined') {
        const storedPhone = localStorage.getItem(USER_PHONE_KEY);
        if (storedPhone) userSession.phone = storedPhone;
    }
    return { phone: userSession.phone, user: userSession.user };
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
    console.error('Error in sendCode function after api.call:', error.message, error.originalErrorObject || error);
    const message = error.message || 'Failed to send code.';
     if (message === 'AUTH_RESTART') {
         throw new Error('AUTH_RESTART');
    }
    throw error; 
  }
}

export async function signIn(fullPhoneNumber: string, code: string): Promise<{ user?: any; error?: string; srp_id?: string }> {
  if (!userSession.phone_code_hash) {
    console.warn('phone_code_hash not set in signIn. User might need to restart.');
    throw new Error('AUTH_RESTART');
  }
  if (!userSession.phone) userSession.phone = fullPhoneNumber;

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
        saveUserDataToLocalStorage();
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

        delete userSession.phone_code_hash; 

        const twoFactorError: any = new Error('2FA_REQUIRED');
        twoFactorError.srp_id = userSession.srp_id;
        throw twoFactorError;

      } catch (getPasswordError: any) {
        if (getPasswordError.message === '2FA_REQUIRED' && getPasswordError.srp_id) {
          console.log('2FA required, password details fetched. srp_id:', getPasswordError.srp_id);
        } else {
          console.error('Error fetching password details for 2FA:', getPasswordError.message, getPasswordError.originalErrorObject || getPasswordError);
        }
        delete userSession.phone_code_hash;
        if (getPasswordError.message === '2FA_REQUIRED' && getPasswordError.srp_id) throw getPasswordError;
        const message = getPasswordError.message || 'Failed to fetch 2FA details.';
        throw new Error(message);
      }
    }
    delete userSession.phone_code_hash;
    throw error;
  }
}


export async function checkPassword(password: string): Promise<any> {
  if (!userSession.srp_id || !userSession.srp_params) {
    console.error('SRP parameters not available for checkPassword. User might need to restart login.');
    throw new Error('AUTH_RESTART');
  }

  try {
    const { g, p, salt1, salt2, srp_B } = userSession.srp_params;
    console.log("Attempting to get SRPParams for checkPassword with provided password and stored srp_params.");
    
    // @ts-ignore MTProto.crypto.getSRPParams might not be in the default MTProto type
    const { A, M1 } = await api.mtproto.crypto.getSRPParams({
        g, p, salt1, salt2, gB: srp_B, password,
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
        saveUserDataToLocalStorage();
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
    throw error;
  }
}

export async function signOut(): Promise<void> {
  try {
    if (api && api.mtproto) { 
        await api.call('auth.logOut');
        console.log('Signed out successfully from Telegram server.');
    } else {
        console.warn('MTProto client not initialized, cannot call auth.logOut.');
    }
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
        } else {
          console.log('api.mtproto.clearStorage not found or not a function.');
        }
      } catch (e) {
        console.error('Error trying to clear mtproto-core storage:', e);
      }
      console.log('Local userSession object and localStorage data (user, phone) cleared.');
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
        const authErrorMessages = [
            'AUTH_KEY_UNREGISTERED', 'USER_DEACTIVATED', 'SESSION_REVOKED',
            'SESSION_EXPIRED', 'API_ID_INVALID', 'AUTH_RESTART'
        ];

        if (errorMessage && authErrorMessages.some(authMsg => errorMessage.includes(authMsg))) {
            console.warn("User session no longer valid or API keys incorrect due to:", errorMessage, "Performing local logout.");
            await signOut(); 
            return false;
        }
        console.warn("API call failed during connected check, but might not be an auth error. User object exists locally. Error:", errorMessage, error.originalErrorObject || error);
        return true; 
    }
  }
  return false;
}

function formatFileSize(bytesInput: number | string | undefined | null, decimals = 2): string {
  if (bytesInput === null || bytesInput === undefined) return 'N/A';
  const bytes = typeof bytesInput === 'string' ? parseInt(bytesInput, 10) : bytesInput;
  if (isNaN(bytes) || bytes === 0) return '0 Bytes';
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

    const mediaFiles: CloudFile[] = [];
    let newOffsetId: number = offsetId; 
    let hasMoreMessages = false;

    if (historyResult.messages && historyResult.messages.length > 0) {
      historyResult.messages.forEach((msg: any) => {
        if (msg.media && (msg.media._ === 'messageMediaPhoto' || msg.media._ === 'messageMediaDocument')) {
          let fileType: CloudFile['type'] = 'unknown';
          let fileName = `file_${msg.id}`;
          let fileSize: string | undefined;
          let dataAiHint: string | undefined;
          let totalSizeInBytes: number | undefined;
          
          let fullMediaObject = null;
          if (msg.media.photo && historyResult.photos) {
            fullMediaObject = historyResult.photos.find((p:any) => p.id?.toString() === msg.media.photo.id?.toString());
          } else if (msg.media.document && historyResult.documents) {
            fullMediaObject = historyResult.documents.find((d:any) => d.id?.toString() === msg.media.document.id?.toString());
          }
          const mediaDataForDetails = fullMediaObject || msg.media.photo || msg.media.document;

          if (msg.media._ === 'messageMediaPhoto' && mediaDataForDetails) {
            fileType = 'image';
            fileName = `photo_${mediaDataForDetails.id?.toString()}_${msg.date}.jpg`;
            const largestSize = mediaDataForDetails.sizes?.sort((a:any,b:any) => (b.w*b.h) - (a.w*a.h))[0];
            if(largestSize?.size) {
              totalSizeInBytes = largestSize.size;
              fileSize = formatFileSize(totalSizeInBytes);
            }
            dataAiHint = "photograph image";
          } else if (msg.media._ === 'messageMediaDocument' && mediaDataForDetails) {
              fileName = mediaDataForDetails.attributes?.find((attr: any) => attr._ === 'documentAttributeFilename')?.file_name || `document_${mediaDataForDetails.id?.toString()}`;
              if(mediaDataForDetails.size) {
                totalSizeInBytes = Number(mediaDataForDetails.size); 
                fileSize = formatFileSize(totalSizeInBytes);
              }

              if (mediaDataForDetails.mime_type?.startsWith('image/')) {
                  fileType = 'image'; dataAiHint = "graphic image";
              } else if (mediaDataForDetails.mime_type?.startsWith('video/')) {
                  fileType = 'video'; dataAiHint = "video clip";
              } else if (mediaDataForDetails.mime_type?.startsWith('audio/')) {
                  fileType = 'audio'; dataAiHint = "audio recording";
              } else {
                  fileType = 'document'; dataAiHint = "document file";
              }
          }
          
          if (fileType !== 'unknown' || (fileType === 'document' && mediaDataForDetails && totalSizeInBytes && totalSizeInBytes > 0)) {
            mediaFiles.push({
              id: msg.id.toString(),
              messageId: msg.id,
              name: fileName,
              type: fileType,
              size: fileSize,
              totalSizeInBytes: totalSizeInBytes,
              lastModified: new Date(msg.date * 1000).toLocaleDateString(),
              url: undefined, 
              dataAiHint: dataAiHint,
              telegramMessage: mediaDataForDetails, // Store the full media object (photo or document)
            });
          }
        }
      });

      if (historyResult.messages.length > 0) {
        newOffsetId = historyResult.messages[historyResult.messages.length - 1].id;
      }
      hasMoreMessages = historyResult.messages.length === limit;
    } else {
        hasMoreMessages = false;
    }

    return {
      files: mediaFiles,
      nextOffsetId: newOffsetId,
      hasMore: hasMoreMessages,
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

    const transformedFolders = transformDialogsToCloudFolders(dialogsResult);

    let newOffsetDate = offsetDate;
    let newOffsetId = offsetId;
    let newOffsetPeerInput = { ...offsetPeer }; 
    let hasMore = false;

    if (dialogsResult.dialogs && dialogsResult.dialogs.length > 0) {
      hasMore = dialogsResult.dialogs.length === limit;

      if (hasMore) {
        const lastDialog = dialogsResult.dialogs[dialogsResult.dialogs.length - 1];
        newOffsetId = lastDialog.top_message; 

        const peerForOffset = lastDialog.peer;
        if (peerForOffset._ === 'peerUser') {
            const user = dialogsResult.users.find((u:any) => u.id?.toString() === peerForOffset.user_id?.toString());
            if (user && user.access_hash) {
                 newOffsetPeerInput = { _: 'inputPeerUser', user_id: user.id, access_hash: user.access_hash };
            } else {
                console.warn('Could not find user or access_hash for peerUser offset:', peerForOffset, 'Users:', dialogsResult.users);
                newOffsetPeerInput = { _: 'inputPeerEmpty' }; 
            }
        } else if (peerForOffset._ === 'peerChat') {
             newOffsetPeerInput = { _: 'inputPeerChat', chat_id: peerForOffset.chat_id };
        } else if (peerForOffset._ === 'peerChannel') {
            const chat = dialogsResult.chats.find((c:any) => c.id?.toString() === peerForOffset.channel_id?.toString());
             if (chat && chat.access_hash) {
                newOffsetPeerInput = { _: 'inputPeerChannel', channel_id: chat.id, access_hash: chat.access_hash };
            } else {
                console.warn('Could not find channel or access_hash for peerChannel offset:', peerForOffset, 'Chats:', dialogsResult.chats);
                newOffsetPeerInput = { _: 'inputPeerEmpty' }; 
            }
        } else {
            console.warn('Unknown peer type for offset:', peerForOffset);
            newOffsetPeerInput = { _: 'inputPeerEmpty' }; 
        }
        
        const messages = dialogsResult.messages || [];
        const lastMessageDetails = messages.find((msg: any) => msg.id?.toString() === newOffsetId?.toString() &&
          ( (msg.peer_id?._ === 'peerUser' && msg.peer_id?.user_id?.toString() === peerForOffset.user_id?.toString()) ||
            (msg.peer_id?._ === 'peerChat' && msg.peer_id?.chat_id?.toString() === peerForOffset.chat_id?.toString()) ||
            (msg.peer_id?._ === 'peerChannel' && msg.peer_id?.channel_id?.toString() === peerForOffset.channel_id?.toString())
          )
        );
        
        if (lastMessageDetails && typeof lastMessageDetails.date === 'number') {
          newOffsetDate = lastMessageDetails.date;
        } else if (hasMore) { 
            console.warn("Could not determine precise next offset_date for pagination from message details.");
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
  return 'Invalid Peer Data';
}

function transformDialogsToCloudFolders(dialogsResult: any): CloudFolder[] {
  const { dialogs, chats, users } = dialogsResult;

  if (!dialogs || !Array.isArray(dialogs)) {
    return [];
  }

  return dialogs.map((dialog: any): CloudFolder | null => {
    if (!dialog || !dialog.peer) {
      return null;
    }
    const peer = dialog.peer;
    const chatTitle = getPeerTitle(peer, chats || [], users || []);
    let peerId: string | undefined;
    let inputPeerForHistory: any | undefined;

    try {
        const peerUserIdStr = peer.user_id?.toString();
        const peerChatIdStr = peer.chat_id?.toString();
        const peerChannelIdStr = peer.channel_id?.toString();

        if (peer._ === 'peerUser' && peerUserIdStr) {
            peerId = peerUserIdStr;
            const user = users?.find((u:any) => u.id?.toString() === peerId);
            if (user && user.access_hash !== undefined) {
                inputPeerForHistory = { _: 'inputPeerUser', user_id: user.id, access_hash: user.access_hash };
            }
        } else if (peer._ === 'peerChat' && peerChatIdStr) {
            peerId = peerChatIdStr;
            inputPeerForHistory = { _: 'inputPeerChat', chat_id: peer.chat_id };
        } else if (peer._ === 'peerChannel' && peerChannelIdStr) {
            peerId = peerChannelIdStr;
            const chatAssociated = chats?.find((c:any) => c.id?.toString() === peerId);
            if (chatAssociated && chatAssociated.access_hash !== undefined) {
                inputPeerForHistory = { _: 'inputPeerChannel', channel_id: chatAssociated.id, access_hash: chatAssociated.access_hash };
            }
        }
    } catch (e) {
        console.error("Error constructing inputPeer for dialog:", dialog, e);
    }

    if (!peerId || !inputPeerForHistory) {
        console.warn("Could not determine peerId or valid inputPeerForHistory for dialog:", dialog.peer);
        return null;
    }
    
    const folderIdBase = `chat-${peerId}-${dialog.top_message?.toString() || Date.now().toString()}`;

    return {
      id: folderIdBase,
      name: chatTitle,
      isChatFolder: true,
      inputPeer: inputPeerForHistory,
      files: [], 
      folders: [], 
    };
  }).filter(folder => folder !== null) as CloudFolder[];
}


export async function prepareFileDownloadInfo(file: CloudFile): Promise<FileDownloadInfo | null> {
  if (!file.telegramMessage) {
    console.error("Cannot prepare download: telegramMessage is missing from CloudFile.", file);
    return null;
  }

  const mediaObject = file.telegramMessage; // This should be the full photo or document object
  let location: any = null;
  let totalSize: number = 0;
  let mimeType: string = 'application/octet-stream';

  if (file.type === 'image' && mediaObject && mediaObject._ === 'photo') {
    if (mediaObject.id && mediaObject.access_hash && mediaObject.file_reference) {
      const largestSize = mediaObject.sizes?.find((s: any) => s.type === 'y') || 
                          mediaObject.sizes?.sort((a: any, b: any) => (b.w * b.h) - (a.w * a.h))[0];
      if (largestSize) {
        location = {
          _: 'inputPhotoFileLocation',
          id: mediaObject.id,
          access_hash: mediaObject.access_hash,
          file_reference: mediaObject.file_reference,
          thumb_size: largestSize.type || '',
        };
        totalSize = largestSize.size || 0;
        mimeType = 'image/jpeg';
      } else {
        console.warn("No sizes found for photo:", mediaObject);
      }
    } else {
      console.warn("Missing id, access_hash, or file_reference for photo:", mediaObject);
    }
  } else if ((file.type === 'document' || file.type === 'video' || file.type === 'audio') && mediaObject && mediaObject._ === 'document') {
    if (mediaObject.id && mediaObject.access_hash && mediaObject.file_reference) {
      location = {
        _: 'inputDocumentFileLocation',
        id: mediaObject.id,
        access_hash: mediaObject.access_hash,
        file_reference: mediaObject.file_reference,
        thumb_size: '', 
      };
      totalSize = Number(mediaObject.size) || 0;
      mimeType = mediaObject.mime_type || 'application/octet-stream';
    } else {
      console.warn("Missing id, access_hash, or file_reference for document:", mediaObject);
    }
  }


  if (location && totalSize > 0) {
    console.log('Prepared InputFileLocation for download:', location, 'Total size:', totalSize, 'MIME type:', mimeType);
    return { location, totalSize, mimeType };
  } else {
    console.error("Could not construct valid InputFileLocation or size for file:", file, "Media Object:", mediaObject);
    return null;
  }
}


export async function downloadFileChunk(
    location: any, 
    offset: number, 
    limit: number, 
    signal?: AbortSignal
): Promise<FileChunkResponse> {
  if (!location) {
    console.error("DownloadFileChunk: Location is missing.");
    return { errorType: 'OTHER' };
  }
  try {
    console.log(`Downloading chunk: offset=${offset}, limit=${limit}`, location);
    const result = await api.call('upload.getFile', {
      location: location,
      offset: offset,
      limit: limit,
      precise: true, 
      cdn_supported: true // Enable CDN support
    }, { signal }); 

    if (result._ === 'upload.fileCdnRedirect') {
      console.log("CDN Redirect received:", result);
      return {
        isCdnRedirect: true,
        cdnRedirectData: {
          dc_id: result.dc_id,
          file_token: result.file_token,
          encryption_key: result.encryption_key,
          encryption_iv: result.encryption_iv,
          file_hashes: result.file_hashes,
        }
      };
    }

    if (result && result._ === 'upload.file' && result.bytes) {
      return { bytes: result.bytes, type: result.type?._ || 'storage.fileUnknown' };
    }
    console.warn("upload.getFile did not return expected data (upload.file or upload.fileCdnRedirect).", result);
    return { errorType: 'OTHER' };
  } catch (error: any) {
    if (error.name === 'AbortError') {
      console.log('Download chunk aborted.');
      // No specific errorType needed, the AbortController handles this
      return {}; 
    }
    console.error('Error downloading file chunk:', error.message, error.originalErrorObject || error);
    if (error.message?.includes('FILE_REFERENCE_EXPIRED')) {
      return { errorType: 'FILE_REFERENCE_EXPIRED' };
    }
    // Note: FILE_MIGRATE_X should be handled by API.call automatically.
    // If it's not, we might need to catch it here and re-throw or signal.
    return { errorType: 'OTHER' };
  }
}

export async function downloadCdnFileChunk(
  cdnRedirectData: NonNullable<FileChunkResponse['cdnRedirectData']>,
  offset: number,
  limit: number,
  signal?: AbortSignal
): Promise<FileChunkResponse> {
  console.log('Downloading CDN chunk:', { dcId: cdnRedirectData.cdnDcId, offset, limit });
  try {
    const result = await api.call('upload.getCdnFile', {
      file_token: cdnRedirectData.file_token,
      offset: offset,
      limit: limit,
    }, { dcId: cdnRedirectData.dc_id, signal }); // Call on the specific CDN DC

    if (result && result._ === 'upload.cdnFile' && result.bytes) {
      // TODO: CDN chunks might need decryption using cdnRedirectData.encryption_key and cdnRedirectData.encryption_iv
      // TODO: CDN chunks should be verified using upload.getCdnFileHashes and cdnRedirectData.file_hashes
      // For now, returning raw bytes for simplicity
      console.log(`CDN Chunk received, ${result.bytes.length} bytes. Decryption/Verification needed.`);
      return { bytes: result.bytes };
    }
    console.warn("upload.getCdnFile did not return expected data.", result);
    return { errorType: 'OTHER' };
  } catch (error: any) {
    if (error.name === 'AbortError') {
      console.log('CDN Download chunk aborted.');
      return {};
    }
    console.error('Error downloading CDN file chunk:', error.message, error.originalErrorObject || error);
    // CDN errors might also include things like TOKEN_INVALID, etc.
    return { errorType: 'OTHER' };
  }
}

// Placeholder for actual implementation
export async function refreshFileReference(item: CloudFile): Promise<any | null> {
  console.warn(`Attempting to refresh file reference for item ${item.id} (messageId: ${item.messageId}). Actual API call to get new message details is not fully implemented yet.`);
  
  if (!item.telegramMessage?.peer_id) { // Assuming peer_id is stored in telegramMessage
    console.error("Cannot refresh file reference: peer_id missing from telegramMessage", item.telegramMessage);
    return null;
  }
  
  // Construct InputPeer from the original message's peer_id
  // This is a simplified example; you'd need the access_hash if it's a user or channel not in current dialogs.
  // For simplicity, we assume the original inputPeer used to fetch the chat history is still valid for this.
  // Or, better, ensure CloudFile.inputPeer is populated if it's different from the main chat's inputPeer.

  // const inputPeerForMessage = item.telegramMessage.peer_id; // This might be just { _: 'peerUser', user_id: X }
  // A more robust way would be to find the full InputPeer from the original chat fetch context or store it with the file.
  // For this placeholder, we'll assume we need to re-fetch message details.

  try {
    // We need the peer of the chat the message belongs to, not necessarily item.telegramMessage.peer_id
    // This is tricky if we don't have the chat's inputPeer directly available.
    // Let's assume `item.inputPeer` was populated from the chat.
    if(!item.inputPeer) {
        console.error("Cannot refresh file reference, item.inputPeer is missing.");
        return null;
    }
    console.log("Calling messages.getMessages to refresh message details for messageId:", item.messageId, "from peer:", item.inputPeer)
    const messagesResult = await api.call('messages.getMessages', {
      id: [{ _: 'inputMessageID', id: item.messageId }],
    });

    console.log("messages.getMessages result:", messagesResult);

    const updatedMessage = messagesResult?.messages?.[0];
    if (updatedMessage?.media) {
      let newFileReference = null;
      if (updatedMessage.media.photo?.file_reference) {
        newFileReference = updatedMessage.media.photo.file_reference;
      } else if (updatedMessage.media.document?.file_reference) {
        newFileReference = updatedMessage.media.document.file_reference;
      }

      if (newFileReference) {
        console.log(`New file_reference found: ${newFileReference}`);
        // The calling function will update the item in downloadQueue
        return { ...item.telegramMessage, file_reference: newFileReference }; // Return updated media object
      } else {
        console.warn("No new file_reference found in updated message details.");
      }
    } else {
      console.warn("Could not find updated message or media in messages.getMessages response.");
    }
  } catch (error) {
    console.error("Error during refreshFileReference (messages.getMessages):", error);
  }
  return null; // Indicate failure
}


console.log('Telegram service (telegramService.ts) loaded.');
if (API_ID === undefined || !API_HASH) {
  console.error("CRITICAL: Telegram API_ID or API_HASH is not configured correctly in .env.local. Service will not function.");
}

if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  (window as any).telegramServiceApi = api;
  (window as any).telegramUserSession = userSession;
}
