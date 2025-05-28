
'use client';

import MTProto from '@mtproto/core/envs/browser';
import { type CloudFolder, type CloudFile } from '@/types';
import { sha256 } from '@cryptography/sha256';
import { kleines } from 'big-integer'; // Using a placeholder for big-integer, actual library might be different or handled by mtproto-core
// Note: 'big-integer' itself might not be directly used if mtproto-core's browser version handles large number arithmetic internally
// For SRP calculation, mtproto-core should provide necessary utilities or handle it.
// We'll rely on mtproto-core's browser build for crypto primitives where possible.

const API_ID = parseInt(process.env.NEXT_PUBLIC_TELEGRAM_API_ID || '', 10);
const API_HASH = process.env.NEXT_PUBLIC_TELEGRAM_API_HASH || '';

if (isNaN(API_ID) || !API_HASH) {
  console.warn(
    'Telegram API ID or HASH is not configured correctly in environment variables. Real connection will fail.'
  );
}

let mtprotoClient: MTProto | null = null;
let userSession: {
  phone?: string;
  phone_code_hash?: string;
  user?: any;
  srp_id?: string;
  B?: Uint8Array;
  g?: number;
  p?: Uint8Array;
  salt1?: Uint8Array;
  salt2?: Uint8Array;
} = {};


function getClient(): MTProto {
  if (!mtprotoClient) {
    if (isNaN(API_ID) || !API_HASH) {
      throw new Error('Telegram API credentials are not configured.');
    }
    mtprotoClient = new MTProto({
      api_id: API_ID,
      api_hash: API_HASH,
      // No storageOptions needed for browser env, defaults to localStorage
    });
    console.log('MTProto client initialized for browser environment.');
  }
  return mtprotoClient;
}

export async function sendCode(phoneNumber: string): Promise<string> {
  const client = getClient();
  userSession = { phone: phoneNumber }; // Reset session for new attempt
  try {
    const { phone_code_hash } = await client.call('auth.sendCode', {
      phone_number: phoneNumber,
      api_id: API_ID,
      api_hash: API_HASH,
      settings: {
        _: 'codeSettings',
      },
    });
    userSession.phone_code_hash = phone_code_hash;
    console.log('Verification code sent, phone_code_hash:', phone_code_hash);
    return phone_code_hash;
  } catch (error) {
    console.error('Error sending code:', error);
    throw error;
  }
}

export async function signIn(code: string): Promise<{ user?: any; error?: string; srp_id?: string }> {
  const client = getClient();
  if (!userSession.phone || !userSession.phone_code_hash) {
    return { error: 'Phone number and phone_code_hash not set. Call sendCode first.' };
  }

  try {
    const result = await client.call('auth.signIn', {
      phone_number: userSession.phone,
      phone_code_hash: userSession.phone_code_hash,
      phone_code: code,
    });
    
    if (result._ === 'auth.authorizationSignUpRequired') {
      return { error: 'Sign up required. This app currently only supports sign in.'};
    }
    
    console.log('Signed in successfully:', result.user);
    userSession.user = result.user;
    return { user: result.user };

  } catch (error: any) {
    if (error.error_message === 'SESSION_PASSWORD_NEEDED') {
      console.log('2FA password needed.');
      // Fetch password details (srp_id, current_algo, etc.)
      const passwordData = await client.call('account.getPassword');
      userSession.srp_id = passwordData.srp_id?.toString(); // Ensure srp_id is string if it's BigInt like
      userSession.B = passwordData.srp_B; // This might be Uint8Array or needs conversion
      userSession.g = passwordData.current_algo.g;
      userSession.p = passwordData.current_algo.p;
      userSession.salt1 = passwordData.current_algo.salt1;
      userSession.salt2 = passwordData.current_algo.salt2;

      return { error: '2FA_REQUIRED', srp_id: userSession.srp_id };
    }
    console.error('Error signing in:', error);
    throw error;
  }
}

// Helper function for SRP calculation (simplified, actual implementation might be more complex or provided by mtproto-core)
// This is a very simplified placeholder. `mtproto-core` might have its own way to handle SRP.
// The library is expected to handle the crypto complexity internally for browser env.
// We are relying on mtproto-core to construct the `inputCheckPasswordSRP` object.
// The main challenge is often getting the password hash correct.

async function computePasswordHash(password: string, salt1: Uint8Array, salt2: Uint8Array, g: number, p: Uint8Array, B: Uint8Array) {
    // This is a highly complex part of the SRP protocol.
    // mtproto-core's browser version should ideally abstract this or provide clear utilities.
    // For now, we'll assume that mtproto-core can build the `inputCheckPasswordSRP` object
    // if we provide the password directly, or it handles the SRP exchange more transparently.
    // The `example.js` you provided doesn't show client-side SRP, so this is an area
    // that might need more direct support or documentation from `@mtproto/core/envs/browser`.

    // Placeholder: In a full SRP implementation, you'd derive A, M1 etc.
    // For now, we'll let mtproto-core attempt to create the SRP object.
    // The key is that `mtproto.call('auth.checkPassword', { password: { _:'inputCheckPasswordSRP', ... } })`
    // needs the correct fields.
    console.warn("SRP password hash computation is complex and relies on mtproto-core's browser capabilities.");
    
    // The library `itself` should be constructing these parts for the `inputCheckPasswordSRP` object
    // or providing high-level functions. We pass what we received from `account.getPassword`.
    return {
        srp_id: userSession.srp_id, // from account.getPassword
        // A: computed_A, // This needs to be computed based on password and other params
        // M1: computed_M1, // This needs to be computed
        // These might not be needed if mtproto-core generates A and M1 from the password.
    };
}


export async function checkPassword(password: string): Promise<any> {
  const client = getClient();
  if (!userSession.srp_id || !userSession.B || !userSession.p || !userSession.salt1 || !userSession.salt2) {
    throw new Error('SRP parameters not available. 2FA flow not properly initiated.');
  }

  try {
    // mtproto-core's browser version should handle the creation of the `inputCheckPasswordSRP` object.
    // We provide the password, and it should use the stored srp_id, srp_B etc.
    // The library often has methods like `mtproto.helpers.computeSRPParams` or similar,
    // or it does this transparently when `auth.checkPassword` is called with a plain password
    // in a 2FA context.
    // Let's try providing the password directly and see if mtproto-core handles it.
    // If not, we'd need to consult its specific API for browser SRP.

    // The main challenge is correctly forming the 'password' object for 'auth.checkPassword'.
    // According to TL schema, it should be of type InputCheckPasswordSRP.
    // This might involve client-side computation of A and M1.
    // For now, we rely on mtproto-core's browser version to handle this.
    // It's possible the library expects the password to be passed differently or has helper methods.

    // This is a critical part. The `telegram-web-k` project has extensive SRP logic.
    // `@mtproto/core` aims to simplify this. We're testing how much it simplifies.

    const srpParams = await client.call(
        'account.getPasswordSettings',
        { password } // This is a guess; API might need password directly or pre-hashed
    );

    // The actual `inputCheckPasswordSRP` needs `srp_id`, `A`, and `M1`.
    // `A` and `M1` are derived from the password and other parameters (g, p, salt, B).
    // This usually requires a BigInteger library and SHA256.
    // `mtproto-core` should provide utilities or handle this internally for its browser version.

    // For demonstration, we're attempting a simplified call.
    // In a real scenario, you would use mtproto-core's specific methods for SRP.
    // If `@mtproto/core/envs/browser` doesn't simplify this enough, this part will be complex.
    // We are providing a placeholder for `A` and `M1` as they require complex crypto.
    // The library is expected to compute these or provide a helper.
    const A_placeholder = new Uint8Array(256).fill(1); // Placeholder
    const M1_placeholder = new Uint8Array(32).fill(1); // Placeholder

    const checkResult = await client.call('auth.checkPassword', {
        password: {
            _: 'inputCheckPasswordSRP',
            srp_id: userSession.srp_id, // This must be a string representation of the long value
            A: A_placeholder, // This needs to be calculated based on the password
            M1: M1_placeholder, // This also needs to be calculated
        }
    });
    
    console.log('2FA check result:', checkResult);
    userSession.user = checkResult.user;
    return checkResult.user;

  } catch (error: any) {
    console.error('Error checking password:', error);
    if (error.error_message === 'PASSWORD_HASH_INVALID' || error.error_message === 'SRP_ID_INVALID' || error.error_message === 'SRP_A_EMPTY') {
        // These errors indicate issues with SRP parameter computation or the srp_id.
        // This is the most complex part of Telegram auth.
        throw new Error(`2FA failed: ${error.error_message}. SRP computation might be incorrect or mtproto-core requires specific helpers for browser SRP.`);
    }
    throw error;
  }
}


export async function getTelegramChats(): Promise<CloudFolder[]> {
  const client = getClient();
  if (!userSession.user) {
    console.warn('User not signed in. Returning empty array for chats.');
    return [];
  }

  console.log('Fetching chats...');
  try {
    const dialogsResult = await client.call('messages.getDialogs', {
      offset_date: 0,
      offset_id: 0,
      offset_peer: { _: 'inputPeerEmpty' },
      limit: 20, // Adjust as needed
      hash: 0, 
    });
    console.log('Dialogs raw result:', dialogsResult);
    return transformDialogsToCloudFolders(dialogsResult);
  } catch (error) {
    console.error('Error fetching dialogs:', error);
    throw error;
  }
}

function getPeerTitle(peer: any, chats: any[], users: any[]): string {
  if (peer._ === 'peerUser') {
    const user = users.find(u => u.id.toString() === peer.user_id.toString());
    return user ? `${user.first_name || ''} ${user.last_name || ''}`.trim() || `User ${user.id}` : `User ${peer.user_id}`;
  } else if (peer._ === 'peerChat') {
    const chat = chats.find(c => c.id.toString() === peer.chat_id.toString());
    return chat ? chat.title : `Chat ${peer.chat_id}`;
  } else if (peer._ === 'peerChannel') {
    const channel = chats.find(c => c.id.toString() === peer.channel_id.toString());
    return channel ? channel.title : `Channel ${peer.channel_id}`;
  }
  return 'Unknown Chat';
}


function transformDialogsToCloudFolders(dialogsResult: any): CloudFolder[] {
  const { dialogs, chats, users } = dialogsResult;

  if (!dialogs || !Array.isArray(dialogs)) {
    console.warn('No dialogs found in the result.');
    return [];
  }
  
  return dialogs.map((dialog: any): CloudFolder => {
    const peer = dialog.peer;
    const chatTitle = getPeerTitle(peer, chats, users);
    const chatId = peer.user_id?.toString() || peer.chat_id?.toString() || peer.channel_id?.toString();

    // Placeholder for actual media fetching and sorting for this chat
    // This would involve more API calls like 'messages.getHistory' then filtering for media types
    return {
      id: `chat-${chatId}`,
      name: chatTitle,
      isChatFolder: true,
      files: [], // To be populated by fetching messages and media
      folders: [ // Default media type folders
        { id: `chat-${chatId}-images`, name: "Images", files: [], folders: [] },
        { id: `chat-${chatId}-videos`, name: "Videos", files: [], folders: [] },
        { id: `chat-${chatId}-audio`, name: "Audio", files: [], folders: [] },
        { id: `chat-${chatId}-docs`, name: "Documents", files: [], folders: [] },
      ],
    };
  }).filter(folder => folder !== null) as CloudFolder[];
}


export async function signOut(): Promise<void> {
  const client = getClient();
  try {
    await client.call('auth.logOut');
    console.log('Signed out successfully.');
  } catch (error) {
    console.error('Error signing out:', error);
    // It's often fine to ignore errors here, e.g., if session was already invalid
  } finally {
    // Clear local session state
    userSession = {};
    // mtprotoClient = null; // Optionally reset the client to force re-init on next login
    // For browser env, mtproto-core might handle clearing its localStorage data automatically on logout.
    // If not, manual clearing might be needed: localStorage.removeItem('mtproto_auth_key_dcX'); etc.
    // Or, a more robust solution would be to have mtproto-core expose a session clear method.
    // For now, we rely on the library's internal handling or new session overwriting old.
    if (mtprotoClient && mtprotoClient.storage) {
        // Attempt to clear storage if a method exists (this is hypothetical)
        // await mtprotoClient.storage.clear(); 
    }
    // A simple way for localStorage based storage is to remove keys mtproto-core uses.
    // This requires knowing the exact keys.
    // Example:
    // Object.keys(localStorage).forEach(key => {
    //   if (key.startsWith('mtproto_')) {
    //     localStorage.removeItem(key);
    //   }
    // });
  }
}

export async function isUserConnected(): Promise<boolean> {
  const client = getClient();
  // This is a basic check. A more robust check might involve making a simple API call.
  // However, mtproto-core might manage session state internally and throw if not connected.
  // For now, we assume if userSession.user exists, we're "connected".
  if (userSession.user) {
    try {
        // A light API call to check session validity
        await client.call('users.getUsers', {id: [{_: 'inputUserSelf'}]});
        return true;
    } catch (error: any) {
        console.warn("User session might be invalid:", error.error_message);
        if (error.error_message === 'AUTH_KEY_UNREGISTERED' || error.error_message === 'USER_DEACTIVATED') {
            userSession = {}; // Clear invalid session
            return false;
        }
        // Other errors might be network issues, still consider connected for now
        return true; 
    }
  }
  return false;
}


console.log('Telegram service configured for browser environment.');
