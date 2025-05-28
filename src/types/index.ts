
export interface CloudFile {
  id: string;
  name: string;
  type: 'image' | 'video' | 'audio' | 'document' | 'unknown';
  size?: string;
  lastModified?: string;
  url?: string; // Optional URL for linking or viewing
  dataAiHint?: string;
}

export interface CloudFolder {
  id:string;
  name: string;
  folders: CloudFolder[];
  files: CloudFile[];
  isChatFolder?: boolean;
  // isOpen state will be managed internally by components or a global state manager if needed
}

export interface GetChatsPaginatedResponse {
  folders: CloudFolder[];
  nextOffsetDate: number;
  nextOffsetId: number;
  nextOffsetPeer: any; // Actual MTProto InputPeer type
  hasMore: boolean;
}
