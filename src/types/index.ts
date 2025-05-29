

export interface CloudFile {
  id: string; 
  name: string;
  type: 'image' | 'video' | 'audio' | 'document' | 'unknown';
  size?: string; 
  timestamp: number; 
  url?: string; 
  dataAiHint?: string;
  messageId: number; 
  telegramMessage?: any; 
  totalSizeInBytes?: number; 
  inputPeer?: any; 
}

export interface CloudFolder { 
  id: string; 
  name: string; 
  folders: CloudFolder[]; 
  files: CloudFile[];    
  isChatFolder?: boolean;
  inputPeer?: any; 
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
  progress: number; 
  downloadedBytes: number;
  location?: any; 
  chunks?: Uint8Array[];
  currentOffset: number;
  abortController?: AbortController;
  totalSizeInBytes: number; 
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


type SuccessfulFileChunk_Bytes = {
  bytes: Uint8Array;
  type: string; 
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
    file_hashes: AppFileHash[]; // Changed from any[] to AppFileHash[]
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

// For file uploads, to track progress in UI if needed
export interface ExtendedFile extends File {
  uploadProgress?: number;
  uploadStatus?: 'pending' | 'uploading' | 'completed' | 'failed' | 'cancelled';
}


    