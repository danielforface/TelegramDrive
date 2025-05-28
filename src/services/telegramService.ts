
'use client';

import MTProto from '@mtproto/core/envs/browser';
import { sha256 } from '@cryptography/sha256';
import bigInt from 'big-integer';
import type { CloudFolder, CloudFile } from '@/types';

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
    'NEXT_PUBLIC_TELEGRAM_API_ID is not set in environment variables. Real connection will fail.'
  );
}

if (!API_HASH) {
  console.warn(
    'NEXT_PUBLIC_TELEGRAM_API_HASH is not set in environment variables. Real connection will fail.'
  );
}


let mtprotoClient: MTProto | null = null;

// --- SRP Helper Types ---
interface SRPParameters {
  g: number;
  p: Uint8Array;
  salt1: Uint8Array;
  salt2: Uint8Array;
  srp_B: Uint8Array; // Server's public ephemeral
  // The following are part of current_algo in account.Password, but might not be needed if srp_id is enough.
  // They are part of the "new_algo" structure within current_algo.
  // For current_algo (version 6a/7), these are directly in current_algo.
}

interface ComputedSRPValues {
  A: Uint8Array; // Client's public ephemeral (g^a mod p)
  M1: Uint8Array; // Client's proof of password
}

// --- User Session ---
let userSession: {
  phone?: string;
  phone_code_hash?: string;
  user?: any;
  srp_id?: string; // Stored as string because it's a 'long' from API
  srp_params?: SRPParameters;
  // We might not need to store 'a' (client private ephemeral) globally if computeSrpValues handles it.
} = {};


function getClient(): MTProto {
  if (!mtprotoClient) {
    if (API_ID === undefined || !API_HASH) {
      console.error("CRITICAL: Telegram API_ID or API_HASH is missing or invalid. Check NEXT_PUBLIC_TELEGRAM_API_ID and NEXT_PUBLIC_TELEGRAM_API_HASH in your .env.local file.");
      throw new Error('Telegram API credentials are not properly configured. API_ID must be a valid number and API_HASH must be a non-empty string. Please ensure NEXT_PUBLIC_TELEGRAM_API_ID and NEXT_PUBLIC_TELEGRAM_API_HASH are correctly set in your .env.local file and that you have restarted your development server after creating/modifying the .env.local file.');
    }
    mtprotoClient = new MTProto({
      api_id: API_ID,
      api_hash: API_HASH,
      // Browser env uses localStorage by default, no storageOptions needed
    });
    console.log('MTProto client initialized for browser environment.');
  }
  return mtprotoClient;
}

// --- SRP Utility Functions ---

// Helper to convert Uint8Array to BigInteger
function bytesToBigInt(bytes: Uint8Array): bigInt.BigInteger {
  let hex = '';
  bytes.forEach(byte => {
    hex += byte.toString(16).padStart(2, '0');
  });
  return bigInt(hex, 16);
}

// Helper to convert BigInteger to Uint8Array
// Ensures the byte array has a minimum length (e.g., 256 bytes for p, A, B, S)
function bigIntToBytes(num: bigInt.BigInteger, expectedLength: number = 0): Uint8Array {
  let hex = num.toString(16);
  if (hex.length % 2) {
    hex = '0' + hex;
  }

  const byteLength = Math.max(expectedLength, hex.length / 2);
  const u8 = new Uint8Array(byteLength); // Ensure it's at least expectedLength

  const hexByteLength = hex.length / 2;
  let startIdx = byteLength - hexByteLength;
  if (startIdx < 0) startIdx = 0; // Should not happen if byteLength is correct

  for (let i = 0, j = 0; i < hexByteLength; i++, j++) {
     u8[startIdx + j] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return u8;
}


// Helper to concatenate Uint8Arrays
function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  let totalLength = 0;
  for (const arr of arrays) {
    totalLength += arr.length;
  }
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

// Helper to generate random bytes
function generateRandomBytes(length: number): Uint8Array {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return array;
}

// Computes SRP values A and M1 based on password and server parameters
// This is a complex cryptographic function and needs to be precise.
async function computeSrpValues(password: string, srpParams: SRPParameters, srpIdString: string): Promise<ComputedSRPValues> {
  const { g, p: p_bytes, salt1, salt2, srp_B } = srpParams;

  if (!p_bytes || p_bytes.length === 0) throw new Error("SRP error: p is missing or empty.");
  if (!srp_B || srp_B.length === 0) throw new Error("SRP error: srp_B is missing or empty.");

  const p_bi = bytesToBigInt(p_bytes);
  const B_bi = bytesToBigInt(srp_B);

  // Validation: 0 < B < p
  if (B_bi.isZero() || B_bi.geq(p_bi)) {
    console.error("SRP_B_INVALID: B is 0 or B >= p", { B_bi: B_bi.toString(), p_bi: p_bi.toString() });
    throw new Error('SRP_B_INVALID');
  }

  const g_bi = bigInt(g);

  // Algorithm PSHA(password, salt1, salt2) from TL Schema for inputClientPassword (for current_algo)
  // P = H(salt2 | H(salt1 | password | salt1) | salt2)
  const password_utf8 = new TextEncoder().encode(password);
  const inner_hash_buf = await crypto.subtle.digest('SHA-256', concatBytes(salt1, password_utf8, salt1));
  const P_bytes_buf = await crypto.subtle.digest('SHA-256', concatBytes(salt2, new Uint8Array(inner_hash_buf), salt2));
  const P_bytes = new Uint8Array(P_bytes_buf); // This is `x_H` in some notations

  const x_bi = bytesToBigInt(P_bytes); // This is `x`

  const a_bytes = generateRandomBytes(256); // Client's private ephemeral value `a`
  const a_bi = bytesToBigInt(a_bytes);

  const A_bi = g_bi.modPow(a_bi, p_bi); // A = g^a mod p
  const A_bytes = bigIntToBytes(A_bi, 256); // Ensure A is 256 bytes

  // u = H(A | B)
  // Ensure A_bytes and srp_B are padded to 256 bytes if necessary for hashing, or use their actual lengths.
  // Telegram typically expects fixed-size byte arrays for these hashes in SRP.
  // Let's assume A_bytes and srp_B are already correctly sized (e.g. 256 bytes from API/generation).
  const u_hash_buf = await crypto.subtle.digest('SHA-256', concatBytes(A_bytes, srp_B));
  const u_bi = bytesToBigInt(new Uint8Array(u_hash_buf));

  // g_x = g^x mod p
  const g_x_bi = g_bi.modPow(x_bi, p_bi);

  // k = H(p | g_bytes_for_hash) where g_bytes_for_hash is g represented as bytes.
  // Telegram's specific way of deriving k can vary, but H(N, g) is common.
  // The method for 'inputCheckPasswordSRP' with 'passwordSrp' algo:
  // The server provides algo.g, algo.p.
  // k = H(algo.p | H(algo.g)) - this form is not standard SRP; often k=3 or H(N,g)
  // Let's use k = H(p_bytes | g_bytes_for_hash_padded_to_p_length) or simpler H(p | g) if g is small
  // For Telegram's current_algo (SRP v7, based on passwordKdfAlgoSHA256SHA256PBKDF2HMACSHA512iter100000SHA256ModPow)
  // k is derived based on the KDF, but for older algos it's simpler.
  // Let's use a common interpretation: k = H(p | g_as_bytes)
  // We need to be careful how g (an int) is converted to bytes for hashing.
  // Let's try k = H(p_bytes | g_bytes_for_k_hash)
  // g_bytes_for_k_hash: convert g to its byte representation.
  // It must be a fixed-width representation if that's what the spec implies.
  // Let's assume g_bytes is just the minimal byte representation of g.
  const g_bytes_for_k_hash = bigIntToBytes(g_bi); // minimal representation
  const k_hash_buf = await crypto.subtle.digest('SHA-256', concatBytes(p_bytes, g_bytes_for_k_hash));
  const k_bi = bytesToBigInt(new Uint8Array(k_hash_buf));

  // S = (B - k * g^x) ^ (a + u * x) mod p
  let tmp_bi = B_bi.subtract(k_bi.multiply(g_x_bi)).mod(p_bi);
  if (tmp_bi.isNegative()) tmp_bi = tmp_bi.add(p_bi); // Ensure positive before pow

  const exp_bi = a_bi.add(u_bi.multiply(x_bi));
  const S_bi = tmp_bi.modPow(exp_bi, p_bi);
  const S_bytes = bigIntToBytes(S_bi, 256); // Ensure S is 256 bytes

  // M1 = H(H(p) XOR H(g) | H(I) | s1 | s2 | A | B | K) where K is S
  // For Telegram's `inputCheckPasswordSRP`, it's M1 = H(A | B | S_bytes_hash) or H(A | B | S)
  // From example, `M1` is passed directly. It's usually `H(A_bytes | B_bytes | S_bytes)`
  // Let's use: M1 = H(A_bytes | B_bytes | S_bytes)
  const M1_hash_buf = await crypto.subtle.digest('SHA-256', concatBytes(A_bytes, srp_B, S_bytes));
  const M1_bytes = new Uint8Array(M1_hash_buf);

  return { A: A_bytes, M1: M1_bytes };
}


// --- API Service Functions ---

export async function sendCode(phoneNumber: string): Promise<string> {
  const client = getClient();
  userSession = { phone: phoneNumber }; // Reset session for new attempt
  console.log(`Sending code to ${phoneNumber} with API_ID: ${API_ID}`);
  try {
    const result = await client.call('auth.sendCode', {
      phone_number: phoneNumber,
      api_id: API_ID, // Explicitly pass API_ID and API_HASH if client is not pre-configured or to be sure
      api_hash: API_HASH,
      settings: {
        _: 'codeSettings',
      },
    });
    if (!result.phone_code_hash) throw new Error("phone_code_hash not received from Telegram.");
    userSession.phone_code_hash = result.phone_code_hash;
    console.log('Verification code sent, phone_code_hash:', result.phone_code_hash);
    return result.phone_code_hash;
  } catch (error: any) {
    console.error('Error sending code:', error);
    const message = error.error_message || (error.message || 'Failed to send code.');
    throw new Error(message);
  }
}

export async function signIn(code: string): Promise<{ user?: any, error?: string, srp_id?: string }> {
  const client = getClient();
  if (!userSession.phone || !userSession.phone_code_hash) {
    throw new Error('Phone number and phone_code_hash not set. Call sendCode first.');
  }

  try {
    const result = await client.call('auth.signIn', {
      phone_number: userSession.phone,
      phone_code_hash: userSession.phone_code_hash,
      phone_code: code,
    });

    if (result._ === 'auth.authorizationSignUpRequired') {
      // For this app, we can treat sign-up as an error or unsupported path.
      throw new Error('Sign up required. This app currently only supports sign in for existing accounts.');
    }

    console.log('Signed in successfully (or 2FA needed):', result);
    if (result.user) {
        userSession.user = result.user;
    }
    return { user: result.user };

  } catch (error: any) {
    console.error('Error in signIn:', error);
    if (error.error_message === 'SESSION_PASSWORD_NEEDED') {
      console.log('2FA password needed. Fetching password details...');
      try {
        const passwordData = await client.call('account.getPassword');
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


        userSession.srp_id = passwordData.srp_id.toString(); // srp_id is a BigInt/long, convert to string
        userSession.srp_params = {
            g: passwordData.current_algo.g,
            p: passwordData.current_algo.p,
            salt1: passwordData.current_algo.salt1,
            salt2: passwordData.current_algo.salt2,
            srp_B: passwordData.srp_B
        };

        console.log('SRP parameters stored for 2FA:', {
            srp_id: userSession.srp_id,
            g: userSession.srp_params.g,
            p_length: userSession.srp_params.p.length,
            salt1_length: userSession.srp_params.salt1.length,
            salt2_length: userSession.srp_params.salt2.length,
            srp_B_length: userSession.srp_params.srp_B.length,
        });

        // Throw a custom error object or structure that page.tsx can check
        const twoFactorError: any = new Error('2FA_REQUIRED'); // Standardize error message
        twoFactorError.srp_id = userSession.srp_id; // Pass srp_id for context if needed by UI
        throw twoFactorError;

      } catch (getPasswordError: any) {
        console.error('Error fetching password details for 2FA:', getPasswordError);
        // Rethrow or handle: if getPasswordError is already the '2FA_REQUIRED' error, just rethrow
        if (getPasswordError.message === '2FA_REQUIRED' && getPasswordError.srp_id) throw getPasswordError;

        const message = getPasswordError.error_message || (getPasswordError.message || 'Failed to fetch 2FA details.');
        throw new Error(message);
      }
    }
    // For other errors from auth.signIn
    const message = error.error_message || (error.message || 'Failed to sign in.');
    throw new Error(message);
  }
}


export async function checkPassword(password: string): Promise<any> {
  const client = getClient();
  if (!userSession.srp_id || !userSession.srp_params) {
    console.error("SRP parameters not available. 2FA flow not properly initiated or srp_params missing.");
    throw new Error('SRP parameters not available. Please try the login process again.');
  }

  try {
    console.log("Computing SRP A and M1 values for checkPassword...");
    const { A, M1 } = await computeSrpValues(password, userSession.srp_params, userSession.srp_id);
    console.log("SRP A and M1 computed. Calling auth.checkPassword...");
    console.log("  srp_id:", userSession.srp_id);
    // console.log("  A (hex):", Buffer.from(A).toString('hex')); // For debugging if needed
    // console.log("  M1 (hex):", Buffer.from(M1).toString('hex'));

    const checkResult = await client.call('auth.checkPassword', {
        password: {
            _: 'inputCheckPasswordSRP',
            srp_id: userSession.srp_id, // Ensure this is the string representation of the long
            A: A,
            M1: M1,
        }
    });

    console.log('2FA password check result:', checkResult);
    if (checkResult.user) {
        userSession.user = checkResult.user;
    }
    // Successfully checked password, clear SRP params?
    // userSession.srp_id = undefined;
    // userSession.srp_params = undefined;
    return checkResult.user;

  } catch (error: any) {
    console.error('Error checking password:', error);
    const message = error.error_message || (error.message || 'Failed to check 2FA password.');
    // Specific error handling for common SRP issues
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
  const client = getClient();
  if (!userSession.user) {
    console.warn('User not signed in. Cannot fetch chats.');
    // throw new Error('User not authenticated. Please sign in first.'); // Or return empty
    return [];
  }

  console.log('Fetching user dialogs (chats)...');
  try {
    // messages.getDialogs is common for fetching chat list
    const dialogsResult = await client.call('messages.getDialogs', {
      offset_date: 0,
      offset_id: 0,
      offset_peer: { _: 'inputPeerEmpty' },
      limit: 100, // Fetch a reasonable number of dialogs
      hash: bigInt.zero, // Or 0 if number, use bigInt for safety with mtproto-core
      // exclude_pinned: false, // Optional
      // folder_id: 0, // Optional: for specific folders
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
    const idStr = peer.user_id?.toString() || peer.chat_id?.toString() || peer.channel_id?.toString();
    if (!idStr) return 'Invalid Peer: No ID';

    if (peer._ === 'peerUser') {
      const user = users.find(u => u.id && u.id.toString() === idStr);
      if (user) {
        const name = `${user.first_name || ''} ${user.last_name || ''}`.trim();
        return name || `User ${idStr}`;
      }
      return `User ${idStr}`;
    } else if (peer._ === 'peerChat') {
      const chat = chats.find(c => c.id && c.id.toString() === idStr);
      return chat ? chat.title : `Chat ${idStr}`;
    } else if (peer._ === 'peerChannel') {
      const channel = chats.find(c => c.id && c.id.toString() === idStr);
      return channel ? channel.title : `Channel ${idStr}`;
    }
  } catch (e) {
    console.error("Error in getPeerTitle processing peer:", peer, e);
    // Try to return something based on peer data if possible
    if(peer.user_id) return `User ${peer.user_id.toString()}`;
    if(peer.chat_id) return `Chat ${peer.chat_id.toString()}`;
    if(peer.channel_id) return `Channel ${peer.channel_id.toString()}`;
  }
  return 'Invalid Peer Data Structure';
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
        return null; // Skip this dialog if no ID can be determined
    }

    // For now, media folders are empty. Actual media fetching needs to be implemented.
    return {
      id: `chat-${chatId}`, // Unique ID for the folder
      name: chatTitle,
      isChatFolder: true,
      files: [], // Root files in this chat (e.g., non-media or recent items not yet sorted)
      folders: [
        { id: `chat-${chatId}-images`, name: "Images", files: [], folders: [] },
        { id: `chat-${chatId}-videos`, name: "Videos", files: [], folders: [] },
        { id: `chat-${chatId}-audio`, name: "Audio Messages & Music", files: [], folders: [] },
        { id: `chat-${chatId}-documents`, name: "Documents & Files", files: [], folders: [] },
        { id: `chat-${chatId}-other`, name: "Other Media", files: [], folders: [] },
      ],
    };
  }).filter(folder => folder !== null) as CloudFolder[]; // Filter out any nulls from problematic dialogs
}


export async function signOut(): Promise<void> {
  const client = getClient();
  try {
    // auth.logOut is the method to end the session on the server
    const result = await client.call('auth.logOut');
    console.log('Signed out successfully from Telegram server:', result);
  } catch (error: any) {
    console.error('Error signing out from Telegram server:', error);
    // Not critical to re-throw usually, client-side session will be cleared anyway
    // const message = error.error_message || (error.message || 'Failed to sign out from server.');
    // throw new Error(message);
  } finally {
    // Clear local session state regardless of server logout success
    userSession = {};
    // mtprotoClient = null; // This would force re-init on next getClient(), good for full reset
    // MTProto browser env uses localStorage, which should persist unless cleared.
    // For a true "logout" experience, you might need to clear MTProto's localStorage keys
    // or the library might handle this upon auth.logOut.
    // Check mtproto-core docs for how it handles session storage on logout.
    // For now, just clearing our userSession object.
    if (typeof window !== 'undefined' && window.localStorage) {
        // mtproto-core might store session data in localStorage.
        // Example: clear keys prefixed with 'mtproto:' - this is speculative.
        // Object.keys(window.localStorage).forEach(key => {
        //   if (key.startsWith('mtproto:')) { // Or whatever prefix the library uses
        //     window.localStorage.removeItem(key);
        //   }
        // });
        console.log('Local userSession object cleared. MTProto localStorage may need manual clearing if persistence is an issue after logout.');
    }
  }
}

// Check if the user is considered connected based on our session object
// and optionally by making a lightweight API call.
export async function isUserConnected(): Promise<boolean> {
  if (userSession.user) {
    const client = getClient();
    try {
        // A lightweight call to check if the session is still valid
        await client.call('users.getUsers', {id: [{_: 'inputUserSelf'}]});
        console.log("User session is active (checked with users.getUsers).");
        return true;
    } catch (error: any) {
        // Common errors indicating session invalidity
        if (['AUTH_KEY_UNREGISTERED', 'USER_DEACTIVATED', 'SESSION_REVOKED', 'SESSION_EXPIRED', 'API_ID_INVALID', 'API_KEY_INVALID'].includes(error.error_message)) {
            console.warn("User session no longer valid or API keys incorrect:", error.error_message, "Logging out locally.");
            await signOut(); // Attempt to clear local state thoroughly
            return false;
        }
        console.warn("API call failed during connected check, but might not be an auth error (e.g., network). Assuming connected if user object exists.", error.error_message);
        // For other errors (like network issues), if user object exists,
        // we might optimistically assume they are still connected or the issue is temporary.
        return true;
    }
  }
  return false;
}

console.log('Telegram service (telegramService.ts) loaded in browser environment.');
// Basic check for API credentials on load of this module
if (API_ID === undefined || !API_HASH) {
  console.error("CRITICAL: Telegram API_ID or API_HASH is not configured correctly in .env.local. Service will not function. Ensure NEXT_PUBLIC_TELEGRAM_API_ID and NEXT_PUBLIC_TELEGRAM_API_HASH are set and the dev server was restarted.");
}
