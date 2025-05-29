
'use client';

import MTProto from '@mtproto/core/envs/browser';
import type { CloudFolder, CloudFile, GetChatsPaginatedResponse, MediaHistoryResponse } from '@/types';

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
    // alert(errorMessage); // Potentially alert in dev mode
    API_ID = undefined; 
  }
} else {
   const envErrorMsg = "CRITICAL: NEXT_PUBLIC_TELEGRAM_API_ID is not set in environment variables. Real connection will fail. \n" +
                      "Please create a .env.local file in the root of your project and add: \n" +
                      "NEXT_PUBLIC_TELEGRAM_API_ID=YOUR_API_ID_HERE \n" +
                      "NEXT_PUBLIC_TELEGRAM_API_HASH=YOUR_API_HASH_HERE \n" +
                      "You MUST restart your development server after creating or modifying the .env.local file.";
  console.warn(envErrorMsg);
  // alert(envErrorMsg); // Potentially alert in dev mode
}

if (!API_HASH) {
  const envErrorMsg = "CRITICAL: NEXT_PUBLIC_TELEGRAM_API_HASH is not set in environment variables. Real connection will fail. \n" +
                      "Please ensure it is set in your .env.local file and you have restarted your development server. \n" +
                      "Example: NEXT_PUBLIC_TELEGRAM_API_HASH=your_actual_api_hash";
  console.warn(envErrorMsg);
  // alert(envErrorMsg); // Potentially alert in dev mode
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
      // alert(errorMessage); // This could be annoying but useful for immediate feedback in dev
      // We throw an error here because the service cannot function without these.
      // The UI should ideally catch this and display a user-friendly message.
      throw new Error(errorMessage);
    }
    try {
      this.mtproto = new MTProto({
        api_id: API_ID,
        api_hash: API_HASH,
        // storageOptions are handled by the browser environment by default (localStorage)
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
        // alert(`MTProto client initialization failed: ${initError.message || JSON.stringify(initError)}`);
        throw new Error(`MTProto client initialization failed: ${initError.message || JSON.stringify(initError)}`);
    }
  }

  async call(method: string, params: any = {}, options: any = {}): Promise<any> {
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

            if (type === 'PHONE') { // Or other types that require setDefaultDc
              console.log(`Setting default DC to ${dcId} due to PHONE_MIGRATE.`);
              await this.mtproto.setDefaultDc(dcId);
            } else { // For other migrate errors like FILE_MIGRATE, NETWORK_MIGRATE, etc.
              // Pass dcId in options for the retry
              console.log(`Retrying ${method} with dcId ${dcId}.`);
              options = { ...options, dcId };
            }
            return this.call(method, params, options); // Retry the call
        } else {
            console.error(`Could not parse migrate DC from: ${error_message}`);
        }
      }
      
      // Ensure a proper error object is propagated
      let processedError: Error;
      if (originalError instanceof Error && originalError.message) {
        processedError = originalError;
      } else if (typeof originalError === 'object' && originalError !== null && (originalError.error_message || originalError.message)) {
        processedError = new Error(originalError.error_message || originalError.message);
      } else {
        // If the error is truly empty or unidentifiable, create a generic error
        const authMethods = ['auth.sendCode', 'auth.signIn', 'auth.checkPassword'];
        if (authMethods.includes(method)) {
            console.warn(`Low-level or empty error during ${method}. Clearing potentially problematic local session parts.`);
            delete userSession.phone_code_hash;
            delete userSession.srp_id;
            delete userSession.srp_params;
        }
        processedError = new Error(`MTProto call '${method}' failed. Raw error: ${JSON.stringify(originalError)}`);
      }
      
      // Attach the original error object for further inspection if needed
      if (originalError !== processedError && typeof originalError === 'object' && originalError !== null) {
        (processedError as any).originalErrorObject = originalError;
      }
      return Promise.reject(processedError);
    }
  }
}

const api = new API(); // Initialize the API wrapper

// User session state (in-memory, but localStorage is used by mtproto-core itself for auth keys)
let userSession: {
  phone?: string; // To store the phone number used for login for display/resend purposes
  phone_code_hash?: string;
  user?: any; // Stores user object from Telegram
  srp_id?: string; // For 2FA
  srp_params?: { // For 2FA
    g: number;
    p: Uint8Array;
    salt1: Uint8Array;
    salt2: Uint8Array;
    srp_B: Uint8Array;
  };
} = {};

// localStorage keys
const USER_DATA_KEY = 'telegram_user_data'; // For storing user object (user info)
const USER_PHONE_KEY = 'telegram_user_phone'; // For storing phone number

// Function to save user data (like user object and phone) to localStorage
function saveUserDataToLocalStorage() {
  if (typeof window !== 'undefined') {
    try {
      if (userSession.user) {
        localStorage.setItem(USER_DATA_KEY, JSON.stringify(userSession.user));
      }
      if (userSession.phone) {
        localStorage.setItem(USER_PHONE_KEY, userSession.phone);
      }
      console.log('User data (user object and phone) saved to localStorage.');
    } catch (e) {
      console.error('Error saving user data to localStorage:', e);
    }
  }
}

// Function to load user data from localStorage
function loadUserDataFromLocalStorage() {
  if (typeof window !== 'undefined') {
    try {
      const storedUser = localStorage.getItem(USER_DATA_KEY);
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
      localStorage.removeItem(USER_DATA_KEY);
      localStorage.removeItem(USER_PHONE_KEY);
    }
  }
}

// Load user data from localStorage when the service initializes
if (typeof window !== 'undefined') {
    loadUserDataFromLocalStorage();
}

export function getUserSessionDetails(): { phone?: string; user?: any } {
    // Ensure userSession.phone is available if userSession.user is (e.g. after page reload)
    if (userSession.user && !userSession.phone && typeof window !== 'undefined') {
        const storedPhone = localStorage.getItem(USER_PHONE_KEY);
        if (storedPhone) userSession.phone = storedPhone;
    }
    return { phone: userSession.phone, user: userSession.user };
}


// --- Authentication Methods ---
export async function sendCode(fullPhoneNumber: string): Promise<string> {
  userSession = { phone: fullPhoneNumber }; // Reset relevant parts of session for new attempt
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
     if (message === 'AUTH_RESTART' || (error.originalErrorObject?.error_message === 'AUTH_RESTART')) {
         throw new Error('AUTH_RESTART'); // Propagate specific error for UI handling
    }
    // Other errors are propagated by api.call now
    throw error; // Re-throw the processed error from api.call
  }
}

export async function signIn(fullPhoneNumber: string, code: string): Promise<{ user?: any; error?: string; srp_id?: string }> {
  if (!userSession.phone_code_hash) {
    console.error('phone_code_hash missing for signIn. Call sendCode first.');
    throw new Error('phone_code_hash not set. Call sendCode first.');
  }
  // Ensure we use the phone number associated with the current auth flow
  if (userSession.phone !== fullPhoneNumber) {
    console.warn(`Phone number mismatch during signIn: session has ${userSession.phone}, attempting with ${fullPhoneNumber}. Using session phone: ${userSession.phone}.`);
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
        saveUserDataToLocalStorage(); // Save user object and phone
    }
    delete userSession.phone_code_hash; 
    return { user: result.user };

  } catch (error: any) {
    const errorMessage = error.message || (error.originalErrorObject?.error_message);
    // This console.log is fine as it's specific to signIn logic
    console.log('Error in signIn function after api.call:', errorMessage, error.originalErrorObject || error); 

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
        throw twoFactorError; // This is caught by page.tsx to switch to password input

      } catch (getPasswordError: any) {
        // This condition checks if the error is the one we intentionally threw.
        if (getPasswordError.message === '2FA_REQUIRED' && getPasswordError.srp_id) {
          console.log('2FA required, password details fetched. srp_id:', getPasswordError.srp_id);
        } else {
          // For any other error during getPassword
          console.error('Error fetching password details for 2FA:', getPasswordError.message, getPasswordError.originalErrorObject || getPasswordError);
        }
        delete userSession.phone_code_hash;
        throw getPasswordError; // Re-throw to be caught by page.tsx
      }
    }
    delete userSession.phone_code_hash; 
    throw error; // Re-throw the processed error (could be from api.call or a new one from here)
  }
}


export async function checkPassword(password: string): Promise<any> {
  if (!userSession.srp_id || !userSession.srp_params) {
    console.error("SRP parameters not available for checkPassword. 2FA flow not properly initiated or srp_params missing.");
    throw new Error('SRP parameters not available. Please try the login process again.');
  }

  try {
    const { g, p, salt1, salt2, srp_B } = userSession.srp_params;
    console.log("Attempting to get SRPParams for checkPassword with provided password and stored srp_params.");
    
    // @ts-ignore - mtproto.crypto might not be perfectly typed in all envs
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
    // Clear SRP params after attempt (success or fail handled by specific errors)
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
    throw error; // Re-throw processed error
  }
}

export async function signOut(): Promise<void> {
  try {
    await api.call('auth.logOut');
    console.log('Signed out successfully from Telegram server.');
  } catch (error: any) {
    console.error('Error signing out from Telegram server:', error.message, error.originalErrorObject || error);
    // Proceed with local cleanup even if server logout fails
  } finally {
    userSession = {}; // Clear in-memory session
    if (typeof window !== 'undefined') {
      localStorage.removeItem(USER_DATA_KEY); 
      localStorage.removeItem(USER_PHONE_KEY);
      try {
        // Attempt to clear mtproto-core's internal storage if method exists
        // @ts-ignore
        if (api && api.mtproto && typeof api.mtproto.clearStorage === 'function') {
        // @ts-ignore
          await api.mtproto.clearStorage();
          console.log('mtproto-core internal storage cleared.');
        } else {
          // Fallback: Manually clear known localStorage keys used by mtproto-core if necessary
          // This is a bit of a guess and might need adjustment based on library's internal keys.
          // Common keys might be related to 'dc_id', 'auth_key', 'server_salt'.
          // For now, we rely on mtproto-core's own management or a full localStorage.clear() if desperate.
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
  if (userSession.user) { // Check if we have a user object in our session
    try {
        // Make a lightweight API call to verify the session is still active
        await api.call('users.getUsers', {id: [{_: 'inputUserSelf'}]});
        console.log("User session is active (checked with users.getUsers).");
        return true;
    } catch (error: any) {
        const errorMessage = error.message || error.originalErrorObject?.error_message;
        const authErrorMessages = [
            'AUTH_KEY_UNREGISTERED', 'USER_DEACTIVATED', 'SESSION_REVOKED', 
            'SESSION_EXPIRED', 'API_ID_INVALID', 'AUTH_RESTART' 
            // Note: API_ID_INVALID should ideally be caught much earlier during API init.
        ];

        if (errorMessage && authErrorMessages.some(authMsg => errorMessage.includes(authMsg))) {
            console.warn("User session no longer valid or API keys incorrect due to:", errorMessage, "Performing local logout.");
            await signOut(); // Perform a full local and attempted server logout
            return false;
        }
        // For other errors (network issues, etc.), assume session might still be valid if user object exists
        console.warn("API call failed during connected check, but might not be an auth error. User object exists locally. Error:", errorMessage, error.originalErrorObject || error);
        return true; // Optimistically true if we have user object and error isn't a clear auth-invalidation one
    }
  }
  // No user object in local session, so definitely not connected
  return false;
}

// --- Data Fetching Methods ---

function formatFileSize(bytes: number, decimals = 2): string {
  if (!bytes || bytes === 0) return '0 Bytes'; // Handle null, undefined, or 0
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

    console.log('Chat media history raw result:', historyResult);

    const mediaFiles: CloudFile[] = [];
    let newOffsetId: number | undefined = offsetId; 
    let hasMoreMessages = false;

    if (historyResult.messages && historyResult.messages.length > 0) {
      historyResult.messages.forEach((msg: any) => {
        if (msg.media && (msg.media._ === 'messageMediaPhoto' || msg.media._ === 'messageMediaDocument')) {
          let fileType: CloudFile['type'] = 'unknown';
          let fileName = `file_${msg.id}`;
          let fileSize: string | undefined;
          let dataAiHint: string | undefined;
          let fileUrl: string | undefined; // For potential direct URLs (e.g., from web documents or cached)

          const msgDate = new Date(msg.date * 1000).toLocaleDateString();

          if (msg.media._ === 'messageMediaPhoto' && msg.media.photo) {
            const photoDetails = historyResult.photos?.find((p:any) => p.id?.toString() === msg.media.photo.id?.toString());
            if (photoDetails) {
              fileType = 'image';
              fileName = `photo_${photoDetails.id?.toString()}_${msg.date}.jpg`; 
              const largestSize = photoDetails.sizes?.sort((a:any,b:any) => (b.w*b.h) - (a.w*a.h))[0];
              if(largestSize && largestSize.size) fileSize = formatFileSize(largestSize.size);
              // TODO: Implement logic to get actual photo URL or data for display/download if needed
            }
            dataAiHint = "photograph image";
          } else if (msg.media._ === 'messageMediaDocument' && msg.media.document) {
            const docDetails = historyResult.documents?.find((d:any) => d.id?.toString() === msg.media.document.id?.toString());
            if (docDetails) {
                fileName = docDetails.attributes?.find((attr: any) => attr._ === 'documentAttributeFilename')?.file_name || `document_${docDetails.id?.toString()}`;
                fileSize = docDetails.size ? formatFileSize(docDetails.size) : undefined;
                
                if (docDetails.mime_type?.startsWith('image/')) {
                    fileType = 'image'; dataAiHint = "graphic image";
                } else if (docDetails.mime_type?.startsWith('video/')) {
                    fileType = 'video'; dataAiHint = "video clip";
                } else if (docDetails.mime_type?.startsWith('audio/')) {
                    fileType = 'audio'; dataAiHint = "audio recording";
                } else {
                    fileType = 'document'; dataAiHint = "document file";
                }
                // TODO: Implement logic to get actual document URL or data
            }
          }
          
          if (fileType !== 'unknown' || (fileType === 'document' && fileSize)) { // Allow documents even if type is unknown initially
            mediaFiles.push({
              id: msg.id.toString(),
              messageId: msg.id,
              name: fileName,
              type: fileType,
              size: fileSize,
              lastModified: msgDate,
              url: fileUrl, // Will be undefined for now
              dataAiHint: dataAiHint,
              telegramMessage: msg, 
            });
          }
        }
      });
      
      // Determine nextOffsetId from the last processed message (media or not)
      if (historyResult.messages.length > 0) {
        newOffsetId = historyResult.messages[historyResult.messages.length - 1].id;
      }
      
      // hasMore is true if the API returned a full batch of messages (regardless of how many were media)
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
    console.warn('User not signed in. Cannot fetch chats.');
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
    console.log('Dialogs raw result:', dialogsResult);

    const transformedFolders = transformDialogsToCloudFolders(dialogsResult);

    let newOffsetDate = offsetDate;
    let newOffsetId = offsetId;
    let newOffsetPeerInput = { ...offsetPeer }; // Clone to avoid modifying the original if it's an object
    let hasMore = false;

    if (dialogsResult.dialogs && dialogsResult.dialogs.length > 0) {
      // hasMore is true if the number of dialogs received equals the limit, suggesting more might be available.
      hasMore = dialogsResult.dialogs.length === limit;

      if (hasMore) { // Only update offsets if there's a possibility of more chats
        const lastDialog = dialogsResult.dialogs[dialogsResult.dialogs.length - 1];
        newOffsetId = lastDialog.top_message; 
        
        // Construct inputPeer for offset based on lastDialog.peer
        const peerForOffset = lastDialog.peer;
        if (peerForOffset._ === 'peerUser') {
            const user = dialogsResult.users.find((u:any) => u.id?.toString() === peerForOffset.user_id?.toString());
            if (user && user.access_hash) { // access_hash is crucial for inputPeerUser
                 newOffsetPeerInput = { _: 'inputPeerUser', user_id: user.id, access_hash: user.access_hash };
            } else {
                console.warn("Could not find user or access_hash for peerUser offset, peer:", peerForOffset);
                newOffsetPeerInput = { _: 'inputPeerEmpty' }; // Fallback
            }
        } else if (peerForOffset._ === 'peerChat') {
             newOffsetPeerInput = { _: 'inputPeerChat', chat_id: peerForOffset.chat_id };
        } else if (peerForOffset._ === 'peerChannel') {
            const chat = dialogsResult.chats.find((c:any) => c.id?.toString() === peerForOffset.channel_id?.toString());
             if (chat && chat.access_hash) { // access_hash is crucial for inputPeerChannel
                newOffsetPeerInput = { _: 'inputPeerChannel', channel_id: chat.id, access_hash: chat.access_hash };
            } else {
                console.warn("Could not find channel or access_hash for peerChannel offset, peer:", peerForOffset);
                newOffsetPeerInput = { _: 'inputPeerEmpty' }; // Fallback
            }
        } else {
            console.warn("Unknown peer type for offset, peer:", peerForOffset);
            newOffsetPeerInput = { _: 'inputPeerEmpty' }; // Fallback
        }

        // Try to find the date of the top_message for offset_date
        const messages = dialogsResult.messages || [];
        const lastMessageDetails = messages.find((msg: any) => msg.id?.toString() === newOffsetId?.toString() &&
          ( (msg.peer_id?.user_id?.toString() === peerForOffset.user_id?.toString()) ||
            (msg.peer_id?.chat_id?.toString() === peerForOffset.chat_id?.toString()) ||
            (msg.peer_id?.channel_id?.toString() === peerForOffset.channel_id?.toString())
          )
        );

        if (lastMessageDetails && typeof lastMessageDetails.date === 'number') {
          newOffsetDate = lastMessageDetails.date;
        } else {
          // If specific message date not found, use the date of the last dialog's top message if available,
          // or keep existing offsetDate. This part can be tricky.
          console.warn("Could not determine nextOffsetDate accurately from messages. Last dialog:", lastDialog, "Found message:", lastMessageDetails);
          // Fallback: if lastDialog has a date (less common for dialog object itself, more for its top_message's details)
          // For now, we'll rely on the newOffsetId and newOffsetPeer primarily.
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
    throw new Error(message); // Propagate error
  }
}

// Helper to get a displayable title for a peer
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
  console.warn("Could not determine peer title for:", JSON.stringify(peer));
  return 'Invalid Peer Data';
}

// Transforms dialogs from API to CloudFolder structure
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

    let peerId: string | undefined;
    let inputPeerForHistory: any | undefined;

    try {
        const peerUserIdStr = peer.user_id?.toString();
        const peerChatIdStr = peer.chat_id?.toString();
        const peerChannelIdStr = peer.channel_id?.toString();

        if (peer._ === 'peerUser' && peerUserIdStr) {
            peerId = peerUserIdStr;
            const user = users?.find((u:any) => u.id?.toString() === peerId);
            if (user && user.access_hash) { // access_hash is important
                inputPeerForHistory = { _: 'inputPeerUser', user_id: user.id, access_hash: user.access_hash };
            } else {
                 console.warn("User or access_hash not found for peerUser:", peerId);
            }
        } else if (peer._ === 'peerChat' && peerChatIdStr) {
            peerId = peerChatIdStr;
            //const chatAssociated = chats?.find((c:any) => c.id?.toString() === peerId); // Not needed for inputPeerChat
            inputPeerForHistory = { _: 'inputPeerChat', chat_id: peer.chat_id };
            
        } else if (peer._ === 'peerChannel' && peerChannelIdStr) {
            peerId = peerChannelIdStr;
            const chatAssociated = chats?.find((c:any) => c.id?.toString() === peerId); 
            if (chatAssociated && chatAssociated.access_hash) { // access_hash is important
                inputPeerForHistory = { _: 'inputPeerChannel', channel_id: chatAssociated.id, access_hash: chatAssociated.access_hash };
            } else {
                 console.warn("Channel or access_hash not found for peerChannel:", peerId);
            }
        }
    } catch (e) {
        console.error("Error constructing inputPeer for dialog:", dialog, e);
    }


    if (!peerId || !inputPeerForHistory) { 
        console.warn("Could not determine peerId or valid inputPeerForHistory for dialog:", dialog.peer, "Peer Data:", peer, "InputPeer attempt:", inputPeerForHistory);
        return null; 
    }

    // Ensure unique ID for folder, e.g., using top_message or a timestamp as fallback
    const uniqueSuffix = dialog.top_message?.toString() || Date.now().toString(); 
    const folderIdBase = `chat-${peerId}-${uniqueSuffix}`;


    return {
      id: folderIdBase,
      name: chatTitle,
      isChatFolder: true,
      inputPeer: inputPeerForHistory, // Store the peer info for fetching history
      files: [], // Files will be fetched on demand
      folders: [], // No subfolders for chats in this model
    };
  }).filter(folder => folder !== null) as CloudFolder[]; 
}


console.log('Telegram service (telegramService.ts) loaded with API class wrapper and update listeners.');
if (API_ID === undefined || !API_HASH) {
  console.error("CRITICAL: Telegram API_ID or API_HASH is not configured correctly in .env.local. Service will not function. Ensure NEXT_PUBLIC_TELEGRAM_API_ID and NEXT_PUBLIC_TELEGRAM_API_HASH are set and the dev server was restarted.");
}

// For debugging in browser console
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  (window as any).telegramServiceApi = api;
  (window as any).telegramUserSession = userSession;
}
