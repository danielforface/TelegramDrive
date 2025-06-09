

export interface CloudFile {
  id: string;
  name: string;
  type: 'image' | 'video' | 'audio' | 'document' | 'unknown';
  size?: string;
  timestamp: number; // Unix timestamp (seconds)
  url?: string;
  dataAiHint?: string;
  messageId: number;
  telegramMessage?: any; // Store the original Telegram message object for details or re-fetching
  totalSizeInBytes?: number;
  inputPeer?: InputPeer; // Peer of the chat where this file/message exists
  caption?: string; // Caption from Telegram message, may contain VFS path or regular text
  vfsPath?: string; // Derived VFS path for easier filtering (populated by UI if needed)
}

export interface CloudFolder {
  id: string; // e.g., "chat-12345", "channel-67890", or virtual folder name if part of VFS
  name: string;
  folders: CloudFolder[]; // For UI representation if needed, primary truth is cloudConfig for VFS
  files: CloudFile[];   // For UI representation if needed, primary truth is file messages
  isChatFolder?: boolean; // True if this represents a direct Telegram chat/channel dialog
  inputPeer?: InputPeer;  // MTProto InputPeer object for API calls
  isAppManagedCloud?: boolean; // True if this is a Cloudifier-managed channel
  cloudConfig?: CloudChannelConfigV1 | null; // VFS configuration if it's an app-managed cloud
  vfsPath?: string; // Virtual path for this folder in UI representation (primarily for virtual folders from config)
  fullChannelInfo?: FullChat; // Full chat object from Telegram, populated when managing
}

export interface GetChatsPaginatedResponse {
  folders: CloudFolder[];
  nextOffsetDate: number;
  nextOffsetId: number;
  nextOffsetPeer: any; // MTProto InputPeer type or similar for pagination offset
  hasMore: boolean;
}

export interface MediaHistoryResponse {
  files: CloudFile[];
  nextOffsetId?: number; // The ID of the last message fetched, for pagination
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
  | 'cdn_redirect' // Intermediate status if download shifts to CDN
  | 'refreshing_reference'; // Intermediate status if file reference needs update

export interface AppFileHash { // Renamed from FileHash to avoid conflict with native File
  offset: number;
  limit: number;
  hash: Uint8Array;
}

export interface DownloadQueueItemType extends CloudFile {
  status: DownloadStatus;
  progress: number; // Percentage 0-100
  downloadedBytes: number;
  location?: any; // MTProto InputFileLocation
  chunks?: Uint8Array[]; // Store downloaded chunks before assembling
  currentOffset: number; // For resumable downloads, tracks current byte offset
  abortController?: AbortController; // To cancel the download
  // CDN specific fields
  cdnDcId?: number;
  cdnFileToken?: Uint8Array;
  cdnEncryptionKey?: Uint8Array;
  cdnEncryptionIv?: Uint8Array;
  cdnFileHashes?: AppFileHash[];
  cdnCurrentFileHashIndex?: number;
  error_message?: string; // Store error message if download fails
}

export interface FileDownloadInfo {
    location: any; // MTProto InputFileLocation
    totalSize: number; // Total size in bytes
    mimeType: string;
}

// Based on MTProto InputPeer types
export interface InputPeer {
    _: string; // e.g., 'inputPeerUser', 'inputPeerChat', 'inputPeerChannel', 'inputPeerEmpty', 'inputPeerSelf'
    user_id?: string | number;
    chat_id?: string | number;
    channel_id?: string | number;
    access_hash?: string; // Often required for users and channels
}

// Based on MTProto DialogFilter type
export interface DialogFilter {
    _: 'dialogFilter' | 'dialogFilterChatlist' | 'dialogFilterDefault';
    flags: number;
    id: number;
    title: string;
    emoticon?: string;
    color?: number; // TDLib color index or similar
    pinned_peers?: InputPeer[];
    include_peers: InputPeer[]; // Peers explicitly included
    exclude_peers?: InputPeer[]; // Peers explicitly excluded

    // Flags represented as booleans for easier use
    contacts?: boolean;
    non_contacts?: boolean;
    groups?: boolean;
    broadcasts?: boolean;
    bots?: boolean;
    exclude_muted?: boolean;
    exclude_read?: boolean;
    exclude_archived?: boolean;

    has_my_invites?: boolean; // If the folder has pending invites created by the user

    // UI-specific state, not from Telegram API directly
    isReordering?: boolean; // If this filter is currently being reordered in UI
    isLoading?: boolean;    // If details/invitelink for this filter are loading
    inviteLink?: string;  // Invite link if generated
}

// Based on MTProto messages.DialogFilters
export interface MessagesDialogFilters {
    _: 'messages.dialogFilters';
    flags: number;
    tags_enabled?: boolean; // If folder tags are enabled
    filters: DialogFilter[];
}


// For file uploads
export interface ExtendedFile {
  id: string; // Unique ID for UI tracking (e.g., generated from name+timestamp)
  originalFile: File; // The native File object
  name: string;
  size: number;
  type: string;
  lastModified: number;
  uploadProgress: number; // 0-100
  uploadStatus: 'pending' | 'uploading' | 'processing' | 'completed' | 'failed' | 'cancelled';
}


// For downloadFileChunk response
type SuccessfulFileChunk_Bytes = {
  bytes: Uint8Array;
  type: string; // e.g., 'storage.fileJpeg', 'storage.fileMp4', etc.
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
  errorType: 'FILE_REFERENCE_EXPIRED' | 'OTHER'; // Specific error types
};

export type FileChunkResponse = SuccessfulFileChunk_Bytes | SuccessfulFileChunk_CdnRedirect | ErrorFileChunk;

// Configuration for app-managed cloud channels (VFS)
export interface CloudChannelConfigEntry {
  type: 'file' | 'folder'; // 'file' entries are not directly stored in config but helps model structure
  name: string; // Original name, path is derived from structure
  created_at: string; // ISO timestamp for the entry
  modified_at: string; // ISO timestamp for the entry
  entries?: { [name: string]: CloudChannelConfigEntry }; // For folders, maps entry name to entry object
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


// For Custom Context Menu
export interface MenuItemType {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  icon?: React.ReactNode;
  isSeparator?: boolean;
  className?: string; // For specific styling like destructive actions
}

// For Clipboard operations
export type ClipboardItemType =
  | { type: 'file'; file: CloudFile; originalPath: string | null; parentInputPeer?: InputPeer | null }
  | { type: 'folder'; folderName: string; folderConfig: CloudChannelConfigEntry; originalPath: string; parentInputPeer?: InputPeer | null }
  | null;

// For User Session in telegramAuth.ts
export interface UserSessionType {
  phone?: string;
  phone_code_hash?: string;
  user?: any; // Telegram User object
  srp_id?: string; // String representation of BigInteger
  srp_params?: {
    g: number;
    p: Uint8Array;
    salt1: Uint8Array;
    salt2: Uint8Array;
    srp_B: Uint8Array; // From account.getPassword
  };
}

// For Channel Management
// Represents a chatFull object from Telegram API, simplified
export interface FullChat {
  _: string; // e.g., 'chatFull', 'channelFull'
  id: number | string;
  about?: string;
  participants_count?: number;
  admins_count?: number;
  kicked_count?: number;
  banned_count?: number;
  online_count?: number;
  read_inbox_max_id?: number;
  read_outbox_max_id?: number;
  unread_count?: number;
  chat_photo?: any; // Photo type
  notify_settings?: any; // PeerNotifySettings type
  exported_invite?: any; // ExportedChatInvite type
  bot_info?: any[]; // BotInfo type array
  migrated_from_chat_id?: number | string;
  migrated_from_max_id?: number;
  pinned_msg_id?: number;
  stickerset?: any; // StickerSet type
  available_min_id?: number;
  folder_id?: number;
  call?: any; // InputGroupCall type
  ttl_period?: number;
  grouped_messages?: any; // messages.ChatFull type specific field
  theme_emoticon?: string;
  requests_pending?: number;
  recent_requesters?: (number | string)[];
  // Channel specific fields
  linked_chat_id?: number | string;
  location?: any; // ChannelLocation type
  slowmode_seconds?: number;
  slowmode_next_send_date?: number;
  stats_dc?: number;
  pts?: number;
  can_view_participants?: boolean;
  can_set_username?: boolean;
  can_set_stickers?: boolean;
  hidden_prehistory?: boolean;
  can_set_location?: boolean;
  has_scheduled?: boolean;
  can_view_stats?: boolean;
  blocked?: boolean;
  participants?: any; // ChatParticipants type
  [key: string]: any; // For other potential fields
}

export interface ChannelParticipant {
  _: string; // e.g. 'channelParticipant', 'channelParticipantAdmin', 'channelParticipantCreator'
  user_id: number | string;
  date: number; // Timestamp when user joined/was last updated
  inviter_id?: number | string; // If invited
  kicked_by?: number | string;
  banned_by?: number | string;
  rank?: string; // For admins/owner
  // Admin specific
  is_owner?: boolean;
  can_edit?: boolean;
  self?: boolean; // If this participant is the current user
  admin_rights?: any; // Type ChatAdminRights
  banned_rights?: any; // Type ChatBannedRights
  // User object might be embedded or fetched separately
  user?: any; // Telegram User object
}

export interface ChannelParticipantsResponse {
  count: number;
  participants: ChannelParticipant[];
  users: any[]; // Array of User objects related to participants
  chats?: any[]; // Array of Chat objects if relevant (e.g. bot participants)
  next_offset?: string; // For pagination with getParticipants using filter
}

export interface UpdatedChannelPhoto {
  photo: any; // Photo type from MTProto
  date: number;
}

// Configuration for Global Drive custom organization
export interface GlobalDriveConfigV1 {
  app_signature: "GLOBAL_DRIVE_CONFIG_V1.0";
  version: 1;
  root_entries: {
    [folderName: string]: GlobalDriveFolderEntry;
  };
  // Future: rules for auto-sorting files, file references, etc.
}

export interface GlobalDriveFolderEntry {
  type: 'folder';
  name: string; // Name of the folder
  created_at: string; // ISO timestamp
  modified_at: string; // ISO timestamp
  entries?: { // Sub-folders
    [subFolderName: string]: GlobalDriveFolderEntry;
  };
  // Potentially: file_references?: string[]; // Array of CloudFile IDs
  // Potentially: rules?: any[]; // Rules for auto-assigning files to this folder
}

export type OrganizationMode = 'default' | 'custom';

