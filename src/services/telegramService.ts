
'use client';

import MTProto from '@mtproto/core/envs/browser';
import type { CloudFolder, CloudFile, GetChatsPaginatedResponse, MediaHistoryResponse, FileDownloadInfo, FileChunkResponse, DownloadQueueItemType, FileHash as AppFileHash, DialogFilter, MessagesDialogFilters, ExtendedFile, CdnRedirectDataType } from '@/types';
import { formatFileSize } from '@/lib/utils'; 
import cryptoSha256 from '@cryptography/sha256'; 

export { formatFileSize };


const API_ID_STRING = process.env.NEXT_PUBLIC_TELEGRAM_API_ID;
const API_HASH = process.env.NEXT_PUBLIC_TELEGRAM_API_HASH;
const CRITICAL_ERROR_MESSAGE_PREFIX = "CRITICAL_TELEGRAM_API_ERROR: ";
const ALL_CHATS_FILTER_ID_FOR_SERVICE = 0; // Consistent with page.tsx

let API_ID: number | undefined = undefined;

if (API_ID_STRING) {
  API_ID = parseInt(API_ID_STRING, 10);
  if (isNaN(API_ID)) {
    const errorMessage = CRITICAL_ERROR_MESSAGE_PREFIX + "NEXT_PUBLIC_TELEGRAM_API_ID is not a valid number. Real connection will fail. \n" +
                         "Please ensure it is a number in your .env.local file and you have restarted your development server. \n" +
                         "Example: NEXT_PUBLIC_TELEGRAM_API_ID=123456";
    console.error(errorMessage);
    if (typeof window !== 'undefined') (window as any).telegramApiError = errorMessage;
    API_ID = undefined; 
  }
} else {
   const envErrorMsg = CRITICAL_ERROR_MESSAGE_PREFIX + "NEXT_PUBLIC_TELEGRAM_API_ID is not set in environment variables. Real connection will fail. \n" +
                      "Please create a .env.local file in the root of your project and add: \n" +
                      "NEXT_PUBLIC_TELEGRAM_API_ID=YOUR_API_ID_HERE \n" +
                      "NEXT_PUBLIC_TELEGRAM_API_HASH=YOUR_API_HASH_HERE \n" +
                      "You MUST restart your development server after creating or modifying the .env.local file.";
  console.warn(envErrorMsg);
  if (typeof window !== 'undefined') (window as any).telegramApiError = envErrorMsg;
}

if (!API_HASH && API_ID !== undefined) { 
  const envErrorMsg = CRITICAL_ERROR_MESSAGE_PREFIX + "NEXT_PUBLIC_TELEGRAM_API_HASH is not set in environment variables. Real connection will fail. \n" +
                      "Please ensure it is set in your .env.local file and you have restarted your development server. \n" +
                      "Example: NEXT_PUBLIC_TELEGRAM_API_HASH=your_actual_api_hash";
  console.warn(envErrorMsg);
   if (typeof window !== 'undefined' && !(window as any).telegramApiError) (window as any).telegramApiError = envErrorMsg;
}


function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

class API {
  public mtproto: MTProto;
  private initialized: boolean = false;
  private apiId: number;
  private apiHash: string;

  constructor() {
    if (API_ID === undefined || !API_HASH) {
      const errorMessage = (typeof window !== 'undefined' && (window as any).telegramApiError) || 
                           CRITICAL_ERROR_MESSAGE_PREFIX + "Telegram API_ID or API_HASH is missing or invalid. Service cannot be initialized.";
      console.error(errorMessage);
      this.mtproto = {
        call: async (method: string, params?: any, options?: any) => {
          console.error(`MTProto not initialized due to missing API_ID/Hash. Call to '${method}' aborted.`);
          const err = new Error(errorMessage);
          (err as any).originalErrorObject = { error_message: errorMessage, error_code: -1 };
          return Promise.reject(err);
        },
        updates: { on: () => {} }, 
        setDefaultDc: async () => Promise.reject(new Error(errorMessage)),
        clearStorage: async () => Promise.resolve(),
        mtproto: { crypto: { getSRPParams: async () => ({ A: new Uint8Array(), M1: new Uint8Array() }) } } // Mock crypto for constructor
      } as any; 
      this.apiId = 0; 
      this.apiHash = '';
      this.initialized = false; 
      return;
    }
    
    this.apiId = API_ID;
    this.apiHash = API_HASH;

    try {
      this.mtproto = new MTProto({
        api_id: this.apiId,
        api_hash: this.apiHash,
      });
      this.initialized = true;
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
        const errorMessage = CRITICAL_ERROR_MESSAGE_PREFIX + `Failed to initialize MTProto client in API class: ${initError.message || JSON.stringify(initError)}`;
        console.error(errorMessage, initError);
        if (typeof window !== 'undefined' && !(window as any).telegramApiError) (window as any).telegramApiError = errorMessage;
        this.mtproto = { 
            call: async (method: string, params?: any, options?: any) => {
              console.error(`MTProto failed to initialize. Call to '${method}' aborted.`);
              const err = new Error(errorMessage);
              (err as any).originalErrorObject = {error_message: errorMessage, error_code: -1};
              return Promise.reject(err);
            },
            updates: { on: () => {} },
            setDefaultDc: async () => Promise.reject(new Error(errorMessage)),
            clearStorage: async () => Promise.resolve(),
            mtproto: { crypto: { getSRPParams: async () => ({ A: new Uint8Array(), M1: new Uint8Array() }) } }
        } as any;
        this.initialized = false;
    }
  }

  async call(method: string, params: any = {}, options: any = {}): Promise<any> {
    if (!this.initialized || !this.mtproto || typeof this.mtproto.call !== 'function') {
      const initErrorMsg = (typeof window !== 'undefined' && (window as any).telegramApiError) || CRITICAL_ERROR_MESSAGE_PREFIX + "MTProto not properly initialized.";
      console.error(`API.call: MTProto not available. Call to '${method}' aborted. Params:`, params, "Options:", options);
      let err = new Error(initErrorMsg);
      (err as any).originalErrorObject = { error_message: initErrorMsg, error_code: -1 };
      return Promise.reject(err);
    }
    
    let originalErrorObject: any = null;

    try {
      console.log(`API Call: ${method}`, params, options);
      const result = await this.mtproto.call(method, params, options);
      return result;
    } catch (error: any) {
      originalErrorObject = JSON.parse(JSON.stringify(error)); // Deep clone the error object
      console.log(`MTProto call '${method}' raw error object:`, originalErrorObject, error);


      const { error_code, error_message } = originalErrorObject || {};

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

      const migrateErrorMatch = typeof error_message === 'string' && error_message.match(/([A-Z_]+)_MIGRATE_(\d+)/);
      if (error_code === 303 && migrateErrorMatch) {
        const type = migrateErrorMatch[1];
        const dcId = Number(migrateErrorMatch[2]);
        
        const criticalMethodsForDcChange = ['auth.sendCode', 'auth.signIn', 'auth.checkPassword', 'account.getPassword', 'users.getUsers'];
        if (type === 'PHONE' || type === 'NETWORK' || type === 'USER' || (criticalMethodsForDcChange.some(m => method.startsWith(m)) && type !== 'FILE') ) {
            try {
                console.log(`Attempting to set default DC to ${dcId} due to ${type}_MIGRATE error.`);
                await this.mtproto.setDefaultDc(dcId);
            } catch (setDefaultDcError: any) {
                console.error(`Failed to set default DC to ${dcId}:`, setDefaultDcError.message || setDefaultDcError);
                options = { ...options, dcId }; 
            }
        } else { // For FILE_MIGRATE and others, just set dcId in options for this call
             console.log(`Applying dcId ${dcId} to options for method ${method} due to ${type}_MIGRATE error.`);
            options = { ...options, dcId };
        }
        return this.call(method, params, options); 
      }
      
      let processedError: Error;
      if (error instanceof Error && error.message) {
        processedError = error;
      } else if (error_message) {
        processedError = new Error(error_message);
      } else {
        const authMethodsForClear = ['auth.sendCode', 'auth.signIn', 'auth.checkPassword'];
        if (authMethodsForClear.includes(method)) {
            console.warn(`Low-level or empty error during ${method}. Clearing potentially problematic local session parts.`);
            if(userSession) { 
                delete userSession.phone_code_hash;
                delete userSession.srp_id;
                delete userSession.srp_params;
            }
        }
        processedError = new Error(`MTProto call '${method}' failed. Raw error: ${JSON.stringify(error)}`);
      }
      
      if (originalErrorObject && (processedError as any).originalErrorObject !== originalErrorObject) {
        (processedError as any).originalErrorObject = originalErrorObject;
      }
      if (error_code && !(processedError as any).error_code) {
        (processedError as any).error_code = error_code;
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
      }
      if (storedPhone) {
        userSession.phone = storedPhone;
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
  saveUserDataToLocalStorage(); 
  console.log(`Attempting to send code to ${fullPhoneNumber} via API class`);

  const sendCodePayload = {
    phone_number: fullPhoneNumber,
    settings: {
      _: 'codeSettings',
    },
  };

  try {
    const result = await api.call('auth.sendCode', sendCodePayload);
    if (!result || !result.phone_code_hash) {
        console.error("Failed to send code: phone_code_hash not received or result is invalid.", result);
        throw new Error("Failed to send code: phone_code_hash not received from Telegram.");
    }
    userSession.phone_code_hash = result.phone_code_hash;
    return userSession.phone_code_hash;
  } catch (error: any) {
    console.error('Error in sendCode function after api.call:', error);
    const message = error.message || (error.originalErrorObject?.error_message || 'Failed to send code.');
     if (message === 'AUTH_RESTART') { 
         throw new Error('AUTH_RESTART');
    }
    throw new Error(message); 
  }
}

export async function signIn(fullPhoneNumber: string, code: string): Promise<{ user?: any; error?: string; srp_id?: string }> {
  if (!userSession.phone_code_hash) {
    console.warn("signIn called without phone_code_hash in session. Potentially an AUTH_RESTART scenario.");
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
      delete userSession.phone_code_hash;
      throw new Error('Sign up required. This app currently only supports sign in for existing accounts.');
    }

    if (result.user) {
        userSession.user = result.user;
        saveUserDataToLocalStorage();
    }
    delete userSession.phone_code_hash; 
    return { user: result.user };

  } catch (error: any) {
    const errorMessage = error.message || (error.originalErrorObject?.error_message); 
    
    if (errorMessage === 'SESSION_PASSWORD_NEEDED') {
      try {
        const passwordData = await api.call('account.getPassword');

        if (!passwordData || !passwordData.srp_id || !passwordData.current_algo || !passwordData.srp_B) {
             console.error("Failed to initialize 2FA: Missing critical SRP parameters from account.getPassword.", passwordData);
             delete userSession.phone_code_hash;
             throw new Error('Failed to initialize 2FA: Missing critical SRP parameters.');
        }

        userSession.srp_id = String(passwordData.srp_id); 
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
          throw getPasswordError; 
        }
        console.log('Error fetching password details for 2FA (signIn):', getPasswordError.message, getPasswordError.originalErrorObject || getPasswordError);
        delete userSession.phone_code_hash;
        const messageToThrow = getPasswordError.message || 'Failed to fetch 2FA details.';
        throw new Error(messageToThrow);
      }
    }
    delete userSession.phone_code_hash;
    throw error; 
  }
}


export async function checkPassword(password: string): Promise<any> {
  if (!userSession.srp_id || !userSession.srp_params || !api.mtproto.mtproto?.crypto?.getSRPParams) {
    delete userSession.srp_params;
    delete userSession.srp_id;
    throw new Error('AUTH_RESTART'); 
  }

  try {
    const { g, p, salt1, salt2, srp_B } = userSession.srp_params;
    
    if (!api.mtproto.mtproto?.crypto?.getSRPParams){
        throw new Error("SRP crypto methods not available on mtproto instance.");
    }
    const { A, M1 } = await api.mtproto.mtproto.crypto.getSRPParams({
        g, p, salt1, salt2, gB: srp_B, password,
    });
    
    const srp_id_as_string = String(userSession.srp_id);

    const checkResult = await api.call('auth.checkPassword', {
        password: {
            _: 'inputCheckPasswordSRP',
            srp_id: srp_id_as_string, 
            A: A, 
            M1: M1, 
        }
    });

    if (checkResult.user) {
        userSession.user = checkResult.user;
        saveUserDataToLocalStorage();
    }
    delete userSession.srp_params;
    delete userSession.srp_id;
    return checkResult.user;

  } catch (error: any) {
    const message = error.message || error.originalErrorObject?.error_message; 
    
    delete userSession.srp_params;
    delete userSession.srp_id;

    if (message === 'PASSWORD_HASH_INVALID') {
        throw new Error('Invalid password. Please try again. (PASSWORD_HASH_INVALID)');
    }
    if (message === 'SRP_ID_INVALID' || message?.includes('AUTH_RESTART') || message?.includes('SRP_METHOD_INVALID')) {
        throw new Error('Session for 2FA has expired or is invalid. Please try logging in again. (SRP_ID_INVALID or similar)');
    }
    throw error; 
  }
}

export async function signOut(): Promise<void> {
  try {
    if (api && api.mtproto && typeof api.mtproto.call === 'function' && api.initialized) {
        await api.call('auth.logOut');
    } 
  } catch (error: any) {
     console.warn('Error signing out from Telegram server (this is often expected if session was already invalid):', error.message);
  } finally {
    userSession = {}; 
    if (typeof window !== 'undefined') {
      localStorage.removeItem(USER_SESSION_KEY);
      localStorage.removeItem(USER_PHONE_KEY);
      try {
        if (api && api.mtproto && typeof api.mtproto.clearStorage === 'function' && api.initialized) {
          await api.mtproto.clearStorage();
        }
      } catch (e) {
         console.warn('Error trying to clear mtproto-core storage:', e);
      }
    }
  }
}

export async function isUserConnected(): Promise<boolean> {
  if (API_ID === undefined || !API_HASH) {
      if (userSession.user) await signOut(); 
      return false;
  }
  if (!api.initialized && (API_ID && API_HASH) ) {
      if (userSession.user) await signOut();
      return false;
  }

  if (userSession.user) { 
    try {
        await api.call('users.getUsers', {id: [{_: 'inputUserSelf'}]});
        return true;
    } catch (error: any) {
        const errorMessage = error.message || error.originalErrorObject?.error_message;
        const authErrorMessages = [
            'AUTH_KEY_UNREGISTERED', 'USER_DEACTIVATED', 'SESSION_REVOKED',
            'SESSION_EXPIRED', 'API_ID_INVALID', 'AUTH_RESTART', 'PHONE_CODE_INVALID', 
            'PHONE_NUMBER_INVALID', 'CONNECTION_API_ID_INVALID', 'Invalid hash in mt_dh_gen_ok'
        ];

        if (errorMessage && authErrorMessages.some(authMsg => errorMessage.includes(authMsg))) {
            console.warn(`User session invalid (${errorMessage}), signing out.`);
            await signOut(); 
            return false;
        }
         console.warn(`isUserConnected check failed with non-critical auth error, but user object exists. Error: ${errorMessage}. Treating as connected for now.`);
        return true; 
    }
  }
  return false;
}

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
    if(peer.user_id) return `User ${String(peer.user_id)}`;
    if(peer.chat_id) return `Chat ${String(peer.chat_id)}`;
    if(peer.channel_id) return `Channel ${String(peer.channel_id)}`;
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
    let inputPeerForApiCalls: any | undefined;

    const peerUserIdStr = peer.user_id ? String(peer.user_id) : undefined;
    const peerChatIdStr = peer.chat_id ? String(peer.chat_id) : undefined;
    const peerChannelIdStr = peer.channel_id ? String(peer.channel_id) : undefined;

    try {
        if (peer._ === 'peerUser' && peerUserIdStr) {
            const userAssociated = users?.find((u:any) => String(u.id) === peerUserIdStr);
            if (userAssociated && userAssociated.access_hash !== undefined) {
                inputPeerForApiCalls = { _: 'inputPeerUser', user_id: userAssociated.id, access_hash: userAssociated.access_hash };
            }
        } else if (peer._ === 'peerChat' && peerChatIdStr) {
            inputPeerForApiCalls = { _: 'inputPeerChat', chat_id: peer.chat_id };
        } else if (peer._ === 'peerChannel' && peerChannelIdStr) {
            const chatAssociated = chats?.find((c:any) => String(c.id) === peerChannelIdStr);
            if (chatAssociated && chatAssociated.access_hash !== undefined) {
                inputPeerForApiCalls = { _: 'inputPeerChannel', channel_id: chatAssociated.id, access_hash: chatAssociated.access_hash };
            }
        }
    } catch (e) {
         console.error("Error constructing inputPeer for dialog:", dialog, e);
    }

    if (!inputPeerForApiCalls) {
        return null; 
    }
    
    const idSuffix = peerUserIdStr || peerChatIdStr || peerChannelIdStr || String(dialog.top_message) || String(Date.now());
    const folderIdBase = `${inputPeerForApiCalls._}-${idSuffix}`;

    return {
      id: folderIdBase, 
      name: chatTitle,
      isChatFolder: true,
      inputPeer: inputPeerForApiCalls, 
      files: [], 
      folders: [], 
    };
  }).filter(folder => folder !== null) as CloudFolder[]; 
}

export async function getDialogFilters(): Promise<DialogFilter[]> {
  if (!(await isUserConnected())) {
    return [];
  }
  try {
    const result = await api.call('messages.getDialogFilters'); // result could be MessagesDialogFilters or directly DialogFilter[]
    console.log("Full result from messages.getDialogFilters:", result); 

    if (Array.isArray(result)) { // If result itself is the array of filters
      return result as DialogFilter[];
    } else if (result && Array.isArray(result.filters)) { // If result is an object containing a filters array (expected)
      return result.filters as DialogFilter[];
    } else {
      console.warn("Unexpected structure for messages.getDialogFilters response:", result);
      return []; // Return empty if structure is not as expected
    }
  } catch (error: any) {
    console.error('Error fetching dialog filters:', error.message, error.originalErrorObject || error);
    return []; // Return empty on error so UI doesn't get stuck loading
  }
}


export async function getTelegramChats(
  limit: number,
  offsetDate: number = 0,
  offsetId: number = 0,
  offsetPeer: any = { _: 'inputPeerEmpty' }, 
  folderId?: number 
): Promise<GetChatsPaginatedResponse> {
  if (!(await isUserConnected())) {
    return { folders: [], nextOffsetDate: 0, nextOffsetId: 0, nextOffsetPeer: { _: 'inputPeerEmpty' }, hasMore: false };
  }
  console.log(`Requesting chats for folderId: ${folderId === undefined || folderId === ALL_CHATS_FILTER_ID_FOR_SERVICE ? 'All Chats (no folder_id)' : folderId}`);

  const params: any = {
      offset_date: offsetDate,
      offset_id: offsetId,
      offset_peer: offsetPeer,
      limit: limit,
      hash: 0, 
  };

  if (folderId !== undefined && folderId !== ALL_CHATS_FILTER_ID_FOR_SERVICE) { 
      params.folder_id = folderId;
  }
  
  try {
    const dialogsResult = await api.call('messages.getDialogs', params);

    const transformedFolders = transformDialogsToCloudFolders(dialogsResult);

    let newOffsetDate = offsetDate;
    let newOffsetId = offsetId;
    let newOffsetPeerInput = { ...offsetPeer }; 
    let hasMore = false;

    if (dialogsResult.messages && dialogsResult.messages.length > 0) {
      hasMore = dialogsResult.messages.length >= limit; 
    
      if (dialogsResult.dialogs && dialogsResult.dialogs.length > 0) {
          const lastDialog = dialogsResult.dialogs[dialogsResult.dialogs.length - 1];
          const lastMessageInDialogs = dialogsResult.messages.find((m: any) => String(m.id) === String(lastDialog.top_message));

          if (lastMessageInDialogs) {
              newOffsetId = lastMessageInDialogs.id;
              newOffsetDate = lastMessageInDialogs.date;
              newOffsetPeerInput = lastDialog.peer; 
          } else if (dialogsResult.messages.length > 0) {
              const lastMessageOverall = dialogsResult.messages[dialogsResult.messages.length - 1];
              newOffsetId = lastMessageOverall.id;
              newOffsetDate = lastMessageOverall.date;
              if (lastMessageOverall.peer_id) {
                 if (lastMessageOverall.peer_id._ && (lastMessageOverall.peer_id._ === 'inputPeerUser' || lastMessageOverall.peer_id._ === 'inputPeerChat' || lastMessageOverall.peer_id._ === 'inputPeerChannel')) {
                    newOffsetPeerInput = lastMessageOverall.peer_id;
                 } else {
                    const correspondingDialog = dialogsResult.dialogs.find((d:any) => String(d.top_message) === String(lastMessageOverall.id));
                    newOffsetPeerInput = correspondingDialog ? correspondingDialog.peer : { _: 'inputPeerEmpty' };
                 }
              } else {
                 newOffsetPeerInput = { _: 'inputPeerEmpty' };
              }
          }
      } else {
          hasMore = false; 
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
    console.error('Error in getTelegramChats:', error.message, error.originalErrorObject || error);
    throw error;
  }
}

export async function getChatMediaHistory(
  inputPeer: any,
  limit: number,
  offsetId: number = 0
): Promise<MediaHistoryResponse> {
  if (!(await isUserConnected())) {
    return { files: [], hasMore: false, nextOffsetId: offsetId };
  }
  if (!inputPeer) {
    console.warn("getChatMediaHistory called without inputPeer");
    return { files: [], hasMore: false, nextOffsetId: offsetId };
  }

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

    const messagesArray = historyResult.messages || [];

    if (messagesArray && messagesArray.length > 0) {
      messagesArray.forEach((msg: any) => {
         if (msg.media && (msg.media._ === 'messageMediaPhoto' || msg.media._ === 'messageMediaDocument')) {
          let fileType: CloudFile['type'] = 'unknown';
          let fileName = `file_${msg.id}`;
          let fileSize: string | undefined;
          let dataAiHint: string | undefined;
          let totalSizeInBytes: number | undefined;
          let mediaObjectForFile: any = null;

          if (msg.media.photo && msg.media.photo.id) {
            mediaObjectForFile = historyResult.photos?.find((p:any) => String(p.id) === String(msg.media.photo.id)) || msg.media.photo;
          } else if (msg.media.document && msg.media.document.id) {
            mediaObjectForFile = historyResult.documents?.find((d:any) => String(d.id) === String(msg.media.document.id)) || msg.media.document;
          } else if (msg.media.photo) { 
             mediaObjectForFile = msg.media.photo;
          } else if (msg.media.document) { 
             mediaObjectForFile = msg.media.document;
          } else {
             return; 
          }

          if (msg.media._ === 'messageMediaPhoto' && mediaObjectForFile) {
            fileType = 'image';
            fileName = `photo_${mediaObjectForFile.id?.toString() || msg.id}_${msg.date}.jpg`;
            const largestSize = mediaObjectForFile.sizes?.find((s:any) => s.type === 'y') || 
                                mediaObjectForFile.sizes?.sort((a:any,b:any) => (b.w*b.h) - (a.w*a.h))[0];
            if(largestSize?.size) { 
              totalSizeInBytes = Number(largestSize.size);
              fileSize = formatFileSize(totalSizeInBytes);
            }
            dataAiHint = "photograph image";
          } else if (msg.media._ === 'messageMediaDocument' && mediaObjectForFile) {
              fileName = mediaObjectForFile.attributes?.find((attr: any) => attr._ === 'documentAttributeFilename')?.file_name || `document_${mediaObjectForFile.id?.toString() || msg.id}`;
              if(mediaObjectForFile.size) { 
                totalSizeInBytes = Number(mediaObjectForFile.size); 
                fileSize = formatFileSize(totalSizeInBytes);
              }

              if (mediaObjectForFile.mime_type?.startsWith('image/')) {
                  fileType = 'image'; dataAiHint = "graphic image";
              } else if (mediaObjectForFile.mime_type?.startsWith('video/')) {
                  fileType = 'video'; dataAiHint = "video clip";
              } else if (mediaObjectForFile.mime_type?.startsWith('audio/')) {
                  fileType = 'audio'; dataAiHint = "audio recording";
              } else {
                  fileType = 'document'; dataAiHint = "document file";
              }
          }
          
          if (fileType !== 'unknown' && mediaObjectForFile && totalSizeInBytes !== undefined && totalSizeInBytes > 0) {
             mediaFiles.push({
              id: String(msg.id), 
              messageId: msg.id,
              name: fileName,
              type: fileType,
              size: fileSize,
              totalSizeInBytes: totalSizeInBytes,
              timestamp: msg.date, 
              url: undefined, 
              dataAiHint: dataAiHint,
              telegramMessage: mediaObjectForFile, 
              inputPeer: inputPeer, 
            });
          }
        }
      });

      if (messagesArray.length > 0) {
        newOffsetId = messagesArray[messagesArray.length - 1].id;
      }
      if (typeof historyResult.count === 'number') {
        hasMoreMessages = mediaFiles.length > 0 && messagesArray.length >= limit; // Use >= to be safe
      } else {
        hasMoreMessages = messagesArray.length >= limit;
      }
    } else {
        hasMoreMessages = false; 
    }

    return {
      files: mediaFiles,
      nextOffsetId: newOffsetId,
      hasMore: hasMoreMessages,
    };

  } catch (error:any) {
    console.error('Error in getChatMediaHistory:', error.message, error.originalErrorObject || error);
    throw error;
  }
}


export async function prepareFileDownloadInfo(file: CloudFile): Promise<FileDownloadInfo | null> {
  if (!file.telegramMessage) {
    console.warn("prepareFileDownloadInfo: file.telegramMessage is missing for file:", file.name);
    return null;
  }

  const mediaObject = file.telegramMessage;
  let location: any = null;
  let totalSize: number = 0;
  let mimeType: string = 'application/octet-stream';

  if (mediaObject && mediaObject._ === 'photo') { 
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
        totalSize = Number(largestSize.size) || file.totalSizeInBytes || 0; 
        mimeType = 'image/jpeg'; 
      } else {
         console.warn("prepareFileDownloadInfo: No suitable size found for photo:", mediaObject.id);
      }
    } else {
        console.warn("prepareFileDownloadInfo: Missing id, access_hash, or file_reference for photo:", mediaObject);
    }
  } 
  else if (mediaObject && mediaObject._ === 'document') { 
    if (mediaObject.id && mediaObject.access_hash && mediaObject.file_reference) {
      location = {
        _: 'inputDocumentFileLocation',
        id: mediaObject.id,
        access_hash: mediaObject.access_hash,
        file_reference: mediaObject.file_reference, 
        thumb_size: '', 
      };
      totalSize = Number(mediaObject.size) || file.totalSizeInBytes || 0; 
      mimeType = mediaObject.mime_type || 'application/octet-stream';
    } else {
       console.warn("prepareFileDownloadInfo: Missing id, access_hash, or file_reference for document:", mediaObject);
    }
  } else {
     console.warn("prepareFileDownloadInfo: Unsupported mediaObject type:", mediaObject?._);
  }


  if (location && totalSize > 0) {
    return { location, totalSize, mimeType };
  } else {
    console.warn("prepareFileDownloadInfo: Could not create valid download info. Location:", location, "TotalSize:", totalSize);
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
    console.error("downloadFileChunk called with null location.");
    return { errorType: 'OTHER' as const };
  }
  try {
    const result = await api.call('upload.getFile', {
      location: location,
      offset: offset,
      limit: limit,
      precise: true, 
      cdn_supported: true 
    }, { signal }); 

    if (!result || typeof result !== 'object' || (Object.keys(result).length === 0 && result.constructor === Object)) {
        console.warn("downloadFileChunk: Empty or invalid response from upload.getFile for location:", location, "offset:", offset, "limit:", limit, "Response:", result);
        return { errorType: 'OTHER' as const };
    }

    if (result._ === 'upload.fileCdnRedirect') {
      const cdnRedirectData: CdnRedirectDataType = {
          dc_id: result.dc_id,
          file_token: result.file_token, 
          encryption_key: result.encryption_key, 
          encryption_iv: result.encryption_iv, 
          file_hashes: (result.file_hashes || []).map((fh: any) => ({ 
            offset: Number(fh.offset), 
            limit: fh.limit,
            hash: fh.hash, 
          })) as AppFileHash[],
        };
      return {
        isCdnRedirect: true,
        cdnRedirectData: cdnRedirectData
      };
    }

    if (result._ === 'upload.file' && result.bytes) {
      return { bytes: result.bytes, type: result.type?._ || 'storage.fileUnknown' };
    }
    console.warn("downloadFileChunk: Unexpected response structure from upload.getFile:", result);
    return { errorType: 'OTHER' as const };
  } catch (error: any) {
    if (error.name === 'AbortError' || (error.message && error.message.toLowerCase().includes('aborted'))) {
      console.log("downloadFileChunk: Aborted by user/system.");
      return { errorType: 'OTHER' as const }; 
    }
    console.error('Error downloading file chunk:', error.message, error.originalErrorObject || error);
    const errorMessage = error.message || error.originalErrorObject?.error_message;
    if (errorMessage?.includes('FILE_REFERENCE_EXPIRED')) {
      return { errorType: 'FILE_REFERENCE_EXPIRED' as const };
    }
    return { errorType: 'OTHER' as const }; 
  }
}

export async function downloadCdnFileChunk(
  cdnRedirectData: NonNullable<FileChunkResponse['cdnRedirectData']>,
  offset: number, 
  limit: number,  
  signal?: AbortSignal
): Promise<FileChunkResponse> {
  try {
    const result = await api.call('upload.getCdnFile', {
      file_token: cdnRedirectData.file_token,
      offset: offset, 
      limit: limit,
    }, { dcId: cdnRedirectData.dc_id, signal }); 

    if (!result || typeof result !== 'object' || (Object.keys(result).length === 0 && result.constructor === Object) ) {
        console.warn("downloadCdnFileChunk: Empty or invalid response from upload.getCdnFile for token:", cdnRedirectData.file_token, "offset:", offset, "limit:", limit, "Response:", result);
        return { errorType: 'OTHER' as const };
    }

    if (result._ === 'upload.cdnFile' && result.bytes) {
      return { bytes: result.bytes, type: 'application/octet-stream' }; 
    }
     console.warn("downloadCdnFileChunk: Unexpected response structure from upload.getCdnFile:", result);
    return { errorType: 'OTHER' as const };
  } catch (error: any)
   {
    if (error.name === 'AbortError' || (error.message && error.message.toLowerCase().includes('aborted'))) {
      console.log("downloadCdnFileChunk: Aborted by user/system.");
      return { errorType: 'OTHER' as const };
    }
    console.error('Error downloading CDN file chunk:', error.message, error.originalErrorObject || error);
    return { errorType: 'OTHER' as const };
  }
}

export async function refreshFileReference(item: DownloadQueueItemType): Promise<any | null> {
  if (!item.inputPeer || !item.telegramMessage) { 
      console.warn("refreshFileReference: Missing inputPeer or original telegramMessage for item:", item.name);
      return null;
  }
  if (!item.messageId) {
      console.warn("refreshFileReference: Missing messageId for item:", item.name);
      return null;
  }

  try {
    const messagesResult = await api.call('messages.getMessages', {
       id: [ { _: 'inputMessageID', id: item.messageId } ],
    });

    let foundMessage = null;
    if (messagesResult.messages && Array.isArray(messagesResult.messages)) {
        foundMessage = messagesResult.messages.find((m: any) => String(m.id) === String(item.messageId));
    } 
    
    const updatedMessage = foundMessage; 
    
    if (updatedMessage?.media) {
      let newFileReference = null;
      let updatedMediaObject = null; 

      if (updatedMessage.media.photo && updatedMessage.media.photo.id) {
        updatedMediaObject = messagesResult.photos?.find((p:any) => String(p.id) === String(updatedMessage.media.photo.id)) || updatedMessage.media.photo;
        newFileReference = updatedMediaObject?.file_reference;
      } else if (updatedMessage.media.document && updatedMessage.media.document.id) {
        updatedMediaObject = messagesResult.documents?.find((d:any) => String(d.id) === String(updatedMessage.media.document.id)) || updatedMessage.media.document;
        newFileReference = updatedMediaObject?.file_reference;
      } else if (updatedMessage.media.photo) { 
         updatedMediaObject = updatedMessage.media.photo;
         newFileReference = updatedMediaObject?.file_reference;
      } else if (updatedMessage.media.document) { 
         updatedMediaObject = updatedMessage.media.document;
         newFileReference = updatedMediaObject?.file_reference;
      }


      if (newFileReference && updatedMediaObject) {
        console.log("File reference refreshed for:", item.name, "New reference:", newFileReference);
        return updatedMediaObject; 
      } else {
        console.warn("Could not obtain new file_reference for item:", item.name, "Updated Message:", updatedMessage);
      }
    } else {
       console.warn("No media found in updated message for item:", item.name, "Updated Message:", updatedMessage);
    }
  } catch (error: any) {
    console.error("Error during refreshFileReference (messages.getMessages):", error.message, error.originalErrorObject || error);
  }
  return null;
}

export async function calculateSHA256(data: Uint8Array): Promise<Uint8Array> {
  try {
    const hash = cryptoSha256(data);
    return Promise.resolve(hash); 
  } catch (error) {
    console.error("Error calculating SHA256:", error);
    throw new Error("SHA256 calculation failed");
  }
}


export function areUint8ArraysEqual(arr1?: Uint8Array, arr2?: Uint8Array): boolean {
  if (!arr1 || !arr2 || arr1.length !== arr2.length) {
    return false;
  }
  for (let i = 0; i < arr1.length; i++) {
    if (arr1[i] !== arr2[i]) {
      return false;
    }
  }
  return true;
}

function generateRandomLong(): string {
  const buffer = new Uint8Array(8);
  crypto.getRandomValues(buffer);
  const view = new DataView(buffer.buffer);
  return view.getBigInt64(0, true).toString();
}

const TEN_MB = 10 * 1024 * 1024;
const UPLOAD_PART_SIZE = 512 * 1024; // 512KB as per Telegram docs for part_size

export async function uploadFile(
  inputPeer: any,
  fileToUpload: File, 
  onProgress: (percent: number) => void,
  signal?: AbortSignal
): Promise<any> {
  const client_file_id_str = generateRandomLong(); 
  const isBigFile = fileToUpload.size > TEN_MB;
  const totalChunks = Math.ceil(fileToUpload.size / UPLOAD_PART_SIZE);

  console.log(`Starting upload for ${fileToUpload.name}. Size: ${fileToUpload.size}, BigFile: ${isBigFile}, Total Chunks: ${totalChunks}, Client File ID: ${client_file_id_str}`);
  onProgress(0);

  for (let i = 0; i < totalChunks; i++) {
    if (signal?.aborted) {
      console.log(`Upload aborted by user for ${fileToUpload.name} at chunk ${i}`);
      throw new Error('Upload aborted by user.');
    }

    const offset = i * UPLOAD_PART_SIZE;
    const chunkBlob = fileToUpload.slice(offset, offset + UPLOAD_PART_SIZE);
    
    const chunkBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(chunkBlob);
    });
    const chunkBytes = new Uint8Array(chunkBuffer);

    try {
      let partUploadResult;
      if (isBigFile) {
        console.log(`Uploading big file part ${i}/${totalChunks -1} for ${fileToUpload.name}`);
        partUploadResult = await api.call('upload.saveBigFilePart', {
          file_id: client_file_id_str, // Changed to string to match MTProto definition
          file_part: i,
          file_total_parts: totalChunks,
          bytes: chunkBytes,
        }, { signal });
      } else {
        console.log(`Uploading small file part ${i}/${totalChunks -1} for ${fileToUpload.name}`);
        partUploadResult = await api.call('upload.saveFilePart', {
          file_id: client_file_id_str, // Changed to string
          file_part: i,
          bytes: chunkBytes,
        }, { signal });
      }

      if (partUploadResult?._ !== 'boolTrue') { 
          console.error(`Failed to save file part ${i} for ${fileToUpload.name}. Server response:`, partUploadResult);
          throw new Error(`Failed to save file part ${i}. Server response: ${JSON.stringify(partUploadResult)}`);
      }

      const progressPercent = Math.round(((i + 1) / totalChunks) * 90); 
      onProgress(progressPercent);

    } catch (error: any) {
      console.error(`Error uploading part ${i} for ${fileToUpload.name}:`, error.message, error.originalErrorObject || error);
      throw error; 
    }
  }

  onProgress(95); 
  console.log(`All parts uploaded for ${fileToUpload.name}. Sending media...`);

  const inputFilePayload = isBigFile
    ? { _: 'inputFileBig', id: client_file_id_str, parts: totalChunks, name: fileToUpload.name }
    : { _: 'inputFile', id: client_file_id_str, parts: totalChunks, name: fileToUpload.name, md5_checksum: '' };

  try {
    const result = await api.call('messages.sendMedia', {
      peer: inputPeer,
      media: {
        _: 'inputMediaUploadedDocument',
        nosound_video: false, 
        force_file: false,    
        spoiler: false,       
        file: inputFilePayload,
        mime_type: fileToUpload.type || 'application/octet-stream', 
        attributes: [
          { _: 'documentAttributeFilename', file_name: fileToUpload.name },
        ],
      },
      message: '', 
      random_id: generateRandomLong(), 
    }, { signal }); 
    
    console.log(`Media sent successfully for ${fileToUpload.name}:`, result);
    onProgress(100); 
    return result;
  } catch (error: any) {
    console.error(`Error sending media for ${fileToUpload.name}:`, error.message, error.originalErrorObject || error);
    throw error;
  }
}


export async function updateDialogFiltersOrder(order: number[]): Promise<boolean> {
  try {
    console.log("Attempting to update dialog filters order with:", order);
    const result = await api.call('messages.updateDialogFiltersOrder', { order });
    console.log("Update dialog filters order result:", result);
    return result === true || (typeof result === 'object' && result._ === 'boolTrue');
  } catch (error: any) {
    console.error('Error updating dialog filters order:', error.message, error.originalErrorObject || error);
    throw error;
  }
}

export async function exportChatlistInvite(filterId: number): Promise<{ link: string } | null> {
  try {
    console.log("Attempting to export chatlist invite for filter ID:", filterId);
    const result = await api.call('chatlists.exportChatlistInvite', { 
        filter_id: filterId,
        peers: [] 
    });
    console.log("Export chatlist invite result:", result);
    if (result && result.url) {
        return { link: result.url };
    }
    return null;
  } catch (error: any) {
    console.error('Error exporting chatlist invite:', error.message, error.originalErrorObject || error);
    throw error;
  }
}

export async function updateDialogFilter(
  filterIdToUpdate: number | null, 
  filterData?: DialogFilter     
): Promise<boolean> {
  const params: any = {
    flags: 0, 
  };

  if (filterIdToUpdate !== null) {
    params.id = filterIdToUpdate;
  }

  if (filterData) { 
    params.flags |= (1 << 0); 
    
    const telegramFilter: any = {
      _: filterData._ === 'dialogFilterDefault' ? 'dialogFilterDefault' :
         (filterData._ === 'dialogFilterChatlist' ? 'dialogFilterChatlist' : 'dialogFilter'),
      id: filterData.id, 
      title: filterData.title,
      pinned_peers: filterData.pinned_peers || [],
      include_peers: filterData.include_peers || [],
    };

    if (telegramFilter._ === 'dialogFilter') {
        telegramFilter.exclude_peers = filterData.exclude_peers || [];
        let internalFlags = 0;
        if (filterData.contacts) internalFlags |= (1 << 0);
        if (filterData.non_contacts) internalFlags |= (1 << 1);
        if (filterData.groups) internalFlags |= (1 << 2);
        if (filterData.broadcasts) internalFlags |= (1 << 3);
        if (filterData.bots) internalFlags |= (1 << 4);
        if (filterData.exclude_muted) internalFlags |= (1 << 11);
        if (filterData.exclude_read) internalFlags |= (1 << 12);
        if (filterData.exclude_archived) internalFlags |= (1 << 13);
        
        if (filterData.emoticon) {
            internalFlags |= (1 << 25);
            telegramFilter.emoticon = filterData.emoticon;
        }
        telegramFilter.flags = internalFlags;
    } else if (telegramFilter._ === 'dialogFilterChatlist') { 
        let internalFlags = 0;
         if (filterData.has_my_invites) internalFlags |= (1 << 26);
         if (filterData.emoticon) {
            internalFlags |= (1 << 25);
            telegramFilter.emoticon = filterData.emoticon;
        }
        telegramFilter.flags = internalFlags;
    }

    params.filter = telegramFilter;
    if (filterIdToUpdate === null) { 
        delete params.id;
    }

  } else if (filterIdToUpdate !== null) { 
    params.id = filterIdToUpdate;
    delete params.filter;
  } else {
    console.error("updateDialogFilter: Invalid call. Must provide filterId for delete, or filterData for create/update.");
    return false;
  }

  try {
    console.log("Attempting to update/create/delete dialog filter with params:", JSON.stringify(params, null, 2));
    const result = await api.call('messages.updateDialogFilter', params);
    console.log("Update/create/delete dialog filter result:", result);
    return result === true || (typeof result === 'object' && result._ === 'boolTrue');
  } catch (error: any) {
    console.error('Error updating/creating/deleting dialog filter:', error.message, error.originalErrorObject || error);
    throw error;
  }
}


if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  (window as any).telegramServiceApi = api;
  (window as any).telegramUserSession = userSession;
}
