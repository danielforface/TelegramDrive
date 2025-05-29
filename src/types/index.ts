
export interface CloudFile {
  id: string; // Message ID can serve as ID
  name: string;
  type: 'image' | 'video' | 'audio' | 'document' | 'unknown';
  size?: string; // Formatted size string
  lastModified?: string; // Will be message date
  url?: string; // Optional URL for linking or viewing (requires further implementation)
  dataAiHint?: string;
  messageId: number; // Keep original message ID for offset
  telegramMessage?: any; // To store the original Telegram message object
  totalSizeInBytes?: number; // Raw size in bytes for download progress calculation
  inputPeer?: any; // The inputPeer of the chat this file belongs to, for refreshing references
}

export interface CloudFolder { // Represents a Chat
  id: string; // Unique ID for the chat folder (e.g., chat-${peerId}-${topMessage})
  name: string; // Chat title
  folders: CloudFolder[]; // Will be empty now, as media is directly under chat
  files: CloudFile[];    // Will be empty initially, populated by getChatMediaHistory in page.tsx
  isChatFolder?: boolean;
  inputPeer?: any; // MTProto InputPeer object for this chat
}

export interface GetChatsPaginatedResponse {
  folders: CloudFolder[]; // These are the main chat folders for the sidebar
  nextOffsetDate: number;
  nextOffsetId: number;
  nextOffsetPeer: any;
  hasMore: boolean;
}

export interface MediaHistoryResponse {
  files: CloudFile[];
  nextOffsetId?: number; // ID of the last message fetched, for next pagination
  hasMore: boolean;
}

export type DownloadStatus =
  | 'queued'
  | 'downloading'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'cdn_redirect' // Indicates that the item is waiting for CDN download path
  | 'refreshing_reference'; // Indicates that the item is waiting for file reference refresh

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
  cdnFileHashes?: any[];
}

export interface FileDownloadInfo {
    location: any;
    totalSize: number;
    mimeType: string;
}

// For upload.getFile and upload.getCdnFile responses
export interface FileChunkResponse {
  bytes?: Uint8Array;
  type?: string; // storage.FileType
  isCdnRedirect?: boolean;
  cdnRedirectData?: {
    dc_id: number;
    file_token: Uint8Array;
    encryption_key: Uint8Array;
    encryption_iv: Uint8Array;
    file_hashes: any[];
  };
  errorType?: 'FILE_REFERENCE_EXPIRED' | 'OTHER';
}
