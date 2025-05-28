
'use client';

import MTProto from '@mtproto/core/envs/browser';
import type { CloudFolder, GetChatsPaginatedResponse } from '@/types';

// Ensure NEXT_PUBLIC_ variables are loaded
const API_ID_STRING = process.env.NEXT_PUBLIC_TELEGRAM_API_ID;
const API_HASH = process.env.NEXT_PUBLIC_TELEGRAM_API_HASH;

let API_ID: number | undefined = undefined;
if (API_ID_STRING) {
  API_ID = parseInt(API_ID_STRING, 10);
  if (isNaN(API_ID)) {
    console.error(
      'NEXT_PUBLIC_TELEGRAM_API_ID is not a valid number. Real connection will fail. Please ensure it is a number in your .env.local file and you have restarted your development server.'
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
  srp_id?: string; // Stored as string
  srp_params?: { // Parameters needed for SRP calculation
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

// --- LocalStorage Helpers ---
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

// Attempt to load user from localStorage when the service module is initialized
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
    this.mtproto = new MTProto({
      api_id: API_ID,
      api_hash: API_HASH,
      // storageOptions are not needed for browser env, it uses localStorage by default
    });
    console.log('MTProto client initialized via API class for browser environment.');

    // Listen for updates
    this.mtproto.updates.on('updatesTooLong', (updateInfo: any) => {
      console.log('updatesTooLong:', updateInfo);
    });
    this.mtproto.updates.on('updateShortMessage', (updateInfo: any) => {
      console.log('updateShortMessage:', updateInfo);
    });
    this.mtproto.updates.on('updateShortChatMessage', (updateInfo: any) => {
      console.log('updateShortChatMessage:', updateInfo);
    });
    this.mtproto.updates.on('updateShort', (updateInfo: any) => {
      console.log('updateShort:', updateInfo);
    });
    this.mtproto.updates.on('updatesCombined', (updateInfo: any) => {
      console.log('updatesCombined:', updateInfo);
    });
    this.mtproto.updates.on('updates', (updateInfo: any) => {
      console.log('updates:', updateInfo);
    });
    this.mtproto.updates.on('updateShortSentMessage', (updateInfo: any) => {
      console.log('updateShortSentMessage:', updateInfo);
    });
  }

  async call(method: string, params: any = {}, options: any = {}): Promise<any> {
    try {
      const result = await this.mtproto.call(method, params, options);
      return result;
    } catch (originalError: any) {
      console.warn(`MTProto call '${method}' raw error object:`, JSON.stringify(originalError, null, 2));

      const { error_code, error_message } = originalError;

      if (error_code === 420) { // FLOOD_WAIT_X
        const secondsStr = typeof error_message === 'string' ? error_message.split('FLOOD_WAIT_')[1] : '';
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

      if (error_code === 303 && typeof error_message === 'string') { // *_MIGRATE_X
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
            return this.call(method, params, options); // Retry with new DC/options
        } else {
            console.error(`Could not parse migrate DC from: ${error_message}`);
        }
      }
      
      // Ensure a proper error object is thrown
      let processedError;
      if (originalError instanceof Error && originalError.message) {
        processedError = originalError;
      } else if (typeof originalError === 'object' && originalError !== null && (originalError.error_message || originalError.message)) {
        processedError = new Error(originalError.error_message || originalError.message);
      } else {
        processedError = new Error(`MTProto call '${method}' failed with an unrecognized error object: ${JSON.stringify(originalError)}`);
      }
      
      if (originalError !== processedError && typeof originalError === 'object' && originalError !== null) {
        (processedError as any).originalErrorObject = originalError;
      }
      return Promise.reject(processedError);
    }
  }
}

const api = new API();


// --- API Service Functions ---

export async function sendCode(phoneNumber: string): Promise<string> {
  userSession = { phone: phoneNumber }; // Reset parts of user session relevant to new auth flow
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
    console.log('Verification code sent, phone_code_hash:', result.phone_code_hash);
    return result.phone_code_hash;
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
        saveUserToLocalStorage(userSession.user); // Save to localStorage
    }
    return { user: result.user };

  } catch (error: any) {
    console.warn('Error in signIn function after api.call:', error.message, error.originalErrorObject || error);
    const errorMessage = error.message;

    if (errorMessage === 'SESSION_PASSWORD_NEEDED' || error.originalErrorObject?.error_message === 'SESSION_PASSWORD_NEEDED') {
      console.log('2FA password needed. Fetching password details...');
      try {
        const passwordData = await api.call('account.getPassword');
        console.log('Password data received (account.getPassword):', passwordData);

        if (!passwordData.srp_id || !passwordData.current_algo || !passwordData.srp_B) {
             console.error("Failed to get complete SRP parameters from account.getPassword. Response:", passwordData);
             throw new Error('Failed to initialize 2FA: Missing critical SRP parameters (srp_id, current_algo, or srp_B).');
        }
        // Further validation of SRP params can be added here as before
        
        userSession.srp_id = passwordData.srp_id.toString(); // Ensure srp_id is a string
        userSession.srp_params = {
            g: passwordData.current_algo.g,
            p: passwordData.current_algo.p,
            salt1: passwordData.current_algo.salt1,
            salt2: passwordData.current_algo.salt2,
            srp_B: passwordData.srp_B
        };
        
        const twoFactorError: any = new Error('2FA_REQUIRED');
        twoFactorError.srp_id = userSession.srp_id;
        throw twoFactorError;

      } catch (getPasswordError: any) {
        console.error('Error fetching password details for 2FA:', getPasswordError.message, getPasswordError.originalErrorObject || getPasswordError);
        if (getPasswordError.message === '2FA_REQUIRED' && getPasswordError.srp_id) throw getPasswordError; // re-throw if it's already the specific 2FA error
        const message = getPasswordError.message || 'Failed to fetch 2FA details.';
        throw new Error(message);
      }
    }
    throw new Error(errorMessage || 'Failed to sign in.');
  }
}


export async function checkPassword(password: string): Promise<any> {
  if (!userSession.srp_id || !userSession.srp_params) {
    console.error("SRP parameters not available for checkPassword. 2FA flow not properly initiated or srp_params missing.");
    delete userSession.srp_params; // Clean up potentially stale/incomplete params
    delete userSession.srp_id;
    throw new Error('SRP parameters not available. Please try the login process again.');
  }

  try {
    const { g, p, salt1, salt2, srp_B } = userSession.srp_params;
    console.log("Attempting to get SRPParams for checkPassword with provided password and stored srp_params.");

    // Use mtproto-core's crypto helper to get A and M1
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
            A: A,                      // Computed A
            M1: M1,                    // Computed M1
        }
    });

    console.log('2FA password check result:', checkResult);
    if (checkResult.user) {
        userSession.user = checkResult.user;
        saveUserToLocalStorage(userSession.user); // Save to localStorage
    }
    // Clean up SRP params after attempt, successful or not, to prevent reuse with wrong password
    delete userSession.srp_params;
    delete userSession.srp_id;
    return checkResult.user;

  } catch (error: any) {
    console.error('Error checking password:', error.message, error.originalErrorObject || error);
    // Clean up SRP params on failure as well
    delete userSession.srp_params;
    delete userSession.srp_id;

    const message = error.message || 'Failed to check 2FA password.';
    if (message === 'PASSWORD_HASH_INVALID' || error.originalErrorObject?.error_message === 'PASSWORD_HASH_INVALID') {
        throw new Error('Invalid password. Please try again. (PASSWORD_HASH_INVALID)');
    }
    if (message === 'SRP_ID_INVALID' || error.originalErrorObject?.error_message === 'SRP_ID_INVALID') {
        throw new Error('Session for 2FA has expired or is invalid. Please try logging in again. (SRP_ID_INVALID)');
    }
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
    // Ensure a valid empty response structure if user is not signed in
    return { folders: [], nextOffsetDate: 0, nextOffsetId: 0, nextOffsetPeer: { _: 'inputPeerEmpty' }, hasMore: false };
  }

  console.log('Fetching user dialogs (chats) with params:', { limit, offsetDate, offsetId, offsetPeer });
  try {
    // hash is typically 0 for paginated requests, unless the server provides a new hash
    // for features like `messages.getDialogs#track_total_hits` which is not used here.
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
    let newOffsetPeer = offsetPeer;
    let hasMore = false;

    // Determine next offset values
    if (dialogsResult.dialogs && dialogsResult.dialogs.length > 0) {
      // hasMore is true if the number of dialogs returned is equal to the limit requested
      hasMore = dialogsResult.dialogs.length === limit;
      
      if (hasMore) { // Only update offsets if we expect more data
        const lastDialog = dialogsResult.dialogs[dialogsResult.dialogs.length - 1];
        newOffsetId = lastDialog.top_message; // The ID of the top message in the last dialog
        newOffsetPeer = lastDialog.peer;    // The peer of the last dialog

        // Find the date of the last message to use as the next offset_date
        // Messages are usually ordered by date descending, so the last message in the list
        // that matches the last dialog's top_message and peer should give us the date.
        const messages = dialogsResult.messages || [];
        const lastMessageDetails = messages.find((msg: any) => {
            const msgPeerId = msg.peer_id;
            if (!msgPeerId) return false;
            
            // Compare peer objects carefully. This can be tricky.
            // A simple string comparison of IDs might be sufficient if peer types are consistent.
            const peerUserId = msgPeerId.user_id?.toString();
            const peerChatId = msgPeerId.chat_id?.toString();
            const peerChannelId = msgPeerId.channel_id?.toString();

            const offsetPeerUserId = newOffsetPeer.user_id?.toString();
            const offsetPeerChatId = newOffsetPeer.chat_id?.toString();
            const offsetPeerChannelId = newOffsetPeer.channel_id?.toString();

            // Check if message ID matches and peer ID matches
            return msg.id === newOffsetId && (
                (peerUserId && offsetPeerUserId && peerUserId === offsetPeerUserId) ||
                (peerChatId && offsetPeerChatId && peerChatId === offsetPeerChatId) ||
                (peerChannelId && offsetPeerChannelId && peerChannelId === offsetPeerChannelId)
            );
        });

        if (lastMessageDetails && typeof lastMessageDetails.date === 'number') {
          newOffsetDate = lastMessageDetails.date;
        } else {
          console.warn("Could not determine nextOffsetDate accurately. Last message details:", lastMessageDetails, "Last dialog:", lastDialog);
          // If newOffsetDate remains 0 or unchanged and hasMore is true, 
          // it might lead to re-fetching the same set of dialogs.
          // Telegram's pagination relies on offset_date, offset_id, and offset_peer together.
          // If date is missing, using just ID and peer might still work but can be less reliable.
        }
      }
    } else {
        hasMore = false; // No dialogs returned, so no more data
    }

    return {
      folders: transformedFolders,
      nextOffsetDate: newOffsetDate,
      nextOffsetId: newOffsetId,
      nextOffsetPeer: newOffsetPeer,
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
    // IDs can be numbers or BigInts from MTProto, ensure they are strings for comparison
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
    // Fallback if properties exist but an error occurred during processing
    if(peer.user_id) return `User ${peer.user_id.toString()}`;
    if(peer.chat_id) return `Chat ${peer.chat_id.toString()}`;
    if(peer.channel_id) return `Channel ${peer.channel_id.toString()}`;
  }
  console.warn("Could not determine peer title for:", peer);
  return 'Invalid Peer Data'; // Or a more descriptive default
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

    // Determine a unique ID for the folder based on peer type and ID
    let chatId: string | undefined;
    if (peer.user_id) chatId = peer.user_id.toString();
    else if (peer.chat_id) chatId = peer.chat_id.toString();
    else if (peer.channel_id) chatId = peer.channel_id.toString();

    if (!chatId) {
        console.warn("Could not determine chatId for dialog's peer:", dialog.peer);
        return null; // Skip if no valid ID can be determined
    }
    
    // Using dialog.top_message to ensure a more unique ID if names collide, or Date.now() as a fallback
    const uniqueSuffix = dialog.top_message || Date.now();
    
    return {
      id: `chat-${chatId}-${uniqueSuffix}`, 
      name: chatTitle,
      isChatFolder: true, // Mark this as a top-level chat folder
      files: [], // Placeholder for actual files from the chat
      folders: [ // Placeholder subfolders for media types
        { id: `chat-${chatId}-images-${uniqueSuffix}`, name: "Images", files: [], folders: [] },
        { id: `chat-${chatId}-videos-${uniqueSuffix}`, name: "Videos", files: [], folders: [] },
        { id: `chat-${chatId}-audio-${uniqueSuffix}`, name: "Audio Messages & Music", files: [], folders: [] },
        { id: `chat-${chatId}-documents-${uniqueSuffix}`, name: "Documents & Files", files: [], folders: [] },
        { id: `chat-${chatId}-other-${uniqueSuffix}`, name: "Other Media", files: [], folders: [] },
      ],
    };
  }).filter(folder => folder !== null) as CloudFolder[]; // Filter out any nulls from skipped dialogs
}


export async function signOut(): Promise<void> {
  try {
    // Attempt to log out from Telegram server
    await api.call('auth.logOut');
    console.log('Signed out successfully from Telegram server.');
  } catch (error: any) {
    console.error('Error signing out from Telegram server:', error.message, error.originalErrorObject || error);
    // Proceed with local cleanup even if server logout fails
  } finally {
    // Clear local session data
    userSession = {}; // Clear in-memory session
    if (typeof window !== 'undefined') {
      localStorage.removeItem(USER_SESSION_KEY); // Clear localStorage session
      console.log('Local userSession object and localStorage session cleared.');
      // Optionally, if mtproto-core provides a method to clear its internal storage:
      // await api.mtproto.clearStorage?.(); // Check if this method exists and is appropriate
    }
  }
}

export async function isUserConnected(): Promise<boolean> {
  // First, check if user object exists in our in-memory session (potentially loaded from localStorage)
  if (userSession.user) {
    try {
        // Verify the session with Telegram servers by making a lightweight API call
        await api.call('users.getUsers', {id: [{_: 'inputUserSelf'}]});
        console.log("User session is active (checked with users.getUsers).");
        return true;
    } catch (error: any) {
        // Handle specific auth errors that indicate an invalid session
        const errorMessage = error.message || error.originalErrorObject?.error_message;
        const authErrorMessages = ['AUTH_KEY_UNREGISTERED', 'USER_DEACTIVATED', 'SESSION_REVOKED', 'SESSION_EXPIRED', 'API_ID_INVALID', 'API_KEY_INVALID', 'AUTH_RESTART'];
        
        if (errorMessage && authErrorMessages.some(authMsg => errorMessage.includes(authMsg))) {
            console.warn("User session no longer valid or API keys incorrect:", errorMessage, "Logging out locally.");
            await signOut(); // This will clear userSession and localStorage
            return false;
        }
        // For other errors, it's ambiguous. We might be connected but an API call failed.
        // Depending on desired behavior, could return true or false.
        // For now, let's assume if user object exists and it's not a clear auth error, they might still be "connected" UI-wise.
        // However, if any API call fails, it should be handled by the caller.
        console.warn("API call failed during connected check, but might not be an auth error. User object exists locally.", errorMessage, error.originalErrorObject || error);
        return true; // Or false if stricter validation is needed.
    }
  }
  // No user object in session
  return false;
}

console.log('Telegram service (telegramService.ts) loaded with API class wrapper and update listeners.');
if (API_ID === undefined || !API_HASH) {
  console.error("CRITICAL: Telegram API_ID or API_HASH is not configured correctly in .env.local. Service will not function. Ensure NEXT_PUBLIC_TELEGRAM_API_ID and NEXT_PUBLIC_TELEGRAM_API_HASH are set and the dev server was restarted.");
}

// For debugging: expose api and userSession to window if in development
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  (window as any).telegramServiceApi = api;
  (window as any).telegramUserSession = userSession;
}
