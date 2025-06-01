
'use client';

import MTProto from '@mtproto/core/envs/browser';
import type { CloudFolder, CloudFile, GetChatsPaginatedResponse, MediaHistoryResponse, FileDownloadInfo, FileChunkResponse, DownloadQueueItemType, FileHash as AppFileHash, DialogFilter, MessagesDialogFilters, ExtendedFile, CdnRedirectDataType, CloudChannelConfigV1, CloudChannelType } from '@/types';
import { formatFileSize } from '@/lib/utils';
import cryptoSha256 from '@cryptography/sha256';

export { formatFileSize };
export const ALL_CHATS_FILTER_ID = 0;
const CLOUDIFIER_APP_SIGNATURE_V1 = "TELEGRAM_CLOUDIFIER_V1.0";


const API_ID_STRING = process.env.NEXT_PUBLIC_TELEGRAM_API_ID;
const API_HASH = process.env.NEXT_PUBLIC_TELEGRAM_API_HASH;
const CRITICAL_ERROR_MESSAGE_PREFIX = "CRITICAL_TELEGRAM_API_ERROR: ";


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
        crypto: { getSRPParams: async () => ({ A: new Uint8Array(), M1: new Uint8Array() }) }
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
            crypto: { getSRPParams: async () => ({ A: new Uint8Array(), M1: new Uint8Array() }) }
        } as any;
        this.initialized = false;
    }
  }

  async call(method: string, params: any = {}, options: any = {}): Promise<any> {
    if (!this.initialized || !this.mtproto || typeof this.mtproto.call !== 'function') {
      const initErrorMsg = (typeof window !== 'undefined' && (window as any).telegramApiError) || CRITICAL_ERROR_MESSAGE_PREFIX + "MTProto not properly initialized.";
      let err = new Error(initErrorMsg);
      (err as any).originalErrorObject = { error_message: initErrorMsg, error_code: -1 };
      return Promise.reject(err);
    }

    let originalErrorObject: any = null;

    try {
      const result = await this.mtproto.call(method, params, options);
      return result;
    } catch (error: any) {
      originalErrorObject = JSON.parse(JSON.stringify(error));
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
        } else {
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
        if (authMethodsForClear.includes(method) && userSession) {
            console.warn(`Low-level or empty error during ${method}. Clearing potentially problematic local session parts.`);
            delete userSession.phone_code_hash;
            delete userSession.srp_id;
            delete userSession.srp_params;
        }
        processedError = new Error(`MTProto call '${method}' failed with an unidentified error. Raw error: ${JSON.stringify(error)}`);
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
  console.log(`[sendCode] Attempting to send code to ${fullPhoneNumber}`);

  const sendCodePayload = {
    phone_number: fullPhoneNumber,
    settings: {
      _: 'codeSettings',
    },
  };

  try {
    const result = await api.call('auth.sendCode', sendCodePayload);
    if (!result || !result.phone_code_hash) {
        console.error("[sendCode] Failed: phone_code_hash not received or result is invalid.", result);
        throw new Error("Failed to send code: phone_code_hash not received from Telegram.");
    }
    userSession.phone_code_hash = result.phone_code_hash;
    console.log("[sendCode] Successfully got phone_code_hash:", userSession.phone_code_hash);
    return userSession.phone_code_hash;
  } catch (error: any) {
    console.error('[sendCode] Error after api.call:', error.message, error.originalErrorObject || error);
    const message = error.message || (error.originalErrorObject?.error_message || 'Failed to send code.');
     if (message === 'AUTH_RESTART') {
         throw new Error('AUTH_RESTART');
    }
    throw new Error(message);
  }
}

export async function signIn(fullPhoneNumber: string, code: string): Promise<{ user?: any; error?: string; srp_id?: string }> {
  if (!userSession.phone_code_hash) {
    console.warn("[signIn] Called without phone_code_hash. This may lead to AUTH_RESTART or failure.");
    throw new Error('AUTH_RESTART');
  }
  if (!userSession.phone) userSession.phone = fullPhoneNumber;
  console.log(`[signIn] Attempting for phone ${userSession.phone} with code_hash ${userSession.phone_code_hash}`);

  try {
    const result = await api.call('auth.signIn', {
      phone_number: userSession.phone,
      phone_code_hash: userSession.phone_code_hash,
      phone_code: code,
    });
    console.log("[signIn] auth.signIn result:", result);

    if (result._ === 'auth.authorizationSignUpRequired') {
      delete userSession.phone_code_hash;
      throw new Error('Sign up required. This app currently only supports sign in for existing accounts.');
    }

    if (result.user) {
        userSession.user = result.user;
        saveUserDataToLocalStorage();
        console.log("[signIn] Success, user data saved.");
    }
    delete userSession.phone_code_hash;
    return { user: result.user };

  } catch (error: any) {
    const errorMessage = error.message || (error.originalErrorObject?.error_message);
    console.error('[signIn] Error during auth.signIn:', errorMessage, error.originalErrorObject || error);

    if (errorMessage === 'SESSION_PASSWORD_NEEDED') {
      try {
        console.log("[signIn] SESSION_PASSWORD_NEEDED, calling account.getPassword");
        const passwordData = await api.call('account.getPassword');
        console.log("[signIn] account.getPassword result:", passwordData);
        if (!passwordData || !passwordData.srp_id || !passwordData.current_algo || !passwordData.srp_B) {
             console.error("[signIn] Failed to initialize 2FA: Missing critical SRP parameters.", passwordData);
             delete userSession.phone_code_hash;
             throw new Error('Failed to initialize 2FA: Missing critical SRP parameters from server.');
        }

        userSession.srp_id = String(passwordData.srp_id);
        userSession.srp_params = {
            g: passwordData.current_algo.g,
            p: passwordData.current_algo.p,
            salt1: passwordData.current_algo.salt1,
            salt2: passwordData.current_algo.salt2,
            srp_B: passwordData.srp_B
        };
        console.log("[signIn] SRP params set for 2FA. srp_id:", userSession.srp_id);
        delete userSession.phone_code_hash;

        const twoFactorError: any = new Error('2FA_REQUIRED');
        twoFactorError.srp_id = userSession.srp_id;
        throw twoFactorError;

      } catch (getPasswordError: any) {
        console.error('[signIn] Error during account.getPassword or SRP setup:', getPasswordError.message, getPasswordError.originalErrorObject || getPasswordError);
        delete userSession.phone_code_hash;
        if (getPasswordError.message === '2FA_REQUIRED' && getPasswordError.srp_id) {
          throw getPasswordError;
        }
        if (getPasswordError.message === 'AUTH_RESTART') {
            throw getPasswordError;
        }
        const messageToThrow = getPasswordError.message || 'Failed to fetch 2FA details after SESSION_PASSWORD_NEEDED.';
        throw new Error(messageToThrow);
      }
    }

    delete userSession.phone_code_hash;
    throw error;
  }
}


export async function checkPassword(password: string): Promise<any> {
  if (!userSession.srp_id || !userSession.srp_params || !api.mtproto.crypto?.getSRPParams) {
    let missingDetail = "";
    if (!userSession.srp_id) missingDetail += "srp_id is missing. ";
    if (!userSession.srp_params) missingDetail += "srp_params are missing. ";
    if (!api.mtproto.crypto?.getSRPParams) missingDetail += "crypto.getSRPParams method is missing. ";
    console.error(`[checkPassword] Pre-condition for 2FA failed. ${missingDetail}Triggering AUTH_RESTART.`);
    delete userSession.srp_params;
    delete userSession.srp_id;
    throw new Error('AUTH_RESTART');
  }
  console.log(`[checkPassword] Attempting with srp_id: ${userSession.srp_id}`);

  try {
    const { g, p, salt1, salt2, srp_B } = userSession.srp_params;
    const { A, M1 } = await api.mtproto.crypto.getSRPParams({
        g, p, salt1, salt2, gB: srp_B, password,
    });
    const srp_id_as_string = String(userSession.srp_id);
    console.log("[checkPassword] SRP calculation successful. Calling auth.checkPassword.");
    const checkResult = await api.call('auth.checkPassword', {
        password: {
            _: 'inputCheckPasswordSRP',
            srp_id: srp_id_as_string,
            A: A,
            M1: M1,
        }
    });
    console.log("[checkPassword] auth.checkPassword result:", checkResult);
    if (checkResult.user) {
        userSession.user = checkResult.user;
        saveUserDataToLocalStorage();
        console.log("[checkPassword] Success, user data saved.");
    }
    delete userSession.srp_params;
    delete userSession.srp_id;
    return checkResult.user;
  } catch (error: any) {
    const message = error.message || error.originalErrorObject?.error_message;
    console.error('[checkPassword] Error during auth.checkPassword or SRP calculation:', message, error.originalErrorObject || error);
    delete userSession.srp_params;
    delete userSession.srp_id;
    if (message === 'PASSWORD_HASH_INVALID') {
        throw new Error('Invalid password. Please try again. (PASSWORD_HASH_INVALID)');
    }
    if (message === 'SRP_ID_INVALID' || message?.includes('AUTH_RESTART') || message?.includes('SRP_METHOD_INVALID')) {
        console.warn('[checkPassword] SRP_ID_INVALID or AUTH_RESTART scenario. Throwing AUTH_RESTART.');
        throw new Error('AUTH_RESTART');
    }
    if (error.originalErrorObject && Object.keys(error.originalErrorObject).length > 0 && error.message) {
      throw error;
    }
    console.warn('[checkPassword] Unhandled error type, defaulting to AUTH_RESTART.');
    throw new Error('AUTH_RESTART');
  }
}

export async function signOut(): Promise<void> {
  console.log("[signOut] Called.");
  try {
    if (api && api.mtproto && typeof api.mtproto.call === 'function' && api.initialized) {
        console.log("[signOut] Attempting server logout.");
        await api.call('auth.logOut');
        console.log("[signOut] Server logout successful or already logged out.");
    }
  } catch (error: any) {
     console.warn('[signOut] Error signing out from Telegram server (this is often expected if session was already invalid):', error.message);
  } finally {
    userSession = {};
    if (typeof window !== 'undefined') {
      localStorage.removeItem(USER_SESSION_KEY);
      localStorage.removeItem(USER_PHONE_KEY);
      try {
        if (api && api.mtproto && typeof api.mtproto.clearStorage === 'function' && api.initialized) {
          console.log("[signOut] Clearing MTProto local storage.");
          await api.mtproto.clearStorage();
        }
      } catch (e) {
         console.warn('[signOut] Error trying to clear mtproto-core storage:', e);
      }
    }
    console.log("[signOut] Local session and storage cleared.");
  }
}

export async function isUserConnected(): Promise<boolean> {
  console.log("[isUserConnected] Checking connection status.");
  if (API_ID === undefined || !API_HASH || !api.initialized) {
      console.log("[isUserConnected] API not configured or not initialized. Returning false.");
      if (userSession.user) await signOut();
      return false;
  }

  if (userSession.user) {
    try {
        console.log("[isUserConnected] User object exists in session. Verifying with users.getUsers.");
        await api.call('users.getUsers', {id: [{_: 'inputUserSelf'}]});
        console.log("[isUserConnected] users.getUsers successful. User is connected.");
        return true;
    } catch (error: any) {
        const errorMessage = error.message || error.originalErrorObject?.error_message;
        const authErrorMessages = [
            'AUTH_KEY_UNREGISTERED', 'USER_DEACTIVATED', 'SESSION_REVOKED',
            'SESSION_EXPIRED', 'API_ID_INVALID', 'AUTH_RESTART', 'PHONE_CODE_INVALID',
            'PHONE_NUMBER_INVALID', 'CONNECTION_API_ID_INVALID', 'Invalid hash in mt_dh_gen_ok'
        ];

        if (errorMessage && authErrorMessages.some(authMsg => errorMessage.includes(authMsg))) {
            console.warn(`[isUserConnected] User session invalid (${errorMessage}), signing out.`);
            await signOut();
            return false;
        }
         console.warn(`[isUserConnected] users.getUsers check failed with non-critical auth error, but user object exists. Error: ${errorMessage}. Treating as connected for now.`);
        return true;
    }
  }
  console.log("[isUserConnected] No user object in session. User is not connected.");
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
    console.warn("[getPeerTitle] Error:", e, "Peer:", peer);
    if(peer.user_id) return `User ${String(peer.user_id)}`;
    if(peer.chat_id) return `Chat ${String(peer.chat_id)}`;
    if(peer.channel_id) return `Channel ${String(peer.channel_id)}`;
  }
  return 'Invalid Peer Data';
}

function transformDialogToCloudFolder(dialog: any, chats: any[], users: any[], isAppManagedCloud?: boolean, cloudConfig?: CloudChannelConfigV1): CloudFolder | null {
    if (!dialog || !dialog.peer) {
      console.warn("[transformDialogToCloudFolder] Invalid dialog or missing peer:", dialog);
      return null;
    }
    const peer = dialog.peer;
    const chatTitle = getPeerTitle(peer, chats || [], users || []);
    let inputPeerForApiCalls: any | undefined;

    const peerUserId = peer.user_id ? String(peer.user_id) : undefined;
    const peerChatId = peer.chat_id ? String(peer.chat_id) : undefined;
    const peerChannelId = peer.channel_id ? String(peer.channel_id) : undefined;

    try {
        if (peer._ === 'peerUser' && peerUserId) {
            const userAssociated = users?.find((u:any) => String(u.id) === peerUserId);
            if (userAssociated && userAssociated.access_hash !== undefined) {
                inputPeerForApiCalls = { _: 'inputPeerUser', user_id: userAssociated.id, access_hash: userAssociated.access_hash };
            } else if (dialog.peer.access_hash !== undefined) {
                 inputPeerForApiCalls = { _: 'inputPeerUser', user_id: peer.user_id, access_hash: dialog.peer.access_hash };
            }
        } else if (peer._ === 'peerChat' && peerChatId) {
            inputPeerForApiCalls = { _: 'inputPeerChat', chat_id: peer.chat_id };
        } else if (peer._ === 'peerChannel' && peerChannelId) {
            const chatAssociated = chats?.find((c:any) => String(c.id) === peerChannelId);
            if (chatAssociated && chatAssociated.access_hash !== undefined) {
                inputPeerForApiCalls = { _: 'inputPeerChannel', channel_id: chatAssociated.id, access_hash: chatAssociated.access_hash };
            } else if (dialog.peer.access_hash !== undefined) {
                inputPeerForApiCalls = { _: 'inputPeerChannel', channel_id: peer.channel_id, access_hash: dialog.peer.access_hash };
            }
        }
    } catch (e) {
         console.error("[transformDialogToCloudFolder] Error constructing inputPeer for dialog:", dialog, e);
    }

    if (!inputPeerForApiCalls) {
      if (peer._ === 'peerUser' && peer.user_id != null && peer.access_hash != null) {
         inputPeerForApiCalls = { _: 'inputPeerUser', user_id: peer.user_id, access_hash: peer.access_hash };
      } else if (peer._ === 'peerChannel' && peer.channel_id != null && peer.access_hash != null) {
         inputPeerForApiCalls = { _: 'inputPeerChannel', channel_id: peer.channel_id, access_hash: peer.access_hash };
      } else if (peer._ === 'peerChat' && peer.chat_id != null ) {
         inputPeerForApiCalls = { _: 'inputPeerChat', chat_id: peer.chat_id };
      } else {
        console.warn("[transformDialogToCloudFolder] Could not construct valid inputPeer for dialog:", JSON.stringify(dialog.peer), "Title:", chatTitle);
      }
    }

    let cloudFolderId: string;
    if (peer._ === 'peerUser' && peer.user_id != null) {
        cloudFolderId = `user-${peer.user_id}`;
    } else if (peer._ === 'peerChat' && peer.chat_id != null) {
        cloudFolderId = `chat-${peer.chat_id}`;
    } else if (peer._ === 'peerChannel' && peer.channel_id != null) {
        cloudFolderId = `channel-${peer.channel_id}`;
    } else {
        console.error("[transformDialogToCloudFolder] dialog.peer is of unexpected type or missing ID. Peer:", JSON.stringify(peer));
        cloudFolderId = `malformed-peer-${dialog.top_message || Date.now() + Math.random()}`;
    }

    return {
      id: cloudFolderId,
      name: chatTitle,
      isChatFolder: true,
      inputPeer: inputPeerForApiCalls,
      files: [],
      folders: [],
      isAppManagedCloud: isAppManagedCloud,
      cloudConfig: cloudConfig,
    };
}


function transformDialogsToCloudFolders(dialogsResult: any): CloudFolder[] {
  const { dialogs, chats, users } = dialogsResult;
  if (!dialogs || !Array.isArray(dialogs)) {
    console.warn("[transformDialogsToCloudFolders] No dialogs array found in result:", dialogsResult);
    return [];
  }
  const transformed = dialogs.map((dialog: any) => transformDialogToCloudFolder(dialog, chats, users))
                .filter(folder => folder !== null) as CloudFolder[];
  console.log(`[transformDialogsToCloudFolders] Transformed ${transformed.length} folders from ${dialogs.length} dialogs.`);
  return transformed;
}


export async function getDialogFilters(): Promise<DialogFilter[]> {
  console.log("[getDialogFilters] Service function called.");
  if (!(await isUserConnected())) {
    console.log("[getDialogFilters] User not connected, returning empty array.");
    return [];
  }
  try {
    const result = await api.call('messages.getDialogFilters');
    console.log("[getDialogFilters] API response:", result);

    if (Array.isArray(result)) {
      return result as DialogFilter[];
    } else if (result && Array.isArray(result.filters)) {
      return result.filters as DialogFilter[];
    } else {
      console.warn("[getDialogFilters] Unexpected structure for messages.getDialogFilters response:", result);
      return [];
    }
  } catch (error: any) {
    console.error('[getDialogFilters] Error fetching dialog filters:', error.message, error.originalErrorObject || error);
    return [];
  }
}


export async function getTelegramChats(
  limit: number,
  offsetDate: number = 0,
  offsetId: number = 0,
  offsetPeer: any = { _: 'inputPeerEmpty' },
  folderId?: number
): Promise<GetChatsPaginatedResponse> {
  console.log(`[getTelegramChats] Called. Limit: ${limit}, OffsetDate: ${offsetDate}, OffsetId: ${offsetId}, OffsetPeer:`, offsetPeer, `FolderId: ${folderId}`);
  if (!(await isUserConnected())) {
    console.log("[getTelegramChats] User not connected, returning empty response.");
    return { folders: [], nextOffsetDate: 0, nextOffsetId: 0, nextOffsetPeer: { _: 'inputPeerEmpty' }, hasMore: false };
  }

  const params: any = {
      offset_date: offsetDate,
      offset_id: offsetId,
      offset_peer: offsetPeer || { _: 'inputPeerEmpty' },
      limit: limit,
      hash: 0,
  };

  if (folderId !== undefined && folderId !== ALL_CHATS_FILTER_ID) {
    params.folder_id = folderId;
  }
  console.log("[getTelegramChats] Calling messages.getDialogs with final params:", JSON.stringify(params, null, 2));

  try {
    const dialogsResult = await api.call('messages.getDialogs', params);
    const transformedFolders = transformDialogsToCloudFolders(dialogsResult);

    let newOffsetDate = offsetDate;
    let newOffsetId = offsetId;
    let newOffsetPeerInput = { ...offsetPeer };
    let hasMore = false;

    if (dialogsResult.messages && dialogsResult.messages.length > 0) {
      if (dialogsResult._ === 'messages.dialogsSlice' && dialogsResult.count) {
          hasMore = dialogsResult.dialogs.length < dialogsResult.count && dialogsResult.dialogs.length > 0;
      } else if (dialogsResult._ === 'messages.dialogs') {
          hasMore = false;
      } else {
          hasMore = dialogsResult.dialogs.length >= limit;
      }


      if (dialogsResult.dialogs && dialogsResult.dialogs.length > 0) {
          const lastDialog = dialogsResult.dialogs[dialogsResult.dialogs.length - 1];
          const lastMessageInDialogs = dialogsResult.messages.find((m: any) => String(m.id) === String(lastDialog.top_message));

          if (lastMessageInDialogs) {
              newOffsetId = lastMessageInDialogs.id;
              newOffsetDate = lastMessageInDialogs.date;

              if (lastDialog.peer && lastDialog.peer._) {
                  if (lastDialog.peer._ === 'peerUser') {
                      const user = dialogsResult.users?.find((u:any) => String(u.id) === String(lastDialog.peer.user_id));
                      if (user && user.access_hash != null) newOffsetPeerInput = { _: 'inputPeerUser', user_id: user.id, access_hash: user.access_hash};
                      else if (lastDialog.peer.access_hash != null) newOffsetPeerInput = { _: 'inputPeerUser', user_id: lastDialog.peer.user_id, access_hash: lastDialog.peer.access_hash};
                      else newOffsetPeerInput = { _: 'inputPeerEmpty' };
                  } else if (lastDialog.peer._ === 'peerChat') {
                      newOffsetPeerInput = { _: 'inputPeerChat', chat_id: lastDialog.peer.chat_id };
                  } else if (lastDialog.peer._ === 'peerChannel') {
                       const channel = dialogsResult.chats?.find((c:any) => String(c.id) === String(lastDialog.peer.channel_id));
                       if (channel && channel.access_hash != null) newOffsetPeerInput = { _: 'inputPeerChannel', channel_id: channel.id, access_hash: channel.access_hash };
                       else if (lastDialog.peer.access_hash != null) newOffsetPeerInput = { _: 'inputPeerChannel', channel_id: lastDialog.peer.channel_id, access_hash: lastDialog.peer.access_hash};
                       else newOffsetPeerInput = { _: 'inputPeerEmpty' };
                  } else {
                      newOffsetPeerInput = { _: 'inputPeerEmpty' };
                  }
              } else {
                console.warn("[getTelegramChats] Last dialog peer is invalid, using inputPeerEmpty for next offset peer", lastDialog.peer);
                newOffsetPeerInput = { _: 'inputPeerEmpty' };
              }
          } else if (dialogsResult.messages.length > 0 && dialogsResult.dialogs.length < limit) {
             hasMore = false;
          }
      } else {
          hasMore = false;
      }
    } else {
        hasMore = false;
    }

    if (!newOffsetPeerInput || !newOffsetPeerInput._ || newOffsetPeerInput._ === 'inputPeerSelf') {
        newOffsetPeerInput = { _: 'inputPeerEmpty' };
    }
    console.log(`[getTelegramChats] Returning. Folders count: ${transformedFolders.length}, HasMore: ${hasMore}, NextOffsetId: ${newOffsetId}`);

    return {
      folders: transformedFolders,
      nextOffsetDate: newOffsetDate,
      nextOffsetId: newOffsetId,
      nextOffsetPeer: newOffsetPeerInput,
      hasMore: hasMore,
    };

  } catch (error:any) {
    console.error(`[getTelegramChats] Error calling messages.getDialogs with params: ${JSON.stringify(params)}. Error:`, error.message, error.originalErrorObject || error);
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
    console.warn("[getChatMediaHistory] called without inputPeer");
    return { files: [], hasMore: false, nextOffsetId: offsetId };
  }
  console.log(`[getChatMediaHistory] Called for peer:`, inputPeer, `Limit: ${limit}, OffsetId: ${offsetId}`);

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
    console.log("[getChatMediaHistory] Raw API response:", historyResult);

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
            if(largestSize?.size !== undefined) {
              totalSizeInBytes = Number(largestSize.size);
              fileSize = formatFileSize(totalSizeInBytes);
            }
            dataAiHint = "photograph image";
          } else if (msg.media._ === 'messageMediaDocument' && mediaObjectForFile) {
              fileName = mediaObjectForFile.attributes?.find((attr: any) => attr._ === 'documentAttributeFilename')?.file_name || `document_${mediaObjectForFile.id?.toString() || msg.id}`;
              if(mediaObjectForFile.size !== undefined) {
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

      if (historyResult._ === 'messages.messagesSlice' || historyResult._ === 'messages.channelMessages') {
        hasMoreMessages = messagesArray.length >= limit && (historyResult.count ? messagesArray.length < historyResult.count : true);
      } else {
        hasMoreMessages = false;
      }
    } else {
        hasMoreMessages = false;
    }
    console.log(`[getChatMediaHistory] Returning ${mediaFiles.length} files. HasMore: ${hasMoreMessages}, NextOffsetId: ${newOffsetId}`);
    return {
      files: mediaFiles,
      nextOffsetId: newOffsetId,
      hasMore: hasMoreMessages,
    };

  } catch (error:any) {
    console.error('[getChatMediaHistory] Error:', error.message, error.originalErrorObject || error);
    throw error;
  }
}


export async function prepareFileDownloadInfo(file: CloudFile): Promise<FileDownloadInfo | null> {
  if (!file.telegramMessage) {
    console.warn("[prepareFileDownloadInfo] file.telegramMessage is missing for file:", file.name);
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
         console.warn("[prepareFileDownloadInfo] No suitable size found for photo:", mediaObject.id);
      }
    } else {
        console.warn("[prepareFileDownloadInfo] Missing id, access_hash, or file_reference for photo:", mediaObject);
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
       console.warn("[prepareFileDownloadInfo] Missing id, access_hash, or file_reference for document:", mediaObject);
    }
  } else {
     console.warn("[prepareFileDownloadInfo] Unsupported mediaObject type:", mediaObject?._);
  }


  if (location && totalSize > 0) {
    return { location, totalSize, mimeType };
  } else {
    console.warn("[prepareFileDownloadInfo] Could not create valid download info. Location:", location, "TotalSize:", totalSize);
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
    if (errorMessage?.includes('FILE_REFERENCE_EXPIRED') || errorMessage?.includes('FILE_ID_INVALID') || errorMessage?.includes('LOCATION_INVALID')) {
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
  if (!item.telegramMessage) {
      console.warn("[refreshFileReference] Missing original telegramMessage for item:", item.name);
      return null;
  }
  if (!item.messageId) {
      console.warn("[refreshFileReference] Missing messageId for item:", item.name);
      return null;
  }
  if (!item.inputPeer) {
      console.warn("[refreshFileReference] Missing inputPeer for item:", item.name);
      return null;
  }
  console.log(`[refreshFileReference] Refreshing for item: ${item.name}, msgId: ${item.messageId}, peer:`, item.inputPeer);

  try {
    let messagesResult;
    if (item.inputPeer._ === 'inputPeerChannel') {
        messagesResult = await api.call('channels.getMessages', {
            channel: item.inputPeer,
            id: [{ _: 'inputMessageID', id: item.messageId }],
        });
    } else {
        messagesResult = await api.call('messages.getMessages', {
            id: [{ _: 'inputMessageID', id: item.messageId }],
        });
    }
    console.log("[refreshFileReference] messages.getMessages (or channels.getMessages) result:", messagesResult);


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
        console.log("[refreshFileReference] File reference refreshed successfully for:", item.name);
        if (typeof newFileReference === 'object' && !(newFileReference instanceof Uint8Array)) {
           console.warn("[refreshFileReference] newFileReference is an object but not Uint8Array. This is unusual.", newFileReference);
        }
        return updatedMediaObject;
      } else {
        console.warn("[refreshFileReference] Could not obtain new file_reference or updatedMediaObject for item:", item.name, "Updated Message:", updatedMessage);
      }
    } else {
       console.warn("[refreshFileReference] No media found in updated message for item:", item.name, "Updated Message:", updatedMessage);
    }
  } catch (error: any) {
    console.error("[refreshFileReference] Error fetching message:", error.message, error.originalErrorObject || error);
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
const UPLOAD_PART_SIZE = 512 * 1024;

export async function uploadFile(
  inputPeer: any,
  fileToUpload: File,
  onProgress: (percent: number) => void,
  signal?: AbortSignal
): Promise<any> {
  const client_file_id_str = generateRandomLong();
  const isBigFile = fileToUpload.size > TEN_MB;
  const totalChunks = Math.ceil(fileToUpload.size / UPLOAD_PART_SIZE);

  console.log(`[uploadFile] Starting for ${fileToUpload.name}. Size: ${fileToUpload.size}, BigFile: ${isBigFile}, Total Chunks: ${totalChunks}, Client File ID: ${client_file_id_str}`);
  onProgress(0);

  for (let i = 0; i < totalChunks; i++) {
    if (signal?.aborted) {
      console.log(`[uploadFile] Aborted by user for ${fileToUpload.name} at chunk ${i}`);
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
        partUploadResult = await api.call('upload.saveBigFilePart', {
          file_id: client_file_id_str,
          file_part: i,
          file_total_parts: totalChunks,
          bytes: chunkBytes,
        }, { signal });
      } else {
        partUploadResult = await api.call('upload.saveFilePart', {
          file_id: client_file_id_str,
          file_part: i,
          bytes: chunkBytes,
        }, { signal });
      }

      if (partUploadResult?._ !== 'boolTrue' && partUploadResult !== true) {
          console.error(`[uploadFile] Failed to save file part ${i} for ${fileToUpload.name}. Server response:`, partUploadResult);
          throw new Error(`Failed to save file part ${i}. Server response: ${JSON.stringify(partUploadResult)}`);
      }
      const progressPercent = Math.round(((i + 1) / totalChunks) * 90);
      onProgress(progressPercent);
    } catch (error: any) {
      console.error(`[uploadFile] Error uploading part ${i} for ${fileToUpload.name}:`, error.message, error.originalErrorObject || error);
      throw error;
    }
  }

  onProgress(95);
  console.log(`[uploadFile] All parts uploaded for ${fileToUpload.name}. Sending media...`);
  const inputFilePayload = isBigFile
    ? { _: 'inputFileBig', id: client_file_id_str, parts: totalChunks, name: fileToUpload.name }
    : { _: 'inputFile', id: client_file_id_str, parts: totalChunks, name: fileToUpload.name, md5_checksum: ''  };

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
    console.log(`[uploadFile] Media sent successfully for ${fileToUpload.name}:`, result);
    onProgress(100);
    return result;
  } catch (error: any) {
    console.error(`[uploadFile] Error sending media for ${fileToUpload.name}:`, error.message, error.originalErrorObject || error);
    throw error;
  }
}


export async function updateDialogFiltersOrder(order: number[]): Promise<boolean> {
  try {
    const result = await api.call('messages.updateDialogFiltersOrder', { order });
    return result === true || (typeof result === 'object' && result._ === 'boolTrue');
  } catch (error: any) {
    console.error('[updateDialogFiltersOrder] Error:', error.message, error.originalErrorObject || error);
    throw error;
  }
}

export async function exportChatlistInvite(filterId: number): Promise<{ link: string } | null> {
  try {
    const inputChatlist = {
        _: 'inputChatlistDialogFilter',
        filter_id: filterId
    };
    const result = await api.call('chatlists.exportChatlistInvite', {
        chatlist: inputChatlist,
        title: '',
        peers: []
    });
    if (result && result.invite && result.invite.url) {
        return { link: result.invite.url };
    }
    if (result && result.url) {
        return { link: result.url };
    }
    console.warn("[exportChatlistInvite] Could not find URL in response:", result);
    return null;
  } catch (error: any) {
    console.error('[exportChatlistInvite] Error:', error.message, error.originalErrorObject || error);
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
  } else {
    if (!filterData) {
        console.error("[updateDialogFilter] For creation, filterData is needed.");
        return false;
    }
  }

  if (filterData) {
    params.flags |= (1 << 0);
    params.filter = filterData;
  }

  try {
    const result = await api.call('messages.updateDialogFilter', params);
    return result === true || (typeof result === 'object' && result._ === 'boolTrue');
  } catch (error: any) {
    console.error('[updateDialogFilter] Error:', error.message, error.originalErrorObject || error);
    throw error;
  }
}


export async function createManagedCloudChannel(
  title: string,
  type: CloudChannelType
): Promise<{ channelInfo: any; configMessageInfo: any } | null> {
  console.log(`[createManagedCloudChannel] Called. Title: "${title}", Type: ${type}`);
  if (!(await isUserConnected())) {
    throw new Error("User not connected. Cannot create cloud channel.");
  }

  const channelAbout = `Managed by Telegram Cloudifier. Type: ${type}. Config: ${CLOUDIFIER_APP_SIGNATURE_V1}. Do not delete the first message or alter this 'about' text.`;

  try {
    const createChannelResult = await api.call('channels.createChannel', {
      title: title,
      about: channelAbout,
      megagroup: type === 'supergroup',
      for_import: false,
    });
    console.log("[createManagedCloudChannel] channels.createChannel result:", createChannelResult);

    if (!createChannelResult || !createChannelResult.chats || createChannelResult.chats.length === 0) {
      console.error("Failed to create channel: No channel data returned.", createChannelResult);
      throw new Error("Channel creation failed on Telegram's side: No channel data returned.");
    }

    const newChannel = createChannelResult.chats[0];
    const channelInputPeer = {
      _: 'inputPeerChannel',
      channel_id: newChannel.id,
      access_hash: newChannel.access_hash,
    };
    console.log(`[createManagedCloudChannel] Channel "${title}" (ID: ${newChannel.id}) created. About field set. Now sending config message...`);

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
        console.error("Initial config JSON is too long. This is a bug.", configJsonString);
        throw new Error("Internal error: Initial configuration message is too large.");
    }

    const sendMessageResult = await api.call('messages.sendMessage', {
      peer: channelInputPeer,
      message: configJsonString,
      random_id: generateRandomLong(),
      no_webpage: true,
    });
    console.log("[createManagedCloudChannel] messages.sendMessage result:", sendMessageResult);

    let sentMessageInfo = null;
    const updatesArray = Array.isArray(sendMessageResult.updates) ? sendMessageResult.updates : (sendMessageResult.updates?.updates || []);

    for (const update of updatesArray) {
        if (update._ === 'updateNewChannelMessage' && update.message && update.message.message === configJsonString) {
            sentMessageInfo = update.message;
            break;
        }
        if (update._ === 'updateMessageID' && sendMessageResult.id === update.id) {
             if(sendMessageResult.id && sendMessageResult.date && sendMessageResult.message === configJsonString){
                sentMessageInfo = sendMessageResult;
             }
             break;
        }
    }
     if (!sentMessageInfo && sendMessageResult.id && sendMessageResult.message === configJsonString) {
        sentMessageInfo = sendMessageResult;
    }

    if (!sentMessageInfo) {
        console.warn("[createManagedCloudChannel] Could not definitively find the sent config message in sendMessage updates. Response:", sendMessageResult);
        sentMessageInfo = { id: (sendMessageResult as any).id || 1, note: "Config message sent, but full object not found in immediate response." };
    }

    console.log(`[createManagedCloudChannel] Config message sent to channel ID ${newChannel.id}. Returning success.`);
    return { channelInfo: newChannel, configMessageInfo: sentMessageInfo };

  } catch (error: any) {
    console.error(`[createManagedCloudChannel] Error ("${title}", ${type}):`, error.message, error.originalErrorObject || error);
    throw error;
  }
}

export async function fetchAndVerifyManagedCloudChannels(): Promise<CloudFolder[]> {
  console.log("[FVC] Service: Scanning for Cloudifier Cloud Channels by checking first 4 messages.");
  if (!(await isUserConnected())) {
    console.log("[FVC] Service: User not connected, returning empty array.");
    return [];
  }

  const verifiedCloudChannels: CloudFolder[] = [];
  let allDialogs: any[] = [];
  let allChatsFromDialogs: any[] = [];
  let allUsersFromDialogs: any[] = [];

  try {
    const dialogsResult = await api.call('messages.getDialogs', {
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
      console.log(`[FVC] Service: Fetched ${allDialogs.length} dialogs for scanning.`);
    } else {
      console.warn("[FVC] Service: No dialogs found in messages.getDialogs response.");
      return [];
    }
  } catch (error: any) {
    console.error("[FVC] Service: Error fetching dialogs for scanning:", error.message);
    return [];
  }

  for (const dialog of allDialogs) {
    if (dialog.peer?._ !== 'peerChannel') {
      continue;
    }

    const channelInfo = allChatsFromDialogs.find(c => String(c.id) === String(dialog.peer.channel_id));
    if (!channelInfo || !channelInfo.access_hash) {
      console.log(`[FVC] Service: Skipping channel ID ${dialog.peer.channel_id} ("${getPeerTitle(dialog.peer, allChatsFromDialogs, allUsersFromDialogs) || 'N/A'}"). Full info or access_hash missing.`);
      continue;
    }

    const entityType = channelInfo.megagroup ? "Supergroup" : (channelInfo.gigagroup ? "Gigagroup" : "Channel");
    console.log(`[FVC] Service: Scanning ${entityType}: "${channelInfo.title}" (ID: ${channelInfo.id}). IsMegagroup: ${!!channelInfo.megagroup}. About (preview): ${(channelInfo.about || "").substring(0,50)}`);

    const channelInputPeer = {
      _: 'inputPeerChannel',
      channel_id: channelInfo.id,
      access_hash: channelInfo.access_hash,
    };

    let channelIsVerified = false;
    try {
      console.log(`[FVC] Attempting to fetch messages [1,2,3,4] for channel "${channelInfo.title}" (ID: ${channelInfo.id})`);
      const messagesResult = await api.call('channels.getMessages', {
        channel: channelInputPeer,
        id: [
          { _: 'inputMessageID', id: 1 },
          { _: 'inputMessageID', id: 2 },
          { _: 'inputMessageID', id: 3 },
          { _: 'inputMessageID', id: 4 },
        ],
      });

      // console.log(`[FVC] messages.getMessages response for "${channelInfo.title}" (ID: ${channelInfo.id}):`, messagesResult);

      if (messagesResult && messagesResult.messages && Array.isArray(messagesResult.messages)) {
        for (const messageInBatch of messagesResult.messages) {
          if (messageInBatch && typeof messageInBatch.message === 'string' && messageInBatch.message.trim() !== '' && messageInBatch._ === 'message') {
            console.log(`[FVC] Checking message ID ${messageInBatch.id} from "${channelInfo.title}". Content preview: ${(messageInBatch.message || "").substring(0,100)}`);
            try {
              const config = JSON.parse(messageInBatch.message);
              if (config && config.app_signature === CLOUDIFIER_APP_SIGNATURE_V1) {
                console.log(`[FVC] VERIFIED Cloud Channel: "${channelInfo.title}" (ID: ${channelInfo.id}) via config in message ID ${messageInBatch.id}.`);
                const cloudFolder = transformDialogToCloudFolder(dialog, allChatsFromDialogs, allUsersFromDialogs, true, config);
                if (cloudFolder) {
                  verifiedCloudChannels.push(cloudFolder);
                  channelIsVerified = true;
                  break; // Found config for this channel, no need to check other messages
                }
              } else {
                 // console.log(`[FVC] Message ID ${messageInBatch.id} from "${channelInfo.title}" parsed, but app_signature mismatch or missing. Parsed:`, config ? {app_signature: config.app_signature} : "undefined/null");
              }
            } catch (parseError: any) {
              // console.log(`[FVC] Message ID ${messageInBatch.id} from "${channelInfo.title}" is not valid JSON: ${parseError.message}.`);
            }
          } else {
            // console.log(`[FVC] Skipping message ID ${messageInBatch.id} from "${channelInfo.title}" - not a text message or empty. Type: ${messageInBatch ? messageInBatch._ : 'undefined'}`);
          }
        }
         if (!channelIsVerified) {
             console.log(`[FVC] No valid config message found in first 4 text messages for channel "${channelInfo.title}".`);
         }
      } else {
        console.log(`[FVC] channels.getMessages returned no messages (or unexpected structure) for first 4 IDs in "${channelInfo.title}".`);
      }
    } catch (error: any) {
      const errorMessage = error.message || error.originalErrorObject?.error_message;
      if (errorMessage && (errorMessage.includes("MESSAGE_ID_INVALID") || errorMessage.includes("MSG_ID_INVALID"))) {
          console.log(`[FVC] Service: Error fetching first 4 messages for channel "${channelInfo.title}" (ID: ${channelInfo.id}): Some message IDs (1-4) likely don't exist. This is expected for some channels.`);
      } else {
          console.log(`[FVC] Service: Error fetching first 4 messages for channel "${channelInfo.title}" (ID: ${channelInfo.id}): ${errorMessage}.`);
      }
    }
  }

  console.log(`[FVC] Service: Scan complete. Found ${verifiedCloudChannels.length} verified Cloudifier Cloud Channels.`);
  return verifiedCloudChannels;
}


if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  (window as any).telegramServiceApi = api;
  (window as any).telegramUserSession = userSession;
}
