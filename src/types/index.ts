

export interface CloudFile {
  id: string; // Message ID can serve as ID
  name: string;
  type: 'image' | 'video' | 'audio' | 'document' | 'unknown';
  size?: string; // Formatted size string
  timestamp: number; // Unix timestamp (seconds) of the message
  url?: string; // Optional URL for linking or viewing
  dataAiHint?: string;
  messageId: number; // Keep original message ID for offset
  telegramMessage?: any; // To store the original Telegram message object
  totalSizeInBytes?: number; // Raw size in bytes for download progress calculation
  inputPeer?: any; // The inputPeer of the chat this file belongs to, for refreshing references
}

export interface CloudFolder { // Represents a Chat
  id: string; // Unique ID for the chat folder
  name: string; // Chat title
  folders: CloudFolder[]; // Will be empty now for chat folders
  files: CloudFile[];    // Populated by getChatMediaHistory
  isChatFolder?: boolean;
  inputPeer?: any; // MTProto InputPeer object for this chat
}

export interface GetChatsPaginatedResponse {
  folders: CloudFolder[];
  nextOffsetDate: number;
  nextOffsetId: number;
  nextOffsetPeer: any;
  hasMore: boolean;
}

export interface MediaHistoryResponse {
  files: CloudFile[];
  nextOffsetId?: number;
  hasMore: boolean;
}

export type DownloadStatus =
  | 'queued'
  | 'downloading'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'cdn_redirect'
  | 'refreshing_reference';

export interface FileHash {
  offset: number;
  limit: number;
  hash: Uint8Array;
}

export interface DownloadQueueItemType extends CloudFile {
  status: DownloadStatus;
  progress: number; // 0-100
  downloadedBytes: number;
  location?: any; // To store InputFileLocation
  chunks?: Uint8Array[];
  currentOffset: number;
  abortController?: AbortController;
  totalSizeInBytes: number; // Should be non-optional for active downloads
  // For CDN redirects
  cdnDcId?: number;
  cdnFileToken?: Uint8Array;
  cdnEncryptionKey?: Uint8Array;
  cdnEncryptionIv?: Uint8Array;
  cdnFileHashes?: FileHash[];
  cdnCurrentFileHashIndex?: number;
  error_message?: string; // To store error messages for failed downloads
}

export interface FileDownloadInfo {
    location: any;
    totalSize: number;
    mimeType: string;
}

// For upload.getFile and upload.getCdnFile responses
type SuccessfulFileChunk_Bytes = {
  bytes: Uint8Array;
  type: string; // storage.FileType
  isCdnRedirect?: never;
  cdnRedirectData?: never;
  errorType?: never;
};

type SuccessfulFileChunk_CdnRedirect = {
  bytes?: never;
  type?: never;
  isCdnRedirect: true;
  cdnRedirectData: {
    dc_id: number;
    file_token: Uint8Array;
    encryption_key: Uint8Array;
    encryption_iv: Uint8Array;
    file_hashes: any[]; // Raw FileHash objects from MTProto
  };
  errorType?: never;
};

type ErrorFileChunk = {
  bytes?: never;
  type?: never;
  isCdnRedirect?: never;
  cdnRedirectData?: never;
  errorType: 'FILE_REFERENCE_EXPIRED' | 'OTHER';
};

export type FileChunkResponse = SuccessfulFileChunk_Bytes | SuccessfulFileChunk_CdnRedirect | ErrorFileChunk;
