
export interface CloudFile {
  id: string;
  name: string;
  type: 'image' | 'video' | 'audio' | 'document' | 'unknown';
  size?: string;
  timestamp: number; // Unix timestamp (seconds)
  url?: string;
  dataAiHint?: string;
  messageId: number; // Original message ID from Telegram
  telegramMessage?: any; // The raw Telegram message object or media object
  totalSizeInBytes?: number;
  inputPeer?: any; // InputPeer for the chat this file belongs to
}

export interface CloudFolder { // Represents a chat
  id: string; // Usually derived from peer ID
  name: string;
  folders: CloudFolder[];
  files: CloudFile[];
  isChatFolder?: boolean;
  inputPeer?: any; // Actual InputPeer object for API calls
}

export interface GetChatsPaginatedResponse {
  folders: CloudFolder[]; // These are the chats
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
  progress: number;
  downloadedBytes: number;
  location?: any; // InputFileLocation
  chunks?: Uint8Array[];
  currentOffset: number;
  abortController?: AbortController;
  cdnDcId?: number;
  cdnFileToken?: Uint8Array;
  cdnEncryptionKey?: Uint8Array;
  cdnEncryptionIv?: Uint8Array;
  cdnFileHashes?: FileHash[];
  cdnCurrentFileHashIndex?: number;
  error_message?: string;
}

export interface FileDownloadInfo {
    location: any; // InputFileLocation
    totalSize: number;
    mimeType: string;
}

// For Telegram API's DialogFilter (Folder) structure
export interface InputPeer { // Simplified for now, expand as needed
    _: string; // e.g., 'inputPeerUser', 'inputPeerChat', 'inputPeerChannel'
    user_id?: string | number; // string due to BigInt potential
    chat_id?: string | number;
    channel_id?: string | number;
    access_hash?: string;
}

export interface DialogFilter {
    _: 'dialogFilter' | 'dialogFilterChatlist' | 'dialogFilterDefault';
    flags: number;
    id: number;
    title: string;
    emoticon?: string; // flags.25
    color?: number;    // flags.27
    pinned_peers?: InputPeer[];
    include_peers: InputPeer[]; // This is crucial for the filter logic
    exclude_peers?: InputPeer[];

    // Specific to dialogFilter
    contacts?: boolean;          // flags.0
    non_contacts?: boolean;      // flags.1
    groups?: boolean;            // flags.2
    broadcasts?: boolean;        // flags.3
    bots?: boolean;              // flags.4
    exclude_muted?: boolean;     // flags.11
    exclude_read?: boolean;      // flags.12
    exclude_archived?: boolean;  // flags.13

    // Specific to dialogFilterChatlist
    has_my_invites?: boolean;   // flags.26

    // Client-side UI state additions
    isReordering?: boolean; // For drag-and-drop UI
    isLoading?: boolean; // e.g. for when fetching share link
    inviteLink?: string; // Store fetched invite link
}

export interface MessagesDialogFilters {
    _: 'messages.dialogFilters';
    flags: number;
    tags_enabled?: boolean; // flags.0
    filters: DialogFilter[];
}


// For file uploads
export interface ExtendedFile {
  id: string; // Unique client-side ID for this upload instance
  originalFile: File; // The actual File object
  name: string;
  size: number;
  type: string;
  lastModified: number;
  uploadProgress?: number;
  uploadStatus?: 'pending' | 'uploading' | 'processing' | 'completed' | 'failed' | 'cancelled';
}


// For FileChunkResponse
type SuccessfulFileChunk_Bytes = {
  bytes: Uint8Array;
  type: string; // e.g. 'storage.fileJpeg'
  isCdnRedirect?: never;
  cdnRedirectData?: never;
  errorType?: never;
};

type CdnRedirectDataType = {
    dc_id: number;
    file_token: Uint8Array;
    encryption_key: Uint8Array;
    encryption_iv: Uint8Array;
    file_hashes: AppFileHash[];
};

type SuccessfulFileChunk_CdnRedirect = {
  bytes?: never;
  type?: never;
  isCdnRedirect: true;
  cdnRedirectData: CdnRedirectDataType;
  errorType?: never;
};

type ErrorFileChunk = {
  bytes?: never;
  type?: never;
  isCdnRedirect?: never;
  cdnRedirectData?: never;
  errorType: 'FILE_REFERENCE_EXPIRED' | 'OTHER'; // Expand with more specific error types if needed
};

export type FileChunkResponse = SuccessfulFileChunk_Bytes | SuccessfulFileChunk_CdnRedirect | ErrorFileChunk;
export type { FileHash as AppFileHash }; // Re-export if AppFileHash is same as FileHash
