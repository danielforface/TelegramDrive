
'use client';

import MTProto from '@mtproto/core/envs/browser';
import type { CloudFolder } from '@/types';

// Ensure NEXT_PUBLIC_ variables are loaded
const API_ID_STRING = process.env.NEXT_PUBLIC_TELEGRAM_API_ID;
const API_HASH = process.env.NEXT_PUBLIC_TELEGRAM_API_HASH;

let API_ID: number | undefined = undefined;
if (API_ID_STRING) {
  API_ID = parseInt(API_ID_STRING, 10);
  if (isNaN(API_ID)) {
    console.error(
      'NEXT_PUBLIC_TELEGRAM_API_ID is not a valid number. Real connection will fail.'
    );
    API_ID = undefined; // Ensure it's undefined if NaN
  }
} else {
   console.warn(
    'NEXT_PUBLIC_TELEGRAM_API_ID is not set in environment variables. Real connection will fail. Please ensure it is set in your .env.local file and you have restarted your development server.'
  );
}

if (!API_HASH) {
  console.warn(
    'NEXT_PUBLIC_TELEGRAM_API_HASH is not set in environment variables. Real connection will fail. Please ensure it is set in your .env.local file and you have restarted your development server.'
  );
}

// --- User Session ---
let userSession: {
  phone?: string;
  phone_code_hash?: string;
  user?: any;
  srp_id?: string; // Stored as string because it can be a BigInt
  srp_params?: { // Parameters needed for SRP checkPassword
    g: number;
    p: Uint8Array;
    salt1: Uint8Array;
    salt2: Uint8Array;
    srp_B: Uint8Array; // server's public ephemeral
  };
} = {};

// Helper for sleep
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
    this.mtproto = new MTProto({
      api_id: API_ID,
      api_hash: API_HASH,
      // For browser environment, localStorage is used by default.
    });
    console.log('MTProto client initialized via API class for browser environment.');

    // Listen for updates
    this.mtproto.updates.on('updatesTooLong', (updateInfo: any) => {
      console.log('updatesTooLong:', updateInfo);
    });
    this.mtproto.updates.on('updateShortMessage', (updateInfo: any) => {
      console.log('updateShortMessage:', updateInfo);
      // Example: { _: 'updateShortMessage', out: false, mentioned: false, media_unread: false, silent: false, id: 12345, user_id: '123', message: 'Hello!', pts: 100, pts_count: 1, date: 1678886400, fwd_from: null, via_bot_id: null, reply_to: null, entities: [] }
    });
    this.mtproto.updates.on('updateShortChatMessage', (updateInfo: any) => {
      console.log('updateShortChatMessage:', updateInfo);
      // Example: { _: 'updateShortChatMessage', out: false, mentioned: false, media_unread: false, silent: false, id: 12346, from_id: '123', chat_id: '456', message: 'Hi all!', pts: 101, pts_count: 1, date: 1678886500, fwd_from: null, via_bot_id: null, reply_to: null, entities: [] }
    });
    this.mtproto.updates.on('updateShort', (updateInfo: any) => {
      console.log('updateShort:', updateInfo);
      // Example: { _: 'updateShort', update: { _: 'updateUserStatus', user_id: '123', status: { _: 'userStatusOnline', expires: 1678887000 } }, date: 1678886600 }
    });
    this.mtproto.updates.on('updatesCombined', (updateInfo: any) => {
      console.log('updatesCombined:', updateInfo);
      // Example: { _: 'updatesCombined', updates: [ ... ], users: [ ... ], chats: [ ... ], date: 1678886700, seq_start: 10, seq: 12 }
    });
    this.mtproto.updates.on('updates', (updateInfo: any) => {
      console.log('updates:', updateInfo);
      // Example: { _: 'updates', updates: [ ... ], users: [ ... ], chats: [ ... ], date: 1678886800, seq: 15 }
    });
    this.mtproto.updates.on('updateShortSentMessage', (updateInfo: any) => {
      console.log('updateShortSentMessage:', updateInfo);
      // Example: { _: 'updateShortSentMessage', out: true, id: 12347, pts: 102, pts_count: 1, date: 1678886900, media: null, entities: [] }
    });
  }

  async call(method: string, params: any = {}, options: any = {}): Promise<any> {
    try {
      const result = await this.mtproto.call(method, params, options);
      return result;
    } catch (error: any) {
      console.warn(`MTProto call '${method}' error:`, error);

      const { error_code, error_message } = error;

      if (error_code === 420) { // FLOOD_WAIT_X
        const secondsStr = error_message.split('FLOOD_WAIT_')[1];
        const seconds = parseInt(secondsStr, 10);
        if (!isNaN(seconds)) {
            const ms = seconds * 1000;
            console.log(`Flood wait: waiting ${seconds}s before retrying ${method}.`);
            await sleep(ms);
            return this.call(method, params, options); // Retry
        } else {
            console.error(`Could not parse flood wait time from: ${error_message}`);
        }
      }

      if (error_code === 303) { // *_MIGRATE_X
        const migrateMatch = error_message.match(/([A-Z_]+)_MIGRATE_(\d+)/);
        if (migrateMatch && migrateMatch[1] && migrateMatch[2]) {
            const type = migrateMatch[1];
            const dcId = Number(migrateMatch[2]);

            console.log(`${type}_MIGRATE_X error. Attempting to migrate to DC ${dcId} for ${method}...`);

            if (type === 'PHONE') {
              // For auth.sendCode, we need to change the default DC for subsequent calls like auth.signIn
              console.log(`Setting default DC to ${dcId} due to PHONE_MIGRATE.`);
              await this.mtproto.setDefaultDc(dcId);
            } else {
              // For other calls, we pass the dcId in options for this specific call
              console.log(`Retrying ${method} with dcId ${dcId}.`);
              Object.assign(options, { dcId });
            }
            return this.call(method, params, options); // Retry with new DC/options
        } else {
            console.error(`Could not parse migrate DC from: ${error_message}`);
        }
      }
      // For other errors, re-throw them to be handled by the calling function
      return Promise.reject(error);
    }
  }
}

const api = new API();


// --- API Service Functions ---

export async function sendCode(phoneNumber: string): Promise<string> {
  userSession = { phone: phoneNumber }; // Reset user session for new phone number
  console.log(`Attempting to send code to ${phoneNumber} via API class`);

  const sendCodePayload = {
    phone_number: phoneNumber,
    // api_id and api_hash are set in MTProto constructor, not needed here directly for api.call
    settings: {
      _: 'codeSettings',
    },
  };

  try {
    const result = await api.call('auth.sendCode', sendCodePayload);
    if (!result.phone_code_hash) throw new Error("phone_code_hash not received from Telegram.");
    userSession.phone_code_hash = result.phone_code_hash;
    console.log('Verification code sent, phone_code_hash:', result.phone_code_hash);
    return result.phone_code_hash;
  } catch (error: any) {
    // Errors like AUTH_RESTART, PHONE_NUMBER_INVALID etc. will be propagated here by api.call
    console.error('Error in sendCode function after api.call:', error);
    const message = error.error_message || (error.message || 'Failed to send code.');
     if (message === 'AUTH_RESTART') {
         throw new Error('AUTH_RESTART');
    }
    throw new Error(message);
  }
}

export async function signIn(code: string): Promise<{ user?: any; error?: string; srp_id?: string }> {
  if (!userSession.phone || !userSession.phone_code_hash) {
    console.error('Phone number or phone_code_hash missing for signIn. Call sendCode first.');
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
    }
    return { user: result.user };

  } catch (error: any) {
    console.warn('Error in signIn function after api.call:', error);
    if (error.error_message === 'SESSION_PASSWORD_NEEDED') {
      console.log('2FA password needed. Fetching password details...');
      try {
        const passwordData = await api.call('account.getPassword');
        console.log('Password data received (account.getPassword):', passwordData);

        if (!passwordData.srp_id || !passwordData.current_algo || !passwordData.srp_B) {
             console.error("Failed to get complete SRP parameters from account.getPassword. Response:", passwordData);
             throw new Error('Failed to initialize 2FA: Missing critical SRP parameters (srp_id, current_algo, or srp_B).');
        }
         if (!passwordData.current_algo.p || passwordData.current_algo.p.length === 0) {
            console.error("SRP parameter 'p' is missing or empty in current_algo.", passwordData.current_algo);
            throw new Error("Failed to initialize 2FA: SRP parameter 'p' is missing or empty.");
        }
        if (!passwordData.srp_B || passwordData.srp_B.length === 0) {
            console.error("SRP parameter 'srp_B' is missing or empty.", passwordData);
            throw new Error("Failed to initialize 2FA: SRP parameter 'srp_B' is missing or empty.");
        }
        if (typeof passwordData.current_algo.g !== 'number') {
            console.error("SRP parameter 'g' is missing or not a number in current_algo.", passwordData.current_algo);
            throw new Error("Failed to initialize 2FA: SRP parameter 'g' is missing or not a number.");
        }
         if (!passwordData.current_algo.salt1 || passwordData.current_algo.salt1.length === 0) {
            console.error("SRP parameter 'salt1' is missing or empty in current_algo.", passwordData.current_algo);
            throw new Error("Failed to initialize 2FA: SRP parameter 'salt1' is missing or empty.");
        }
        if (!passwordData.current_algo.salt2 || passwordData.current_algo.salt2.length === 0) {
            console.error("SRP parameter 'salt2' is missing or empty in current_algo.", passwordData.current_algo);
            throw new Error("Failed to initialize 2FA: SRP parameter 'salt2' is missing or empty.");
        }
        
        // srp_id can be a BigInt like object, convert to string for consistency
        userSession.srp_id = passwordData.srp_id.toString(); 
        userSession.srp_params = {
            g: passwordData.current_algo.g,
            p: passwordData.current_algo.p, // Uint8Array
            salt1: passwordData.current_algo.salt1, // Uint8Array
            salt2: passwordData.current_algo.salt2, // Uint8Array
            srp_B: passwordData.srp_B // Uint8Array
        };

        console.log('SRP parameters stored for 2FA:', {
            srp_id: userSession.srp_id,
            g: userSession.srp_params.g,
            p_length: userSession.srp_params.p.length,
            salt1_length: userSession.srp_params.salt1.length,
            salt2_length: userSession.srp_params.salt2.length,
            srp_B_length: userSession.srp_params.srp_B.length,
        });
        
        const twoFactorError: any = new Error('2FA_REQUIRED'); // This is intentionally thrown to signal UI
        twoFactorError.srp_id = userSession.srp_id; 
        throw twoFactorError;

      } catch (getPasswordError: any) {
        console.error('Error fetching password details for 2FA:', getPasswordError);
        if (getPasswordError.message === '2FA_REQUIRED' && getPasswordError.srp_id) throw getPasswordError; // Re-throw if it's already our custom error

        const message = getPasswordError.error_message || (getPasswordError.message || 'Failed to fetch 2FA details.');
        throw new Error(message);
      }
    }
    // Propagate other errors
    const message = error.error_message || (error.message || 'Failed to sign in.');
    throw new Error(message);
  }
}


export async function checkPassword(password: string): Promise<any> {
  if (!userSession.srp_id || !userSession.srp_params) {
    console.error("SRP parameters not available for checkPassword. 2FA flow not properly initiated or srp_params missing.");
    throw new Error('SRP parameters not available. Please try the login process again.');
  }

  try {
    const { g, p, salt1, salt2, srp_B } = userSession.srp_params;
    console.log("Attempting to get SRPParams with:", { g, p_len: p.length, salt1_len: salt1.length, salt2_len: salt2.length, gB_len: srp_B.length, password_len: password.length });
    
    // Use the library's crypto helper to get A and M1
    const { A, M1 } = await api.mtproto.crypto.getSRPParams({
        g,
        p,
        salt1,
        salt2,
        gB: srp_B, // This is srp_B from account.getPassword
        password,
    });
    console.log("SRP A and M1 computed by library. Calling auth.checkPassword...");

    const checkResult = await api.call('auth.checkPassword', {
        password: {
            _: 'inputCheckPasswordSRP',
            srp_id: userSession.srp_id, // srp_id from account.getPassword
            A: A, // Computed A
            M1: M1, // Computed M1
        }
    });

    console.log('2FA password check result:', checkResult);
    if (checkResult.user) {
        userSession.user = checkResult.user;
    }
    // Clear SRP params after successful or attempted 2FA
    delete userSession.srp_params;
    delete userSession.srp_id;
    return checkResult.user;

  } catch (error: any) {
    console.error('Error checking password:', error);
    // Clear SRP params on error as well, as they might be stale
    delete userSession.srp_params;
    delete userSession.srp_id;
    const message = error.error_message || (error.message || 'Failed to check 2FA password.');
    if (message === 'PASSWORD_HASH_INVALID') {
        throw new Error('Invalid password. Please try again. (PASSWORD_HASH_INVALID)');
    }
    if (message === 'SRP_ID_INVALID') {
        throw new Error('Session for 2FA has expired or is invalid. Please try logging in again. (SRP_ID_INVALID)');
    }
    throw new Error(message);
  }
}


export async function getTelegramChats(): Promise<CloudFolder[]> {
  if (!userSession.user) {
    console.warn('User not signed in. Cannot fetch chats.');
    return [];
  }

  console.log('Fetching user dialogs (chats)...');
  try {
    const dialogsResult = await api.call('messages.getDialogs', {
      offset_date: 0,
      offset_id: 0,
      offset_peer: { _: 'inputPeerEmpty' },
      limit: 100, 
      hash: 0, 
    });
    console.log('Dialogs raw result:', dialogsResult);
    return transformDialogsToCloudFolders(dialogsResult);
  } catch (error:any) {
    console.error('Error fetching dialogs:', error);
    const message = error.error_message || (error.message || 'Failed to fetch chats.');
    throw new Error(message);
  }
}

function getPeerTitle(peer: any, chats: any[], users: any[]): string {
  if (!peer) return 'Unknown Peer';

  try {
    // Ensure IDs are treated as strings for comparison, as they can be BigInts from the API
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
    // Fallback ID display if possible
    if(peer.user_id) return `User ${peer.user_id.toString()}`;
    if(peer.chat_id) return `Chat ${peer.chat_id.toString()}`;
    if(peer.channel_id) return `Channel ${peer.channel_id.toString()}`;
  }
  console.warn("Could not determine peer title for:", peer);
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

    let chatId: string | undefined;
    if (peer.user_id) chatId = peer.user_id.toString();
    else if (peer.chat_id) chatId = peer.chat_id.toString();
    else if (peer.channel_id) chatId = peer.channel_id.toString();

    if (!chatId) {
        console.warn("Could not determine chatId for dialog's peer:", dialog.peer);
        return null; // Skip this dialog if we can't get a unique ID
    }
    
    return {
      id: `chat-${chatId}`,
      name: chatTitle,
      isChatFolder: true,
      files: [], 
      folders: [
        { id: `chat-${chatId}-images`, name: "Images", files: [], folders: [] },
        { id: `chat-${chatId}-videos`, name: "Videos", files: [], folders: [] },
        { id: `chat-${chatId}-audio`, name: "Audio Messages & Music", files: [], folders: [] },
        { id: `chat-${chatId}-documents`, name: "Documents & Files", files: [], folders: [] },
        { id: `chat-${chatId}-other`, name: "Other Media", files: [], folders: [] },
      ],
    };
  }).filter(folder => folder !== null) as CloudFolder[]; // Ensure only valid CloudFolder objects are returned
}


export async function signOut(): Promise<void> {
  try {
    const result = await api.call('auth.logOut');
    console.log('Signed out successfully from Telegram server:', result);
  } catch (error: any) {
    console.error('Error signing out from Telegram server:', error);
    // Even if server logout fails, clear local session
  } finally {
    userSession = {};
    // mtproto-core (browser env) handles its own localStorage for session data.
    // We clear our app-specific userSession object here.
    console.log('Local userSession object cleared.');
  }
}

export async function isUserConnected(): Promise<boolean> {
  if (userSession.user) {
    try {
        // A lightweight call to check session validity without fetching extensive data
        await api.call('users.getUsers', {id: [{_: 'inputUserSelf'}]});
        console.log("User session is active (checked with users.getUsers).");
        return true;
    } catch (error: any) {
        // Check for specific auth-related error messages that indicate an invalid session
        if (error.error_message && ['AUTH_KEY_UNREGISTERED', 'USER_DEACTIVATED', 'SESSION_REVOKED', 'SESSION_EXPIRED', 'API_ID_INVALID', 'API_KEY_INVALID', 'AUTH_RESTART'].includes(error.error_message)) {
            console.warn("User session no longer valid or API keys incorrect:", error.error_message, "Logging out locally.");
            await signOut(); // Perform local and attempt server logout
            return false;
        }
        // For other errors, it's ambiguous. The user object exists, but an API call failed.
        // Depending on strictness, could return true or false or try another check.
        // For now, if user object exists but a simple call fails for other reasons, assume connection might still be partly valid or recoverable.
        console.warn("API call failed during connected check, but might not be an auth error. Assuming connected as user object exists locally.", error.error_message);
        return true; // Or false, if stricter validation is needed.
    }
  }
  return false;
}

console.log('Telegram service (telegramService.ts) loaded with API class wrapper and update listeners.');
if (API_ID === undefined || !API_HASH) {
  console.error("CRITICAL: Telegram API_ID or API_HASH is not configured correctly in .env.local. Service will not function. Ensure NEXT_PUBLIC_TELEGRAM_API_ID and NEXT_PUBLIC_TELEGRAM_API_HASH are set and the dev server was restarted.");
}

