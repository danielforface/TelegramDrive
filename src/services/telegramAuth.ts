
'use client';

import { telegramApiInstance } from './telegramAPI';
import type { UserSessionType } from '@/types'; // Assuming UserSessionType will be defined in types

let userSession: UserSessionType = {};

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
      // console.error("Failed to save user data to localStorage:", e);
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
      // console.error("Failed to load user data from localStorage:", e);
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
  userSession = { phone: fullPhoneNumber }; // Reset session for new phone number
  saveUserDataToLocalStorage();

  const sendCodePayload = {
    phone_number: fullPhoneNumber,
    settings: {
      _: 'codeSettings',
    },
  };

  try {
    const result = await telegramApiInstance.call('auth.sendCode', sendCodePayload);
    if (!result || !result.phone_code_hash) {
        throw new Error("Failed to send code: phone_code_hash not received from Telegram.");
    }
    userSession.phone_code_hash = result.phone_code_hash;
    return userSession.phone_code_hash;
  } catch (error: any) {
    const message = error.message || (error.originalErrorObject?.error_message || 'Failed to send code.');
     if (message === 'AUTH_RESTART' || error.error_code === 401) { // 401 might also mean restart
         throw new Error('AUTH_RESTART');
    }
    throw new Error(message);
  }
}

export async function signIn(fullPhoneNumber: string, code: string): Promise<{ user?: any; error?: string; srp_id?: string }> {
  if (!userSession.phone_code_hash) {
    throw new Error('AUTH_RESTART'); // Should have phone_code_hash from sendCode
  }
  if (!userSession.phone) userSession.phone = fullPhoneNumber; // Ensure phone is set

  try {
    const result = await telegramApiInstance.call('auth.signIn', {
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
    delete userSession.phone_code_hash; // Clear after use
    return { user: result.user };

  } catch (error: any) {
    const errorMessage = error.message || (error.originalErrorObject?.error_message);

    if (errorMessage === 'SESSION_PASSWORD_NEEDED') {
      try {
        const passwordData = await telegramApiInstance.call('account.getPassword');
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
        twoFactorError.srp_id = userSession.srp_id; // Pass srp_id for 2FA step
        throw twoFactorError;

      } catch (getPasswordError: any) {
        delete userSession.phone_code_hash;
        if (getPasswordError.message === '2FA_REQUIRED' && getPasswordError.srp_id) {
          throw getPasswordError; // Propagate if it's the 2FA error we expect
        }
        if (getPasswordError.message === 'AUTH_RESTART' || getPasswordError.error_code === 401) {
            throw getPasswordError;
        }
        const messageToThrow = getPasswordError.message || 'Failed to fetch 2FA details after SESSION_PASSWORD_NEEDED.';
        throw new Error(messageToThrow);
      }
    }
    delete userSession.phone_code_hash;
    if (errorMessage === 'AUTH_RESTART' || error.error_code === 401) throw new Error('AUTH_RESTART');
    throw error; // Re-throw other errors
  }
}

export async function checkPassword(password: string): Promise<any> {
  if (!userSession.srp_id || !userSession.srp_params || !telegramApiInstance.getMTProto().crypto?.getSRPParams) {
    delete userSession.srp_params;
    delete userSession.srp_id;
    throw new Error('AUTH_RESTART'); // Critical 2FA parameters missing
  }

  try {
    const { g, p, salt1, salt2, srp_B } = userSession.srp_params;
    const { A, M1 } = await telegramApiInstance.getMTProto().crypto.getSRPParams({
        g, p, salt1, salt2, gB: srp_B, password,
    });
    
    const checkResult = await telegramApiInstance.call('auth.checkPassword', {
        password: {
            _: 'inputCheckPasswordSRP',
            srp_id: userSession.srp_id, // srp_id should be string
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
    // SRP_ID_INVALID or SRP_METHOD_INVALID usually means something went wrong with 2FA setup/parameters, restart auth
    if (message === 'SRP_ID_INVALID' || message?.includes('AUTH_RESTART') || message?.includes('SRP_METHOD_INVALID') || error.error_code === 401) {
        throw new Error('AUTH_RESTART');
    }
    if (error.originalErrorObject && Object.keys(error.originalErrorObject).length > 0 && error.message) {
      throw error; // Re-throw with original context if available
    }
    throw new Error('AUTH_RESTART'); // Default to auth restart for unknown 2FA errors
  }
}

export async function signOut(): Promise<void> {
  try {
    if (telegramApiInstance && telegramApiInstance.isInitialized()) {
        await telegramApiInstance.call('auth.logOut');
    }
  } catch (error: any) {
    // console.error("Error during server logout, continuing local cleanup:", error);
  } finally {
    userSession = {};
    if (typeof window !== 'undefined') {
      localStorage.removeItem(USER_SESSION_KEY);
      localStorage.removeItem(USER_PHONE_KEY);
      try {
        if (telegramApiInstance && telegramApiInstance.isInitialized()) {
          await telegramApiInstance.getMTProto().clearStorage();
        }
      } catch (e) {
        // console.error("Error clearing MTProto storage:", e);
      }
    }
  }
}

export async function isUserConnected(): Promise<boolean> {
  if (!telegramApiInstance.isInitialized()) {
      if (userSession.user) await signOut(); // Clean up local session if API was never init
      return false;
  }

  if (userSession.user) {
    try {
        await telegramApiInstance.call('users.getUsers', {id: [{_: 'inputUserSelf'}]});
        return true;
    } catch (error: any) {
        const errorMessage = error.message || error.originalErrorObject?.error_message;
        const authErrorMessages = [
            'AUTH_KEY_UNREGISTERED', 'USER_DEACTIVATED', 'SESSION_REVOKED',
            'SESSION_EXPIRED', 'API_ID_INVALID', 'AUTH_RESTART', 'PHONE_CODE_INVALID',
            'PHONE_NUMBER_INVALID', 'CONNECTION_API_ID_INVALID', 'Invalid hash in mt_dh_gen_ok'
        ];

        if (errorMessage && (authErrorMessages.some(authMsg => errorMessage.includes(authMsg)) || error.error_code === 401) ) {
            await signOut(); // Force local cleanup
            return false;
        }
        // For other errors (e.g., network issues), assume still connected but flag error
        // console.warn("isUserConnected check failed but not due to auth error:", error);
        return true; // Potentially still connected, UI might show connection issue
    }
  }
  return false; // No user in session
}


if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  (window as any).telegramUserSession = userSession;
}
