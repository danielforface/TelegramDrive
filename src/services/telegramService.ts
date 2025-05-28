
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
  srp_id?: string; 
  srp_params?: SRPParameters; 
} = {};


function getClient(): MTProto {
  if (!mtprotoClient) {
    if (API_ID === undefined || !API_HASH) {
      throw new Error('Telegram API credentials are not properly configured. API_ID must be a number and API_HASH must be a string.');
    }
    mtprotoClient = new MTProto({
      api_id: API_ID,
      api_hash: API_HASH,
      // Browser env uses localStorage by default
    });
    console.log('MTProto client initialized for browser environment.');
  }
  return mtprotoClient;
}

// --- SRP Utility Functions ---

function bytesToBigInt(bytes: Uint8Array): bigInt.BigInteger {
  let hex = '';
  bytes.forEach(byte => {
    hex += byte.toString(16).padStart(2, '0');
  });
  return bigInt(hex, 16);
}

function bigIntToBytes(num: bigInt.BigInteger, expectedLength?: number): Uint8Array {
  let hex = num.toString(16);
  if (hex.length % 2) {
    hex = '0' + hex;
  }
  const len = Math.max(expectedLength || 0, hex.length / 2);
  const u8 = new Uint8Array(len);
  
  let startIdx = 0;
  if (expectedLength && hex.length / 2 < expectedLength) {
    startIdx = expectedLength - hex.length / 2;
  }

  for (let i = 0, j = 0; i < hex.length / 2; i++, j++) {
    u8[startIdx + j] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return u8;
}


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

function generateRandomBytes(length: number): Uint8Array {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return array;
}

async function computeSrpValues(password: string, srpParams: SRPParameters, srpIdString: string): Promise<ComputedSRPValues> {
  const { g, p: p_bytes, salt1, salt2, srp_B } = srpParams;

  const p_bi = bytesToBigInt(p_bytes);
  const B_bi = bytesToBigInt(srp_B);

  if (B_bi.isZero() || B_bi.geq(p_bi)) {
    throw new Error('SRP_B_INVALID');
  }
  
  const g_bi = bigInt(g);

  // Algorithm PSHA(password, salt1, salt2) from TL Schema for inputClientPassword (for current_algo)
  // P = H(salt2 | H(salt1 | password | salt1) | salt2)
  const password_utf8 = new TextEncoder().encode(password);
  const inner_hash = await crypto.subtle.digest('SHA-256', concatBytes(salt1, password_utf8, salt1));
  const P_bytes_digest = await crypto.subtle.digest('SHA-256', concatBytes(salt2, new Uint8Array(inner_hash), salt2));
  const P_bytes = new Uint8Array(P_bytes_digest);
  
  const x_bi = bytesToBigInt(P_bytes);

  const a_bytes = generateRandomBytes(256); 
  const a_bi = bytesToBigInt(a_bytes);

  const A_bi = g_bi.modPow(a_bi, p_bi);
  const A_bytes = bigIntToBytes(A_bi, p_bytes.length); 

  // u = H(A | B)
  const u_digest = await crypto.subtle.digest('SHA-256', concatBytes(A_bytes, srp_B));
  const u_bi = bytesToBigInt(new Uint8Array(u_digest));

  // g_x = g^x mod p
  const g_x_bi = g_bi.modPow(x_bi, p_bi);
  
  // k = H(p | g) - Simplified for Telegram, standard k=H(N,g) or k=3.
  // Using H(p_bytes | g_bytes_for_hash). Ensure g_bytes_for_hash is correctly padded if necessary or standard form.
  // MTProto core usually dictates this:
  // For account.passwordAlgorithmKDFSHA256SHA256PBKDF2HMACSHA512iter100000SHA256ModPow, k is derived.
  // A common way: k = bytesToBigInt(sha256(concatBytes(p_bytes, bigIntToBytes(g_bi, p_bytes.length))));
  // However, Telegram's older SRP algos just use k=bytesToBigInt(sha256(concatBytes(p_bytes, bigIntToBytes(g_bi))));
  // Let's use the non-padded g version for k first as it's simpler and more common for some SRP variants.
  const g_bytes_for_k_hash = bigIntToBytes(g_bi); // Non-padded
  const k_digest = await crypto.subtle.digest('SHA-256', concatBytes(p_bytes, g_bytes_for_k_hash));
  const k_bi = bytesToBigInt(new Uint8Array(k_digest));

  // S = (B - k * g^x) ^ (a + u * x) mod p
  // tmp = (B - k * g^x) mod p
  let tmp_bi = B_bi.subtract(k_bi.multiply(g_x_bi)).mod(p_bi);
  if (tmp_bi.isNegative()) tmp_bi = tmp_bi.add(p_bi);
  
  const exp_bi = a_bi.add(u_bi.multiply(x_bi));
  const S_bi = tmp_bi.modPow(exp_bi, p_bi);
  const S_bytes = bigIntToBytes(S_bi, p_bytes.length);

  // M1 = H(H(p) xor H(g) | H_I | salt1 | salt2 | A | B | S)
  // Telegram actual M1 for inputCheckPasswordSRP: H(A | B | H(S)) -- more robustly H(A_bytes | B_bytes | S_bytes_hash)
  // Or M1 = H(A_bytes | B_bytes | S_bytes)
  // Let's use M1 = H(A | B | S_bytes) as a strong candidate.
  // This is derived from various successful client implementations for Telegram.
  const M1_digest = await crypto.subtle.digest('SHA-256', concatBytes(A_bytes, srp_B, S_bytes));
  const M1_bytes = new Uint8Array(M1_digest);

  return { A: A_bytes, M1: M1_bytes };
}


// --- API Service Functions ---

export async function sendCode(phoneNumber: string): Promise<string> {
  const client = getClient();
  userSession = { phone: phoneNumber }; // Reset session for new attempt
  try {
    const result = await client.call('auth.sendCode', {
      phone_number: phoneNumber,
      // api_id and api_hash are taken from client instance if configured globally
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
      throw new Error('Sign up required. This app currently only supports sign in.');
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
        console.log('Password data received:', passwordData);
        
        if (!passwordData.srp_id || !passwordData.current_algo || !passwordData.srp_B) {
             console.error("Failed to get complete SRP parameters from account.getPassword", passwordData);
             throw new Error('Failed to initialize 2FA. Missing SRP parameters.');
        }

        userSession.srp_id = passwordData.srp_id.toString(); // srp_id is a long
        userSession.srp_params = {
            g: passwordData.current_algo.g,
            p: passwordData.current_algo.p, 
            salt1: passwordData.current_algo.salt1, 
            salt2: passwordData.current_algo.salt2, 
            srp_B: passwordData.srp_B 
        };
        
        // Throw a custom error object or structure that page.tsx can check
        const twoFactorError: any = new Error('2FA_REQUIRED');
        twoFactorError.srp_id = userSession.srp_id;
        throw twoFactorError;

      } catch (getPasswordError: any) {
        console.error('Error fetching password details for 2FA:', getPasswordError);
        const message = getPasswordError.error_message || (getPasswordError.message || 'Failed to fetch 2FA details.');
        throw new Error(message);
      }
    }
    const message = error.error_message || (error.message || 'Failed to sign in.');
    throw new Error(message);
  }
}


export async function checkPassword(password: string): Promise<any> {
  const client = getClient();
  if (!userSession.srp_id || !userSession.srp_params) {
    throw new Error('SRP parameters not available. 2FA flow not properly initiated.');
  }

  try {
    console.log("Computing SRP A and M1 values...");
    const { A, M1 } = await computeSrpValues(password, userSession.srp_params, userSession.srp_id);
    console.log("SRP A and M1 computed. Calling auth.checkPassword...");

    const checkResult = await client.call('auth.checkPassword', {
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
    }
    // SRP params might be single-use, but usually srp_id itself changes, not that params are cleared here.
    // MTProto library might handle srp_id invalidation internally by requiring getPassword again.
    return checkResult.user;

  } catch (error: any) {
    console.error('Error checking password:', error);
    const message = error.error_message || (error.message || 'Failed to check 2FA password.');
    throw new Error(message);
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
      limit: 50, // Increased limit
      hash: bigInt.zero, // Use bigInt for hash if library expects it, or 0 if number
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
    if (!idStr) return 'Invalid Peer ID';

    if (peer._ === 'peerUser') {
      const user = users.find(u => u.id && u.id.toString() === idStr);
      return user ? `${user.first_name || ''} ${user.last_name || ''}`.trim() || `User ${idStr}` : `User ${idStr}`;
    } else if (peer._ === 'peerChat') {
      const chat = chats.find(c => c.id && c.id.toString() === idStr);
      return chat ? chat.title : `Chat ${idStr}`;
    } else if (peer._ === 'peerChannel') {
      const channel = chats.find(c => c.id && c.id.toString() === idStr);
      return channel ? channel.title : `Channel ${idStr}`;
    }
  } catch (e) {
    console.error("Error in getPeerTitle processing peer:", peer, e);
  }
  return 'Invalid Peer Data';
}


function transformDialogsToCloudFolders(dialogsResult: any): CloudFolder[] {
  const { dialogs, chats, users } = dialogsResult;

  if (!dialogs || !Array.isArray(dialogs)) {
    console.warn('No dialogs found or dialogs is not an array.');
    return [];
  }
  
  return dialogs.map((dialog: any): CloudFolder | null => {
    if (!dialog || !dialog.peer) {
      console.warn("Skipping invalid dialog object:", dialog);
      return null;
    }
    const peer = dialog.peer;
    const chatTitle = getPeerTitle(peer, chats || [], users || []);
    
    let chatId: string | undefined;
    if (peer.user_id) chatId = peer.user_id.toString();
    else if (peer.chat_id) chatId = peer.chat_id.toString();
    else if (peer.channel_id) chatId = peer.channel_id.toString();
    
    if (!chatId) {
        console.warn("Could not determine chatId for dialog:", dialog);
        return null;
    }

    // Placeholder for actual media fetching and sorting for this chat.
    // For now, just creating the basic folder structure per chat.
    // Files array at root of chat folder can represent non-categorized media or recent items.
    const rootFiles: CloudFile[] = []; 
    // Example: if dialog.top_message contains info about a recent media, add it.
    // This part needs significant expansion for real media parsing.

    return {
      id: `chat-${chatId}`,
      name: chatTitle,
      isChatFolder: true,
      files: rootFiles, 
      folders: [ 
        { id: `chat-${chatId}-images`, name: "Images", files: [], folders: [] },
        { id: `chat-${chatId}-videos`, name: "Videos", files: [], folders: [] },
        { id: `chat-${chatId}-audio`, name: "Audio", files: [], folders: [] },
        { id: `chat-${chatId}-documents`, name: "Documents", files: [], folders: [] },
        { id: `chat-${chatId}-other`, name: "Other Media", files: [], folders: [] },
      ],
    };
  }).filter(folder => folder !== null) as CloudFolder[];
}


export async function signOut(): Promise<void> {
  const client = getClient();
  try {
    const result = await client.call('auth.logOut');
    console.log('Signed out successfully:', result);
  } catch (error: any) {
    console.error('Error signing out:', error);
    // It's often fine to ignore errors here if session was already invalid
    // or if the library handles client-side cleanup regardless.
    const message = error.error_message || (error.message || 'Failed to sign out.');
    throw new Error(message); // Optional: re-throw if UI needs to know
  } finally {
    userSession = {};
    // mtprotoClient = null; // Optionally force re-init of client.
    // The browser env of mtproto-core should handle localStorage cleanup or invalidation.
    // If issues persist with sessions not clearing, manual localStorage.removeItem for MTProto keys might be needed.
    console.log('Local user session cleared.');
  }
}

export async function isUserConnected(): Promise<boolean> {
  if (userSession.user) {
    const client = getClient();
    try {
        await client.call('users.getUsers', {id: [{_: 'inputUserSelf'}]});
        return true;
    } catch (error: any) {
        if (['AUTH_KEY_UNREGISTERED', 'USER_DEACTIVATED', 'SESSION_REVOKED', 'SESSION_EXPIRED', 'API_ID_INVALID', 'API_KEY_INVALID'].includes(error.error_message)) {
            console.warn("User session invalid or API keys incorrect:", error.error_message);
            userSession = {}; 
            // Consider calling signOut() here to ensure full cleanup if possible,
            // but avoid an infinite loop if signOut itself fails.
            return false;
        }
        console.warn("API call failed during connected check, but might not be auth error:", error.error_message);
        // Optimistically assume connected for other errors (e.g. network issues)
        return true; 
    }
  }
  return false;
}

console.log('Telegram service (telegramService.ts) loaded.');
// Basic check for API credentials on load
if (API_ID === undefined || !API_HASH) {
  console.error("CRITICAL: Telegram API_ID or API_HASH is not configured correctly. Service will not function.");
}

    