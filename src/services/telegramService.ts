
'use client';

// This file now acts as a facade, re-exporting from the modularized services.
// This maintains a consistent import point for the rest of the application.

import { formatFileSize } from '@/lib/utils'; // Utility

// Core API and Auth
export { telegramApiInstance, sleep, CRITICAL_ERROR_MESSAGE_PREFIX } from './telegramAPI';
export {
  getUserSessionDetails,
  sendCode,
  signIn,
  checkPassword,
  signOut,
  isUserConnected,
} from './telegramAuth';

// Dialogs and Chat Lists
export {
  ALL_CHATS_FILTER_ID,
  getDialogFilters,
  getTelegramChats,
  updateDialogFiltersOrder,
  exportChatlistInvite,
  updateDialogFilter,
  transformDialogToCloudFolder, // Export if needed by UI directly, though hooks might encapsulate this
} from './telegramDialogs';

// File Operations (Media History, Download, Upload, Edit, Delete)
export {
  getChatMediaHistory,
  prepareFileDownloadInfo,
  downloadFileChunk,
  downloadCdnFileChunk,
  refreshFileReference,
  calculateSHA256,
  areUint8ArraysEqual,
  uploadFile,
  deleteTelegramMessages,
  editMessageCaption,
  TEN_MB,
  UPLOAD_PART_SIZE,
} from './telegramFiles';

// Cloud Channel & VFS Management & Channel Admin
export {
  CLOUDIFIER_APP_SIGNATURE_V1,
  IDENTIFICATION_MESSAGE_ID,
  CONFIG_MESSAGE_ID,
  IDENTIFICATION_MESSAGE_PREFIX,
  IDENTIFICATION_MESSAGE_SUFFIX,
  createManagedCloudChannel,
  fetchAndVerifyManagedCloudChannels,
  // getCloudChannelConfig, // Kept internal to telegramCloud.ts unless needed externally
  // updateCloudChannelConfig, // Kept internal
  addVirtualFolderToCloudChannel,
  removeVirtualFolderFromCloudChannel,
  ensureChannelInCloudFolder, // Export if direct manipulation is needed, e.g. after creation
  getChannelFullInfo,
  updateChannelAbout,
  checkChatUsername,
  updateChatUsername,
  exportChannelInviteLink,
  updateChannelPhotoService,
  // getChannelParticipantsList, // Placeholder for future
  // editChannelAdminRights, // Placeholder for future
} from './telegramCloud'; // Assuming admin functions are co-located or imported into telegramCloud

// Real-time Updates
export { initializeTelegramUpdateListener } from './telegramUpdates';

// Re-export formatFileSize from lib/utils if it was previously exported from here
export { formatFileSize };

