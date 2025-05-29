
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

export type DownloadStatus = 'queued' | 'downloading' | 'paused' | 'completed' | 'failed' | 'cancelled';

export interface DownloadQueueItemType extends CloudFile {
  status: DownloadStatus;
  progress: number; // 0-100
  downloadedBytes?: number;
  location?: any; // To store InputFileLocation
  chunks?: Uint8Array[]; // To store downloaded chunks
  currentOffset?: number;
  abortController?: AbortController;
}
