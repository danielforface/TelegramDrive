
'use client';

import MTProto from '@mtproto/core/envs/browser';
import type { CloudFolder, CloudFile, GetChatsPaginatedResponse, MediaHistoryResponse, FileDownloadInfo, FileChunkResponse, DownloadQueueItemType, FileHash as AppFileHash, DialogFilter, MessagesDialogFilters, ExtendedFile, CdnRedirectDataType, CloudChannelConfigV1, CloudChannelType, CloudChannelConfigEntry, InputPeer } from '@/types';
import { formatFileSize } from '@/lib/utils';
import cryptoSha256 from '@cryptography/sha256';

export { formatFileSize };
export const ALL_CHATS_FILTER_ID = 0;
const CLOUDIFIER_APP_SIGNATURE_V1 = "TELEGRAM_CLOUDIFIER_V1.0";
const CONFIG_MESSAGE_ID = 2; // Message ID 2 for configuration

const CLOUDIFIER_MANAGED_FOLDER_ID = 20001; // Specific ID for our app's managed folder
const CLOUDIFIER_MANAGED_FOLDER_NAME = "Cloudifier Storage";


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
    if (typeof window !== 'undefined') (window as any).telegramApiError = errorMessage;
    API_ID = undefined;
  }
} else {
   const envErrorMsg = CRITICAL_ERROR_MESSAGE_PREFIX + "NEXT_PUBLIC_TELEGRAM_API_ID is not set in environment variables. Real connection will fail. \n" +
                      "Please create a .env.local file in the root of your project and add: \n" +
                      "NEXT_PUBLIC_TELEGRAM_API_ID=YOUR_API_ID_HERE \n" +
                      "NEXT_PUBLIC_TELEGRAM_API_HASH=YOUR_API_HASH_HERE \n" +
                      "You MUST restart your development server after creating or modifying the .env.local file.";
  if (typeof window !== 'undefined') (window as any).telegramApiError = envErrorMsg;
}

if (!API_HASH && API_ID !== undefined) {
  const envErrorMsg = CRITICAL_ERROR_MESSAGE_PREFIX + "NEXT_PUBLIC_TELEGRAM_API_HASH is not set in environment variables. Real connection will fail. \n" +
                      "Please ensure it is set in your .env.local file and you have restarted your development server. \n" +
                      "Example: NEXT_PUBLIC_TELEGRAM_API_HASH=your_actual_api_hash";
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
      this.mtproto = {
        call: async (method: string, params?: any, options?: any) => {
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
      this.mtproto.updates.on('updatesTooLong', (updateInfo: any) => {});
      this.mtproto.updates.on('updateShortMessage', (updateInfo: any) => {});
      this.mtproto.updates.on('updateShortChatMessage', (updateInfo: any) => {});
      this.mtproto.updates.on('updateShort', (updateInfo: any) => {});
      this.mtproto.updates.on('updateShortSentMessage', (updateInfo: any) => {});


    } catch (initError: any) {
        const errorMessage = CRITICAL_ERROR_MESSAGE_PREFIX + `Failed to initialize MTProto client in API class: ${initError.message || JSON.stringify(initError)}`;
        if (typeof window !== 'undefined' && !(window as any).telegramApiError) (window as any).telegramApiError = errorMessage;
        this.mtproto = {
            call: async (method: string, params?: any, options?: any) => {
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
            await sleep(ms);
            return this.call(method, params, options);
        }
      }

      const migrateErrorMatch = typeof error_message === 'string' && error_message.match(/([A-Z_]+)_MIGRATE_(\d+)/);
      if (error_code === 303 && migrateErrorMatch) {
        const type = migrateErrorMatch[1];
        const dcId = Number(migrateErrorMatch[2]);

        const criticalMethodsForDcChange = ['auth.sendCode', 'auth.signIn', 'auth.checkPassword', 'account.getPassword', 'users.getUsers'];
        if (type === 'PHONE' || type === 'NETWORK' || type === 'USER' || (criticalMethodsForDcChange.some(m => method.startsWith(m)) && type !== 'FILE') ) {
            try {
                await this.mtproto.setDefaultDc(dcId);
            } catch (setDefaultDcError: any) {
                options = { ...options, dcId };
            }
        } else {
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
      // console.error('Error saving user data to localStorage:', e);
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

  const sendCodePayload = {
    phone_number: fullPhoneNumber,
    settings: {
      _: 'codeSettings',
    },
  };

  try {
    const result = await api.call('auth.sendCode', sendCodePayload);
    if (!result || !result.phone_code_hash) {
        throw new Error("Failed to send code: phone_code_hash not received from Telegram.");
    }
    userSession.phone_code_hash = result.phone_code_hash;
    return userSession.phone_code_hash;
  } catch (error: any) {
    const message = error.message || (error.originalErrorObject?.error_message || 'Failed to send code.');
     if (message === 'AUTH_RESTART') {
         throw new Error('AUTH_RESTART');
    }
    throw new Error(message);
  }
}

export async function signIn(fullPhoneNumber: string, code: string): Promise<{ user?: any; error?: string; srp_id?: string }> {
  if (!userSession.phone_code_hash) {
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
        delete userSession.phone_code_hash;

        const twoFactorError: any = new Error('2FA_REQUIRED');
        twoFactorError.srp_id = userSession.srp_id;
        throw twoFactorError;

      } catch (getPasswordError: any) {
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
    delete userSession.srp_params;
    delete userSession.srp_id;
    throw new Error('AUTH_RESTART');
  }

  try {
    const { g, p, salt1, salt2, srp_B } = userSession.srp_params;
    const { A, M1 } = await api.mtproto.crypto.getSRPParams({
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
        throw new Error('AUTH_RESTART');
    }
    if (error.originalErrorObject && Object.keys(error.originalErrorObject).length > 0 && error.message) {
      throw error;
    }
    throw new Error('AUTH_RESTART');
  }
}

export async function signOut(): Promise<void> {
  try {
    if (api && api.mtproto && typeof api.mtproto.call === 'function' && api.initialized) {
        await api.call('auth.logOut');
    }
  } catch (error: any) {
    // Error signing out from Telegram server is often expected if session was already invalid
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
        // console.warn('[signOut] Error trying to clear mtproto-core storage:', e);
      }
    }
  }
}

export async function isUserConnected(): Promise<boolean> {
  if (API_ID === undefined || !API_HASH || !api.initialized) {
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
            await signOut();
            return false;
        }
        return true; // Non-critical auth error, but user object exists.
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

function transformDialogToCloudFolder(dialog: any, chats: any[], users: any[], isAppManagedCloud?: boolean, cloudConfig?: CloudChannelConfigV1): CloudFolder | null {
    if (!dialog || !dialog.peer) {
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
        // console.error("[transformDialogToCloudFolder] Error constructing inputPeer for dialog:", dialog, e);
    }

    if (!inputPeerForApiCalls) {
      if (peer._ === 'peerUser' && peer.user_id != null && peer.access_hash != null) {
         inputPeerForApiCalls = { _: 'inputPeerUser', user_id: peer.user_id, access_hash: peer.access_hash };
      } else if (peer._ === 'peerChannel' && peer.channel_id != null && peer.access_hash != null) {
         inputPeerForApiCalls = { _: 'inputPeerChannel', channel_id: peer.channel_id, access_hash: peer.access_hash };
      } else if (peer._ === 'peerChat' && peer.chat_id != null ) {
         inputPeerForApiCalls = { _: 'inputPeerChat', chat_id: peer.chat_id };
      }
    }

    if (!inputPeerForApiCalls) {
        // console.warn(`[transformDialogToCloudFolder] Could not construct a valid inputPeer for dialog:`, dialog.peer , `title: ${chatTitle}. Skipping this dialog.`);
        return null;
    }


    let cloudFolderId: string;
    if (peer._ === 'peerUser' && peer.user_id != null) {
        cloudFolderId = `user-${peer.user_id}`;
    } else if (peer._ === 'peerChat' && peer.chat_id != null) {
        cloudFolderId = `chat-${peer.chat_id}`;
    } else if (peer._ === 'peerChannel' && peer.channel_id != null) {
        cloudFolderId = `channel-${peer.channel_id}`;
    } else {
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
    const result = await api.call('messages.getDialogFilters');

    if (Array.isArray(result)) {
      return result as DialogFilter[];
    } else if (result && Array.isArray(result.filters)) {
      return result.filters as DialogFilter[];
    } else {
      return [];
    }
  } catch (error: any) {
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
  if (!(await isUserConnected())) {
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

    return {
      folders: transformedFolders,
      nextOffsetDate: newOffsetDate,
      nextOffsetId: newOffsetId,
      nextOffsetPeer: newOffsetPeerInput,
      hasMore: hasMore,
    };

  } catch (error:any) {
    throw error;
  }
}

export async function getChatMediaHistory(
  inputPeer: any,
  limit: number,
  offsetId: number = 0,
  isCloudChannelFetch: boolean = false
): Promise<MediaHistoryResponse> {
  if (!(await isUserConnected())) {
    return { files: [], hasMore: false, nextOffsetId: offsetId, isCloudChannelFetch };
  }
  if (!inputPeer) {
    return { files: [], hasMore: false, nextOffsetId: offsetId, isCloudChannelFetch };
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

    const cloudFiles: CloudFile[] = [];
    let newOffsetIdResult: number = offsetId;
    let hasMoreMessages = false;

    const messagesArray = historyResult.messages || [];

    if (messagesArray && messagesArray.length > 0) {
      messagesArray.forEach((msg: any) => {
        // For cloud channels, we process messages that have media OR just a message (caption for VFS structure)
        // For regular chats, we only process messages that have specific media types.
        const shouldProcessForCloud = isCloudChannelFetch && (msg.media || msg.message);
        const shouldProcessForRegular = !isCloudChannelFetch && msg.media && (msg.media._ === 'messageMediaPhoto' || msg.media._ === 'messageMediaDocument');

        if (shouldProcessForCloud || shouldProcessForRegular) {
          let fileType: CloudFile['type'] = 'unknown';
          let fileName = `file_${msg.id}`;
          let fileSize: string | undefined;
          let dataAiHint: string | undefined;
          let totalSizeInBytes: number | undefined;
          let mediaObjectForFile: any = null;

          // Consolidate media object extraction
          if (msg.media?.photo && msg.media.photo.id) {
            mediaObjectForFile = historyResult.photos?.find((p:any) => String(p.id) === String(msg.media.photo.id)) || msg.media.photo;
          } else if (msg.media?.document && msg.media.document.id) {
            mediaObjectForFile = historyResult.documents?.find((d:any) => String(d.id) === String(msg.media.document.id)) || msg.media.document;
          } else if (msg.media?.photo) { // Fallback if ID not found in separate arrays (e.g., from `updateMessageID`)
             mediaObjectForFile = msg.media.photo;
          } else if (msg.media?.document) {
             mediaObjectForFile = msg.media.document;
          }

          if (msg.media?._ === 'messageMediaPhoto' && mediaObjectForFile) {
            fileType = 'image';
            fileName = `photo_${mediaObjectForFile.id?.toString() || msg.id}_${msg.date}.jpg`;
            const largestSize = mediaObjectForFile.sizes?.find((s:any) => s.type === 'y') ||
                                mediaObjectForFile.sizes?.sort((a:any,b:any) => (b.w*b.h) - (a.w*a.h))[0];
            if(largestSize?.size !== undefined) {
              totalSizeInBytes = Number(largestSize.size);
              fileSize = formatFileSize(totalSizeInBytes);
            }
            dataAiHint = "photograph image";
          } else if (msg.media?._ === 'messageMediaDocument' && mediaObjectForFile) {
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
          } else if (isCloudChannelFetch && msg.message && !msg.media) { // Text-only message in cloud channel context
            fileName = `vfs_text_entry_${msg.id}`;
            fileType = 'unknown'; // It's not a file in the traditional sense, but represents VFS structure
          }

          // Ensure we push to cloudFiles if it's a cloud channel with a message (for VFS)
          // OR if it's any channel/chat with actual media.
          if ((isCloudChannelFetch && msg.message) || mediaObjectForFile) {
             cloudFiles.push({
              id: String(msg.id),
              messageId: msg.id,
              name: fileName,
              type: fileType,
              size: fileSize,
              totalSizeInBytes: totalSizeInBytes,
              timestamp: msg.date,
              url: undefined,
              dataAiHint: dataAiHint,
              telegramMessage: mediaObjectForFile || msg, // Store the richest media object or the full message
              inputPeer: inputPeer,
              caption: msg.message, // Store the original caption for VFS parsing
            });
          }
        }
      });

      if (messagesArray.length > 0) {
        newOffsetIdResult = messagesArray[messagesArray.length - 1].id;
      }

      if (historyResult._ === 'messages.messagesSlice' || historyResult._ === 'messages.channelMessages') {
        hasMoreMessages = messagesArray.length >= limit && (historyResult.count ? messagesArray.length < historyResult.count : true);
      } else {
        hasMoreMessages = false;
      }
    } else {
        hasMoreMessages = false;
    }
    return {
      files: cloudFiles,
      nextOffsetId: newOffsetIdResult,
      hasMore: hasMoreMessages,
      isCloudChannelFetch,
    };

  } catch (error:any) {
    throw error;
  }
}


export async function prepareFileDownloadInfo(file: CloudFile): Promise<FileDownloadInfo | null> {
  if (!file.telegramMessage) {
    return null;
  }

  const mediaObject = file.telegramMessage;
  let location: any = null;
  let totalSize: number = 0;
  let mimeType: string = 'application/octet-stream';

  const actualMedia = mediaObject.media ? mediaObject.media : mediaObject;


  if (actualMedia && (actualMedia._ === 'photo' || actualMedia._ === 'messageMediaPhoto')) {
    const photoData = actualMedia.photo || actualMedia;
    if (photoData.id && photoData.access_hash && photoData.file_reference) {
      const largestSize = photoData.sizes?.find((s: any) => s.type === 'y') ||
                          photoData.sizes?.sort((a: any, b: any) => (b.w * b.h) - (a.w * a.h))[0];
      if (largestSize) {
        location = {
          _: 'inputPhotoFileLocation',
          id: photoData.id,
          access_hash: photoData.access_hash,
          file_reference: photoData.file_reference,
          thumb_size: largestSize.type || '',
        };
        totalSize = Number(largestSize.size) || file.totalSizeInBytes || 0;
        mimeType = 'image/jpeg';
      }
    }
  }
  else if (actualMedia && (actualMedia._ === 'document' || actualMedia._ === 'messageMediaDocument')) {
    const documentData = actualMedia.document || actualMedia;
    if (documentData.id && documentData.access_hash && documentData.file_reference) {
      location = {
        _: 'inputDocumentFileLocation',
        id: documentData.id,
        access_hash: documentData.access_hash,
        file_reference: documentData.file_reference,
        thumb_size: '',
      };
      totalSize = Number(documentData.size) || file.totalSizeInBytes || 0;
      mimeType = documentData.mime_type || 'application/octet-stream';
    }
  }


  if (location && totalSize > 0) {
    return { location, totalSize, mimeType };
  } else {
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
    return { errorType: 'OTHER' as const };
  } catch (error: any) {
    if (error.name === 'AbortError' || (error.message && error.message.toLowerCase().includes('aborted'))) {
      return { errorType: 'OTHER' as const };
    }
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
        return { errorType: 'OTHER' as const };
    }

    if (result._ === 'upload.cdnFile' && result.bytes) {
      return { bytes: result.bytes, type: 'application/octet-stream' };
    }
    return { errorType: 'OTHER' as const };
  } catch (error: any)
   {
    if (error.name === 'AbortError' || (error.message && error.message.toLowerCase().includes('aborted'))) {
      return { errorType: 'OTHER' as const };
    }
    return { errorType: 'OTHER' as const };
  }
}

export async function refreshFileReference(item: DownloadQueueItemType): Promise<any | null> {
  if (!item.telegramMessage || !item.messageId || !item.inputPeer) {
      return null;
  }

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
        if (typeof newFileReference === 'object' && !(newFileReference instanceof Uint8Array)) {
        }
        return updatedMediaObject;
      }
    }
  } catch (error: any) {
    // console.error("[refreshFileReference] Error fetching message:", error.message, error.originalErrorObject || error);
  }
  return null;
}


export async function calculateSHA256(data: Uint8Array): Promise<Uint8Array> {
  try {
    const hash = cryptoSha256(data);
    return Promise.resolve(hash);
  } catch (error) {
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
  inputPeer: InputPeer,
  fileToUpload: File,
  onProgress: (percent: number) => void,
  signal?: AbortSignal,
  caption?: string
): Promise<any> {
  const client_file_id_str = generateRandomLong();
  const isBigFile = fileToUpload.size > TEN_MB;
  const totalChunks = Math.ceil(fileToUpload.size / UPLOAD_PART_SIZE);

  onProgress(0);

  for (let i = 0; i < totalChunks; i++) {
    if (signal?.aborted) {
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
          throw new Error(`Failed to save file part ${i}. Server response: ${JSON.stringify(partUploadResult)}`);
      }
      const progressPercent = Math.round(((i + 1) / totalChunks) * 90);
      onProgress(progressPercent);
    } catch (error: any) {
      throw error;
    }
  }

  onProgress(95);
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
      message: caption || '',
      random_id: generateRandomLong(),
    }, { signal });
    onProgress(100);
    return result;
  } catch (error: any) {
    throw error;
  }
}


export async function updateDialogFiltersOrder(order: number[]): Promise<boolean> {
  try {
    const result = await api.call('messages.updateDialogFiltersOrder', { order });
    return result === true || (typeof result === 'object' && result._ === 'boolTrue');
  } catch (error: any) {
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
    return null;
  } catch (error: any) {
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
    throw error;
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
    const createChannelResult = await api.call('channels.createChannel', {
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

    try {
        await api.call('messages.sendMessage', {
            peer: channelInputPeer,
            message: `Initializing Cloud Storage: ${title}... This message ensures the configuration message ID is stable.`,
            random_id: generateRandomLong(),
            no_webpage: true,
        });
    } catch (initMsgError) {
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
        await api.call('channels.deleteChannel', { channel: channelInputPeer });
        throw new Error("Internal error: Initial configuration message is too large. Channel creation aborted and cleaned up.");
    }

    const sendMessageResult = await api.call('messages.sendMessage', {
      peer: channelInputPeer,
      message: configJsonString,
      random_id: generateRandomLong(),
      no_webpage: true,
    });

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
        sentMessageInfo = { id: (sendMessageResult as any).id || CONFIG_MESSAGE_ID, note: "Config message sent, but full object not found in immediate response." };
    }

    await sleep(500); // Small delay before ensuring in folder
    await ensureChannelInCloudFolder(channelInputPeer, newChannel.title, true);

    return { channelInfo: newChannel, configMessageInfo: sentMessageInfo, initialConfig };

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

    let channelIsVerified = false;
    let parsedConfig: CloudChannelConfigV1 | null = null;

    try {
      const messagesResult = await api.call('channels.getMessages', {
        channel: channelInputPeer,
        id: [{ _: 'inputMessageID', id: CONFIG_MESSAGE_ID }],
      });

      if (messagesResult && messagesResult.messages && Array.isArray(messagesResult.messages)) {
        const configMessageEntry = messagesResult.messages.find((m: any) => m.id === CONFIG_MESSAGE_ID);

        if (configMessageEntry && typeof configMessageEntry.message === 'string' && configMessageEntry.message.trim() !== '' && configMessageEntry._ === 'message') {
          try {
            const tempConfig = JSON.parse(configMessageEntry.message);
            if (tempConfig && tempConfig.app_signature === CLOUDIFIER_APP_SIGNATURE_V1) {
              channelIsVerified = true;
              parsedConfig = tempConfig as CloudChannelConfigV1;
            }
          } catch (parseError) {
          }
        }
      }
    } catch (error: any) {
    }

    if (channelIsVerified && parsedConfig) {
      const cloudFolder = transformDialogToCloudFolder(dialog, allChatsFromDialogs, allUsersFromDialogs, true, parsedConfig);
      if (cloudFolder) {
        verifiedCloudChannels.push(cloudFolder);
        await ensureChannelInCloudFolder(channelInputPeer, channelInfo.title);
      }
    }
  }
  return verifiedCloudChannels;
}

async function getCloudChannelConfig(channelInputPeer: InputPeer): Promise<CloudChannelConfigV1 | null> {
  try {
    const messagesResult = await api.call('channels.getMessages', {
      channel: channelInputPeer,
      id: [{ _: 'inputMessageID', id: CONFIG_MESSAGE_ID }],
    });

    if (messagesResult && messagesResult.messages && Array.isArray(messagesResult.messages)) {
      const configMessage = messagesResult.messages.find((m:any) => m.id === CONFIG_MESSAGE_ID);
      if (configMessage && typeof configMessage.message === 'string' && configMessage.message.trim() !== '' && configMessage._ === 'message') {
        try {
          const tempConfig = JSON.parse(configMessage.message);
          if (tempConfig && tempConfig.app_signature === CLOUDIFIER_APP_SIGNATURE_V1) {
            return tempConfig as CloudChannelConfigV1;
          }
        } catch (parseError) {
          return null;
        }
      }
    }
  } catch (error: any) {
    // console.error("Error fetching config message for update:", error);
  }
  return null;
}

async function updateCloudChannelConfig(channelInputPeer: InputPeer, newConfig: CloudChannelConfigV1): Promise<boolean> {
  try {
    const newConfigJson = JSON.stringify(newConfig, null, 2);
    if (new TextEncoder().encode(newConfigJson).length >= 4000) {
      throw new Error("Updated configuration message is too large.");
    }
    const result = await api.call('messages.editMessage', {
      peer: channelInputPeer,
      id: CONFIG_MESSAGE_ID,
      message: newConfigJson,
      no_webpage: true,
    });
    return !!result; // Check for truthiness, as editMessage returns Updates object
  } catch (error: any) {
    // console.error("Failed to update cloud channel config:", error);
    return false;
  }
}

export async function addVirtualFolderToCloudChannel(
  channelInputPeer: InputPeer,
  parentVirtualPath: string,
  newFolderName: string
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
       // console.error(`Path segment "${segment}" not found or not a folder in config for path "${parentVirtualPath}". Current segment entries:`, targetEntries);
       throw new Error(`Path segment "${segment}" not found or not a folder in config for path "${parentVirtualPath}". Review config structure.`);
    }
    targetEntries = targetEntries[segment].entries!;
  }

  if (targetEntries[newFolderName]) {
    throw new Error(`Folder "${newFolderName}" already exists at path "${parentVirtualPath}".`);
  }

  const now = new Date().toISOString();
  targetEntries[newFolderName] = {
    type: 'folder',
    name: newFolderName,
    created_at: now,
    modified_at: now,
    entries: {},
  };

  currentConfig.last_updated_timestamp_utc = now;

  const success = await updateCloudChannelConfig(channelInputPeer, currentConfig);

  return success ? currentConfig : null;
}


// --- Real-time Update Handling ---
let onNewCloudChannelVerifiedCallback: ((cloudFolder: CloudFolder, source: 'update' | 'initialScan') => void) | null = null;
let isTelegramUpdateListenerActive = false;

async function verifyAndProcessSinglePotentialCloudChannel(
  receivedInputPeer: InputPeer,
  channelObject: any,
  usersForTitleContext: any[] = []
): Promise<void> {
  if (!onNewCloudChannelVerifiedCallback || !channelObject) return;

  let definitiveInputPeer: InputPeer;
  if (channelObject._ === 'channel' && channelObject.id && channelObject.access_hash !== undefined) {
    definitiveInputPeer = {
      _: 'inputPeerChannel',
      channel_id: channelObject.id,
      access_hash: channelObject.access_hash,
    };
  } else if (receivedInputPeer._ === 'inputPeerChannel' && receivedInputPeer.channel_id && receivedInputPeer.access_hash) {
    definitiveInputPeer = receivedInputPeer;
  } else {
    return;
  }

  let parsedConfig: CloudChannelConfigV1 | null = null;
  try {
    const messagesResult = await api.call('channels.getMessages', {
      channel: definitiveInputPeer,
      id: [{ _: 'inputMessageID', id: CONFIG_MESSAGE_ID }],
    });

    if (messagesResult && messagesResult.messages && Array.isArray(messagesResult.messages)) {
      const configMessageEntry = messagesResult.messages.find((m: any) => m.id === CONFIG_MESSAGE_ID);
      if (configMessageEntry && typeof configMessageEntry.message === 'string' && configMessageEntry.message.trim() !== '' && configMessageEntry._ === 'message') {
        try {
          const tempConfig = JSON.parse(configMessageEntry.message);
          if (tempConfig && tempConfig.app_signature === CLOUDIFIER_APP_SIGNATURE_V1) {
            parsedConfig = tempConfig as CloudChannelConfigV1;
          }
        } catch (parseError) { /* Not a valid JSON config */ }
      }
    }
  } catch (error) {
    return;
  }

  if (parsedConfig) {
    const mockDialog = {
      peer: {
        _: 'peerChannel',
        channel_id: definitiveInputPeer.channel_id,
        access_hash: definitiveInputPeer.access_hash
      },
      top_message: 0,
    };
    const cloudFolder = transformDialogToCloudFolder(mockDialog, [channelObject], usersForTitleContext, true, parsedConfig);
    if (cloudFolder) {
      onNewCloudChannelVerifiedCallback(cloudFolder, 'update');
      await ensureChannelInCloudFolder(definitiveInputPeer, channelObject.title || `Channel ${definitiveInputPeer.channel_id}`);
    }
  }
}


async function handleTelegramUpdate(updateInfo: any): Promise<void> {
  if (!updateInfo || !onNewCloudChannelVerifiedCallback) return;

  const updatesToProcess: any[] = [];
  const chatsFromUpdate = updateInfo.chats || [];
  const usersFromUpdate = updateInfo.users || [];


  if (updateInfo._ === 'updatesCombined' || updateInfo._ === 'updates') {
    if (Array.isArray(updateInfo.updates)) {
      updatesToProcess.push(...updateInfo.updates);
    }
     if (Array.isArray(updateInfo.chats)) chatsFromUpdate.push(...updateInfo.chats.filter((c:any) => !chatsFromUpdate.some((existing:any) => existing.id === c.id)));
     if (Array.isArray(updateInfo.users)) usersFromUpdate.push(...updateInfo.users.filter((u:any) => !usersFromUpdate.some((existing:any) => existing.id === u.id)));

  } else {
    updatesToProcess.push(updateInfo);
  }

  for (const update of updatesToProcess) {
    let channelEntityToVerify: any = null;
    let peerFromUpdate: InputPeer | null = null;

    if (update._ === 'updateNewChannel') {
      channelEntityToVerify = update.channel || chatsFromUpdate.find((c:any) => c.id === update.channel_id);
      if(channelEntityToVerify && channelEntityToVerify.access_hash !== undefined) {
        peerFromUpdate = { _: 'inputPeerChannel', channel_id: channelEntityToVerify.id, access_hash: channelEntityToVerify.access_hash };
      }
    } else if (update._ === 'updateNewChannelMessage' && update.message) {
      const message = update.message;
      if (message.id === CONFIG_MESSAGE_ID && typeof message.message === 'string' && message.message.trim() !== '' && message._ === 'message') {
        const channelIdFromMessage = message.peer_id?.channel_id || message.to_id?.channel_id;
        if (channelIdFromMessage) {
          channelEntityToVerify = chatsFromUpdate.find((c:any) => String(c.id) === String(channelIdFromMessage));
          if (channelEntityToVerify && channelEntityToVerify.access_hash !== undefined) {
            peerFromUpdate = {
              _: 'inputPeerChannel',
              channel_id: channelEntityToVerify.id,
              access_hash: channelEntityToVerify.access_hash,
            };
          }
        }
      }
    }

    if (channelEntityToVerify && peerFromUpdate && channelEntityToVerify.access_hash !== undefined) {
      await verifyAndProcessSinglePotentialCloudChannel(peerFromUpdate, channelEntityToVerify, usersFromUpdate);
    }
  }
}

export function initializeTelegramUpdateListener(callback: (cloudFolder: CloudFolder, source: 'update' | 'initialScan') => void): void {
  if (!api || !api.mtproto || !api.mtproto.updates || isTelegramUpdateListenerActive) {
    return;
  }
  onNewCloudChannelVerifiedCallback = callback;
  api.mtproto.updates.on('updates', handleTelegramUpdate);
  api.mtproto.updates.on('updatesCombined', handleTelegramUpdate);
  isTelegramUpdateListenerActive = true;
}

function areInputPeersEqual(peer1?: InputPeer, peer2?: InputPeer): boolean {
    if (!peer1 || !peer2) return false;
    if (peer1._ !== peer2._) return false;
    switch (peer1._) {
        case 'inputPeerUser':
            return String(peer1.user_id) === String((peer2 as any).user_id);
        case 'inputPeerChat':
            return String(peer1.chat_id) === String((peer2 as any).chat_id);
        case 'inputPeerChannel':
            return String(peer1.channel_id) === String((peer2 as any).channel_id);
        default:
            return JSON.stringify(peer1) === JSON.stringify(peer2);
    }
}


async function ensureChannelInCloudFolder(channelInputPeer: InputPeer, channelTitleForLog: string, isNewChannelCreation: boolean = false): Promise<boolean> {
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
        cloudifierFolder.include_peers = []; // Initialize if undefined
      }

      if (!cloudifierFolder.include_peers.some(p => areInputPeersEqual(p, channelInputPeer))) {
        cloudifierFolder.include_peers.push(channelInputPeer);
        updateNeeded = true;
      }

      // Ensure all included peers are channels (though our logic should only add channels)
      cloudifierFolder.include_peers = cloudifierFolder.include_peers.filter(p => p._ === 'inputPeerChannel');

      // Manage flags
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
        await api.call('messages.updateDialogFilter', { id: CLOUDIFIER_MANAGED_FOLDER_ID, filter: cloudifierFolder });
      }
    } else {
      const newFilter: DialogFilter = {
        _: 'dialogFilter',
        id: CLOUDIFIER_MANAGED_FOLDER_ID,
        title: CLOUDIFIER_MANAGED_FOLDER_NAME,
        include_peers: [channelInputPeer].filter(p => p._ === 'inputPeerChannel'), // Ensure only channels are added
        pinned_peers: [],
        exclude_peers: [],
        contacts: false, non_contacts: false, groups: false, broadcasts: true, bots: false,
        exclude_muted: false, exclude_read: false, exclude_archived: false,
        flags: includePeersFlag | broadcastsFlag
      };

      await api.call('messages.updateDialogFilter', { id: CLOUDIFIER_MANAGED_FOLDER_ID, filter: newFilter });
      updateNeeded = true;
    }
    return updateNeeded;
  } catch (error) {
    // console.error(`Error in ensureChannelInCloudFolder for ${channelTitleForLog} (ID: ${CLOUDIFIER_MANAGED_FOLDER_ID}):`, error);
    return false;
  }
}


if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  (window as any).telegramServiceApi = api;
  (window as any).telegramUserSession = userSession;
}


    