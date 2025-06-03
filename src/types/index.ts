
export interface CloudFile {
  id: string;
  name: string;
  type: 'image' | 'video' | 'audio' | 'document' | 'unknown';
  size?: string;
  timestamp: number; // Unix timestamp (seconds)
  url?: string;
  dataAiHint?: string;
  messageId: number;
  telegramMessage?: any;
  totalSizeInBytes?: number;
  inputPeer?: any;
  caption?: string; // Caption from Telegram message, may contain VFS path or regular text
  vfsPath?: string; // Derived VFS path for easier filtering (populated by UI if needed)
}

export interface CloudFolder {
  id: string;
  name: string;
  folders: CloudFolder[]; // For UI representation if needed, primary truth is cloudConfig
  files: CloudFile[];   // For UI representation if needed, primary truth is file messages
  isChatFolder?: boolean;
  inputPeer?: any;
  isAppManagedCloud?: boolean;
  cloudConfig?: CloudChannelConfigV1 | null; // Allow null for loading/error states
  vfsPath?: string; // Virtual path for this folder in UI representation (primarily for virtual folders from config)
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
  isCloudChannelFetch?: boolean; // Hint for processing in page.tsx
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
  location?: any;
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
    location: any;
    totalSize: number;
    mimeType: string;
}

export interface InputPeer {
    _: string;
    user_id?: string | number;
    chat_id?: string | number;
    channel_id?: string | number;
    access_hash?: string;
}

export interface DialogFilter {
    _: 'dialogFilter' | 'dialogFilterChatlist' | 'dialogFilterDefault';
    flags: number;
    id: number;
    title: string;
    emoticon?: string;
    color?: number;
    pinned_peers?: InputPeer[];
    include_peers: InputPeer[];
    exclude_peers?: InputPeer[];

    contacts?: boolean;
    non_contacts?: boolean;
    groups?: boolean;
    broadcasts?: boolean;
    bots?: boolean;
    exclude_muted?: boolean;
    exclude_read?: boolean;
    exclude_archived?: boolean;

    has_my_invites?: boolean;

    isReordering?: boolean;
    isLoading?: boolean;
    inviteLink?: string;
}

export interface MessagesDialogFilters {
    _: 'messages.dialogFilters';
    flags: number;
    tags_enabled?: boolean;
    filters: DialogFilter[];
}


export interface ExtendedFile {
  id: string;
  originalFile: File;
  name: string;
  size: number;
  type: string;
  lastModified: number;
  uploadProgress: number;
  uploadStatus: 'pending' | 'uploading' | 'processing' | 'completed' | 'failed' | 'cancelled';
}


type SuccessfulFileChunk_Bytes = {
  bytes: Uint8Array;
  type: string;
  isCdnRedirect?: never;
  cdnRedirectData?: never;
  errorType?: never;
};

export type CdnRedirectDataType = {
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
  errorType: 'FILE_REFERENCE_EXPIRED' | 'OTHER';
};

export type FileChunkResponse = SuccessfulFileChunk_Bytes | SuccessfulFileChunk_CdnRedirect | ErrorFileChunk;
export type { FileHash as AppFileHash };

// Configuration for app-managed cloud channels
export interface CloudChannelConfigEntry {
  type: 'file' | 'folder'; // 'file' entries are not directly stored in config, but helps model structure
  name: string; // Original name, path is derived from structure
  // For files, details are in the message itself + caption, not typically duplicated in config
  created_at: string; // ISO timestamp for the entry
  modified_at: string; // ISO timestamp for the entry
  entries?: { [name: string]: CloudChannelConfigEntry }; // For folders
}

export interface CloudChannelConfigV1 {
  app_signature: string; // e.g., "TELEGRAM_CLOUDIFIER_V1.0"
  channel_title_at_creation: string;
  created_timestamp_utc: string; // ISO timestamp for the channel creation by app
  last_updated_timestamp_utc: string; // ISO timestamp for last config update
  root_entries: { // Represents the root "/"
    [name: string]: CloudChannelConfigEntry; // Key is folder/file name
  };
}

export type CloudChannelType = 'channel' | 'supergroup';
