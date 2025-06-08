
'use client';

import MTProto from '@mtproto/core/envs/browser';

export const CRITICAL_ERROR_MESSAGE_PREFIX = "CRITICAL_TELEGRAM_API_ERROR: ";

const API_ID_STRING = process.env.NEXT_PUBLIC_TELEGRAM_API_ID;
const API_HASH = process.env.NEXT_PUBLIC_TELEGRAM_API_HASH;

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

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

class TelegramAPIInternal {
  public mtproto: MTProto;
  private initialized: boolean = false;
  private apiIdInternal: number;
  private apiHashInternal: string;

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
      this.apiIdInternal = 0;
      this.apiHashInternal = '';
      this.initialized = false;
      return;
    }

    this.apiIdInternal = API_ID;
    this.apiHashInternal = API_HASH;

    try {
      this.mtproto = new MTProto({
        api_id: this.apiIdInternal,
        api_hash: this.apiHashInternal,
      });
      this.initialized = true;
      // Basic listeners, more specific ones in telegramUpdates.ts
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

  isInitialized(): boolean {
    return this.initialized;
  }

  getMTProto(): MTProto {
    return this.mtproto;
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
      originalErrorObject = JSON.parse(JSON.stringify(error)); // Deep copy
      const { error_code, error_message } = originalErrorObject || {};

      if (error_code === 420 && typeof error_message === 'string' && error_message.startsWith('FLOOD_WAIT_')) {
        const secondsStr = error_message.split('FLOOD_WAIT_')[1];
        const seconds = parseInt(secondsStr, 10);
        if (!isNaN(seconds)) {
            const ms = seconds * 1000;
            await sleep(ms);
            return this.call(method, params, options); // Retry
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
        return this.call(method, params, options); // Retry with new DC info
      }

      let processedError: Error;
      if (error instanceof Error && error.message) {
        processedError = error;
      } else if (error_message) {
        processedError = new Error(error_message);
      } else {
        processedError = new Error(`MTProto call '${method}' failed with an unidentified error. Raw error: ${JSON.stringify(error)}`);
      }

      // Attach original error info for better debugging if needed
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

export const telegramApiInstance = new TelegramAPIInternal();

if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  (window as any).telegramServiceApiInstance = telegramApiInstance;
}
