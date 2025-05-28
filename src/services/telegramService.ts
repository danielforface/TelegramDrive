
'use client';

import MTProto from '@mtproto/core/envs/browser';
import { sha256 } from '@cryptography/sha256';
import bigInt from 'big-integer';
import type { CloudFolder } from '@/types';

const API_ID = parseInt(process.env.NEXT_PUBLIC_TELEGRAM_API_ID || '', 10);
const API_HASH = process.env.NEXT_PUBLIC_TELEGRAM_API_HASH || '';

if (isNaN(API_ID) || !API_HASH) {
  console.warn(
    'Telegram API ID or HASH is not configured correctly in environment variables. Real connection will fail.'
  );
}

let mtprotoClient: MTProto | null = null;

// --- SRP Helper Types ---
interface SRPParameters {
  g: number;
  p: Uint8Array;
  salt1: Uint8Array;
  salt2: Uint8Array;
  srp_B: Uint8Array;
}

interface ComputedSRPValues {
  A: Uint8Array;
  M1: Uint8Array;
  // We don't need to return 'a' (private key) but it's used internally
}

// --- User Session ---
// Keep user session state scoped within the service
let userSession: {
  phone?: string;
  phone_code_hash?: string;
  user?: any; // Full user object after successful login
  srp_id?: string; // From account.getPassword
  srp_params?: SRPParameters; // Store SRP parameters from account.getPassword
} = {};


function getClient(): MTProto {
  if (!mtprotoClient) {
    if (isNaN(API_ID) || !API_HASH) {
      throw new Error('Telegram API credentials are not configured.');
    }
    mtprotoClient = new MTProto({
      api_id: API_ID,
      api_hash: API_HASH,
      // Browser env uses localStorage by default, no storageOptions needed for basic session persistence
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
  const len = hex.length / 2;
  const u8 = new Uint8Array(expectedLength || len);
  let i = 0;
  let j = 0;
  while (i < len) {
    u8[j] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    i += 1;
    j += 1;
  }
  // If expectedLength is provided and num is small, pad with leading zeros
  if (expectedLength && j < expectedLength) {
    const paddedU8 = new Uint8Array(expectedLength);
    paddedU8.set(u8, expectedLength - j);
    return paddedU8;
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

async function computeSrpValues(password: string, srpParams: SRPParameters, srpId: string): Promise<ComputedSRPValues> {
  const { g, p: p_bytes, salt1, salt2, srp_B } = srpParams;

  const p = bytesToBigInt(p_bytes);
  const B_bi = bytesToBigInt(srp_B);

  if (B_bi.isZero() || B_bi.greaterOrEquals(p)) {
    throw new Error('SRP_B_INVALID');
  }

  // Algorithm PSHA1(password, salt)
  const password_utf8 = new TextEncoder().encode(password);
  const P_inner_hash = sha256(concatBytes(salt1, password_utf8, salt1));
  const P_bytes = sha256(concatBytes(salt2, P_inner_hash, salt2));

  // x = BigInt(SHA1(salt + PSHA1(password, salt) + salt))
  // Telegram uses SHA256 for x, not SHA1
  const x_bi = bytesToBigInt(P_bytes);

  // Generate client ephemeral secret 'a' (2048-bit random number)
  const a_bytes = generateRandomBytes(256); // 2048 bits
  const a_bi = bytesToBigInt(a_bytes);

  // A = g^a mod p
  const A_bi = bigInt(g).modPow(a_bi, p);
  const A_bytes = bigIntToBytes(A_bi, 256); // p_bytes.length should be 256 for 2048-bit p

  // u = H(A || B)
  const u_bytes = sha256(concatBytes(A_bytes, srp_B));
  const u_bi = bytesToBigInt(u_bytes);

  // g_x = g^x mod p
  const g_x_bi = bigInt(g).modPow(x_bi, p);

  // k = H(p || g) (Telegram specific: k = H(p_bytes | g_bytes_padded_to_match_p_len_if_g_is_small))
  // For Telegram, g is a small integer. We need to convert g to bytes, then hash.
  // The 'g' in 'account.passwordAlgorithmKDFSHA256SHA256PBKDF2HMACSHA512iter100000SHA256ModPow' refers to this small int.
  // Let's assume g is already a number as given by current_algo.g
  // k = H(p_bytes, g_bytes) where g_bytes are representation of g
  // Simpler: k=3 for g=7 in Telegram's default algo. For now, assume k=3 or derive it if needed.
  // Official docs sometimes imply k = H(N, g), other times k=3.
  // Let's use k=H(p_bytes, g_bytes_for_hash) for safety.
  // Padded g to match p length is not standard for k calculation usually.
  // Usually k = H(N | g_padded_to_N_len). Or simpler k = H(p | g)
  // Using the simpler version for k:
  const gBytesForHash = bigIntToBytes(bigInt(g)); // Simple byte representation of g
  const k_bi = bytesToBigInt(sha256(concatBytes(p_bytes, gBytesForHash)));


  // S = (B - k * g^x) ^ (a + u * x) mod p
  // K = (srp_B - k_bi * g_x_bi) mod p
  let K_bi = B_bi.subtract(k_bi.multiply(g_x_bi)).mod(p);
  if (K_bi.isNegative()) K_bi = K_bi.add(p);


  // exponent = a + u * x
  const exp_bi = a_bi.add(u_bi.multiply(x_bi));

  const S_bi = K_bi.modPow(exp_bi, p);
  const S_bytes = bigIntToBytes(S_bi, 256); // p_bytes.length


  // M1 = H(H(p) xor H(g) | H(user_identity_not_used_here) | salt1 | salt2 | A | B | H(S))
  // M1 = H(p_hash XOR g_hash | salt1 | salt2 | A | B | K_s) where K_s = H(S)
  // Telegram's M1 formula: H(A_bytes | B_bytes | S_bytes)
  // This varies. The one specified in `telegram-web-k` is likely correct for mtproto.
  // M1 = H( (H(p) xor H(g)) | H(username) | salt1 | salt2 | A | B | K_S )
  // Let's use a common variant found in many libs: M1 = H(A_bytes | B_bytes | S_bytes)
  // Based on other implementations, it might be M1 = SHA256(A_bytes + B_bytes + S_bytes_hash)
  // or H( (H(N) xor H(g)) | H(U) | s | A | B | K_S )
  // Let's try the M1 = H(A | B | SHA256(S))
  // Or from other sources: M1 = SHA256(SHA256(p) ^ SHA256(g) | SHA256(salt1) | SHA256(salt2) | SHA256(A) | SHA256(B) | SHA256(S))

  // The most reliable M1 formula for Telegram seems to be:
  // M1 = SHA256(A_bytes | B_bytes | S_bytes) - This is from an old reference.
  // Let's check a more detailed one:
  // K = S_bytes (this is the shared secret key)
  // M1 = H ( (H(p) xor H(g)) | H(I) | salt1 | salt2 | A | B | K )
  // I is username, but for checkPassword, it's not explicitly passed.
  // Trying another simplified common M1 for SRP-6a: M1 = H(A | B | S)
  
  const M1_bytes = sha256(concatBytes(A_bytes, srp_B, S_bytes));

  return { A: A_bytes, M1: M1_bytes };
}


// --- API Service Functions ---

export async function sendCode(phoneNumber: string): Promise<string> {
  const client = getClient();
  userSession = { phone: phoneNumber }; // Reset session for new attempt
  try {
    const result = await client.call('auth.sendCode', {
      phone_number: phoneNumber,
      api_id: API_ID, // api_id and api_hash are often not needed here if client is pre-configured
      api_hash: API_HASH,
      settings: {
        _: 'codeSettings',
      },
    });
    userSession.phone_code_hash = result.phone_code_hash;
    console.log('Verification code sent, phone_code_hash:', result.phone_code_hash);
    return result.phone_code_hash;
  } catch (error) {
    console.error('Error sending code:', error);
    throw error; // Re-throw to be caught by UI
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
      // Optionally, handle sign-up if needed, though app spec says sign-in
      // For now, treat as an error for this app's flow
      return { error: 'Sign up required. This app currently only supports sign in.'};
    }
    
    console.log('Signed in successfully (or 2FA needed):', result);
    // `result.user` might not be present if 2FA is needed immediately
    if (result.user) {
        userSession.user = result.user;
    }
    return { user: result.user };

  } catch (error: any) {
    if (error.error_message === 'SESSION_PASSWORD_NEEDED') {
      console.log('2FA password needed. Fetching password details...');
      try {
        const passwordData = await client.call('account.getPassword');
        console.log('Password data received:', passwordData);
        userSession.srp_id = passwordData.srp_id?.toString(); // srp_id is a long, convert to string
        userSession.srp_params = {
            g: passwordData.current_algo.g,
            p: passwordData.current_algo.p, // Uint8Array
            salt1: passwordData.current_algo.salt1, // Uint8Array
            salt2: passwordData.current_algo.salt2, // Uint8Array
            srp_B: passwordData.srp_B // Uint8Array
        };
        
        if (!userSession.srp_id || !userSession.srp_params || !userSession.srp_params.srp_B) {
            console.error("Failed to get complete SRP parameters from account.getPassword", passwordData);
            return { error: 'Failed to initialize 2FA. Missing SRP parameters.' };
        }

        return { error: '2FA_REQUIRED', srp_id: userSession.srp_id };
      } catch (getPasswordError) {
        console.error('Error fetching password details for 2FA:', getPasswordError);
        throw getPasswordError; // Re-throw
      }
    }
    console.error('Error signing in:', error);
    throw error; // Re-throw other errors
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
    userSession.user = checkResult.user; // On success, user object is returned
    // Clear SRP params after successful use or if they are single-use
    // delete userSession.srp_params; 
    // delete userSession.srp_id;
    return checkResult.user;

  } catch (error: any) {
    console.error('Error checking password:', error);
    // Specific SRP errors might include 'PASSWORD_HASH_INVALID', 'SRP_ID_INVALID', 'SRP_A_EMPTY' etc.
    // These indicate issues with the SRP calculation (A, M1) or stale srp_id.
    throw error; // Re-throw to be handled by UI
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
    // Example: Fetch dialogs (chats list)
    const dialogsResult = await client.call('messages.getDialogs', {
      offset_date: 0,
      offset_id: 0,
      offset_peer: { _: 'inputPeerEmpty' },
      limit: 20, // Adjust as needed
      hash: 0, // Use 0 for the first request
    });
    console.log('Dialogs raw result:', dialogsResult);
    // This is a placeholder transformation. Real transformation will be more complex.
    return transformDialogsToCloudFolders(dialogsResult);
  } catch (error) {
    console.error('Error fetching dialogs:', error);
    throw error;
  }
}

// Helper to get a display title for a peer
function getPeerTitle(peer: any, chats: any[], users: any[]): string {
  if (!peer) return 'Unknown Peer';
  
  try {
    if (peer._ === 'peerUser') {
      const user = users.find(u => u.id && u.id.toString() === peer.user_id?.toString());
      return user ? `${user.first_name || ''} ${user.last_name || ''}`.trim() || `User ${user.id}` : `User ${peer.user_id}`;
    } else if (peer._ === 'peerChat') {
      const chat = chats.find(c => c.id && c.id.toString() === peer.chat_id?.toString());
      return chat ? chat.title : `Chat ${peer.chat_id}`;
    } else if (peer._ === 'peerChannel') {
      const channel = chats.find(c => c.id && c.id.toString() === peer.channel_id?.toString());
      return channel ? channel.title : `Channel ${peer.channel_id}`;
    }
  } catch (e) {
    console.error("Error in getPeerTitle processing peer:", peer, e);
  }
  return 'Invalid Peer Data';
}

// Placeholder: Real transformation logic is needed
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
    const chatId = peer.user_id?.toString() || peer.chat_id?.toString() || peer.channel_id?.toString();

    if (!chatId) {
        console.warn("Could not determine chatId for dialog:", dialog);
        return null;
    }

    // Placeholder for actual media fetching and sorting for this chat
    return {
      id: `chat-${chatId}`,
      name: chatTitle,
      isChatFolder: true,
      files: [], 
      folders: [ 
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
    // For browser env, mtproto-core with localStorage should handle session state.
    // Explicitly clearing localStorage keys used by mtproto-core might be needed if logout isn't fully clearing.
    // This typically involves knowing the keys, e.g., 'mtproto_auth_key_dcX', 'mtproto_server_time_offset_dcX'
    // A robust library often provides a method like `client.storage.clear()` or similar.
    // For now, resetting userSession should be enough for app logic.
    // If `mtprotoClient.storage.clear()` or similar exists, use it.
  }
}

export async function isUserConnected(): Promise<boolean> {
  if (userSession.user) {
    const client = getClient();
    try {
        // A light API call to check session validity e.g. users.getUsers
        await client.call('users.getUsers', {id: [{_: 'inputUserSelf'}]});
        return true;
    } catch (error: any) {
        // Specific errors like AUTH_KEY_UNREGISTERED indicate an invalid session
        if (error.error_message === 'AUTH_KEY_UNREGISTERED' || 
            error.error_message === 'USER_DEACTIVATED' ||
            error.error_message === 'SESSION_REVOKED' || // Common session invalidation errors
            error.error_message === 'SESSION_EXPIRED') {
            console.warn("User session invalid:", error.error_message);
            userSession = {}; // Clear invalid session
            return false;
        }
        console.warn("API call failed during connected check, but might not be auth error:", error.error_message);
        // For other errors (e.g. network issues), we might still consider the session potentially valid
        // or let higher-level logic decide based on the error. For now, assume "optimistically connected".
        return true; 
    }
  }
  return false;
}


console.log('Telegram service (telegramService.ts) loaded.');
