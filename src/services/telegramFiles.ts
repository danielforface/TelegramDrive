
'use client';

import { telegramApiInstance } from './telegramAPI';
import { isUserConnected } from './telegramAuth';
import type { CloudFile, MediaHistoryResponse, FileDownloadInfo, FileChunkResponse, DownloadQueueItemType, InputPeer, CdnRedirectDataType, AppFileHash as FileHash } from '@/types';
import { formatFileSize } from '@/lib/utils';
import cryptoSha256 from '@cryptography/sha256';

export const TEN_MB = 10 * 1024 * 1024;
export const UPLOAD_PART_SIZE = 512 * 1024; // 512KB
const IDENTIFICATION_MESSAGE_ID = 2; // Also used in telegramCloud.ts
const CONFIG_MESSAGE_ID = 3; // Also used in telegramCloud.ts

function generateRandomLong(): string {
  const buffer = new Uint8Array(8);
  crypto.getRandomValues(buffer);
  const view = new DataView(buffer.buffer);
  return view.getBigInt64(0, true).toString(); // Use BigInt64 for full 64-bit range
}

export async function getChatMediaHistory(
  inputPeer: InputPeer,
  limit: number,
  offsetId: number = 0,
  isCloudChannelFetch: boolean = false
): Promise<MediaHistoryResponse> {
  if (!(await isUserConnected())) {
    return { files: [], hasMore: false, nextOffsetId: offsetId, isCloudChannelFetch };
  }
  if (!inputPeer) {
    // console.warn("getChatMediaHistory called with no inputPeer");
    return { files: [], hasMore: false, nextOffsetId: offsetId, isCloudChannelFetch };
  }

  try {
    const historyResult = await telegramApiInstance.call('messages.getHistory', {
      peer: inputPeer,
      offset_id: offsetId,
      offset_date: 0,
      add_offset: 0,
      limit: limit,
      max_id: 0,
      min_id: 0,
      hash: 0,
    });

    const cloudFiles: CloudFile[] = [];
    let newOffsetIdResult: number = offsetId; // Default to current offset if no messages
    let hasMoreMessages = false;

    const messagesArray = historyResult.messages || [];

    if (messagesArray && messagesArray.length > 0) {
      messagesArray.forEach((msg: any) => {
        // Skip special messages in cloud channels unless specifically needed elsewhere
        if (isCloudChannelFetch && (msg.id === IDENTIFICATION_MESSAGE_ID || msg.id === CONFIG_MESSAGE_ID)) {
            return; 
        }

        const shouldProcessForCloud = isCloudChannelFetch && (msg.media || msg.message); // Cloud channels can have text "files" (captions as metadata)
        const shouldProcessForRegular = !isCloudChannelFetch && msg.media && (msg.media._ === 'messageMediaPhoto' || msg.media._ === 'messageMediaDocument');

        if (shouldProcessForCloud || shouldProcessForRegular) {
          let fileType: CloudFile['type'] = 'unknown';
          let fileName = `file_${msg.id}`;
          let fileSize: string | undefined;
          let dataAiHint: string | undefined;
          let totalSizeInBytes: number | undefined;
          let mediaObjectForFile: any = null; // Store the actual photo or document object

          // Try to get full media object from historyResult.photos or historyResult.documents
          if (msg.media?.photo && msg.media.photo.id) {
            mediaObjectForFile = historyResult.photos?.find((p:any) => String(p.id) === String(msg.media.photo.id)) || msg.media.photo;
          } else if (msg.media?.document && msg.media.document.id) {
            mediaObjectForFile = historyResult.documents?.find((d:any) => String(d.id) === String(msg.media.document.id)) || msg.media.document;
          } else if (msg.media?.photo) { // Fallback if not found in top-level arrays (should be rare)
             mediaObjectForFile = msg.media.photo;
          } else if (msg.media?.document) {
             mediaObjectForFile = msg.media.document;
          }


          if (msg.media?._ === 'messageMediaPhoto' && mediaObjectForFile) {
            fileType = 'image';
            fileName = `photo_${mediaObjectForFile.id?.toString() || msg.id}_${msg.date}.jpg`;
            const largestSize = mediaObjectForFile.sizes?.find((s:any) => s.type === 'y') || // 'y' is often the largest scaled
                                mediaObjectForFile.sizes?.sort((a:any,b:any) => (b.w*b.h) - (a.w*a.h))[0]; // Fallback: sort by dimensions
            if(largestSize?.size !== undefined) { // size is in bytes
              totalSizeInBytes = Number(largestSize.size);
              fileSize = formatFileSize(totalSizeInBytes);
            }
            dataAiHint = "photograph image";
          } else if (msg.media?._ === 'messageMediaDocument' && mediaObjectForFile) {
              fileName = mediaObjectForFile.attributes?.find((attr: any) => attr._ === 'documentAttributeFilename')?.file_name || `document_${mediaObjectForFile.id?.toString() || msg.id}`;
              if(mediaObjectForFile.size !== undefined) { // size is in bytes
                totalSizeInBytes = Number(mediaObjectForFile.size);
                fileSize = formatFileSize(totalSizeInBytes);
              }

              if (mediaObjectForFile.mime_type?.startsWith('image/')) {
                  fileType = 'image'; dataAiHint = "graphic image";
              } else if (mediaObjectForFile.mime_type?.startsWith('video/')) {
                  fileType = 'video'; dataAiHint = "video clip";
              } else if (mediaObjectForFile.mime_type?.startsWith('audio/')) {
                  fileType = 'audio'; dataAiHint = "audio recording";
              } else {
                  fileType = 'document'; dataAiHint = "document file";
              }
          } else if (isCloudChannelFetch && msg.message && !msg.media) {
            // This represents a "virtual" file or a text entry in a cloud channel, handle as needed
            fileName = `vfs_text_entry_${msg.id}`; // Or parse from caption if structured
            fileType = 'unknown'; // Or a specific type if caption indicates
            // size, dataAiHint would depend on how you model these
          }

          // Ensure we add to cloudFiles only if it's a relevant media type or a cloud channel message
          if ((isCloudChannelFetch && msg.message) || mediaObjectForFile) { // msg.message for VFS text files
             cloudFiles.push({
              id: String(msg.id), // Use message ID as unique file ID for this context
              messageId: msg.id,
              name: fileName,
              type: fileType,
              size: fileSize,
              totalSizeInBytes: totalSizeInBytes,
              timestamp: msg.date, // Unix timestamp (seconds)
              url: undefined, // Placeholder, to be populated if a preview/download URL is generated
              dataAiHint: dataAiHint, // Placeholder for AI hint
              telegramMessage: mediaObjectForFile || msg, // Store the full message or media object for details/downloads
              inputPeer: inputPeer, // Store the peer for context
              caption: msg.message, // Store caption, might contain VFS path
            });
          }
        }
      });

      if (messagesArray.length > 0) {
        newOffsetIdResult = messagesArray[messagesArray.length - 1].id; // Oldest message ID in this batch
      }

      // Determine if there are more messages
      if (historyResult._ === 'messages.messagesSlice' || historyResult._ === 'messages.channelMessages') {
        // messagesSlice has a `count` which is total messages in chat/channel for this filter
        // If `count` is present, we have more if `messagesArray.length < historyResult.count`
        // but also need `messagesArray.length >= limit` to confirm we didn't just get the last few.
        // A simpler heuristic: if we got `limit` messages, assume there might be more.
        hasMoreMessages = messagesArray.length >= limit && (historyResult.count ? messagesArray.length < historyResult.count : true);
      } else { // messages.messages (full history) or other types
        hasMoreMessages = false;
      }
    } else { // No messages returned
        hasMoreMessages = false;
    }
    return {
      files: cloudFiles,
      nextOffsetId: newOffsetIdResult,
      hasMore: hasMoreMessages,
      isCloudChannelFetch,
    };

  } catch (error:any) {
    // console.error("Error fetching chat media history:", error);
    throw error; // Re-throw for the hook to handle
  }
}

export async function prepareFileDownloadInfo(file: CloudFile): Promise<FileDownloadInfo | null> {
  if (!file.telegramMessage) {
    // console.warn("Cannot prepare download, telegramMessage missing from CloudFile:", file.name);
    return null;
  }

  const mediaObject = file.telegramMessage; // This should be the actual photo or document object
  let location: any = null;
  let totalSize: number = 0;
  let mimeType: string = 'application/octet-stream'; // Default MIME type

  // Handle cases where mediaObject might be nested (e.g., messageMediaPhoto contains a photo object)
  const actualMedia = mediaObject.media ? mediaObject.media : mediaObject;


  if (actualMedia && (actualMedia._ === 'photo' || actualMedia._ === 'messageMediaPhoto')) {
    const photoData = actualMedia.photo || actualMedia; // If actualMedia is messageMediaPhoto, photoData is actualMedia.photo
    if (photoData.id && photoData.access_hash && photoData.file_reference) {
      const largestSize = photoData.sizes?.find((s: any) => s.type === 'y') || // 'y' is often a large one
                          photoData.sizes?.sort((a: any, b: any) => (b.w * b.h) - (a.w * a.h))[0]; // Fallback: sort by pixel area
      if (largestSize) {
        location = {
          _: 'inputPhotoFileLocation',
          id: photoData.id,
          access_hash: photoData.access_hash,
          file_reference: photoData.file_reference,
          thumb_size: largestSize.type || '', // Request the specific size type
        };
        totalSize = Number(largestSize.size) || file.totalSizeInBytes || 0;
        mimeType = 'image/jpeg'; // Common for photos, adjust if more types are handled
      }
    }
  }
  // Handle documents (videos, audio, general files)
  else if (actualMedia && (actualMedia._ === 'document' || actualMedia._ === 'messageMediaDocument')) {
    const documentData = actualMedia.document || actualMedia;
    if (documentData.id && documentData.access_hash && documentData.file_reference) {
      location = {
        _: 'inputDocumentFileLocation',
        id: documentData.id,
        access_hash: documentData.access_hash,
        file_reference: documentData.file_reference,
        thumb_size: '', // Documents don't use thumb_size in this context
      };
      totalSize = Number(documentData.size) || file.totalSizeInBytes || 0;
      mimeType = documentData.mime_type || 'application/octet-stream';
    }
  }


  if (location && totalSize > 0) {
    return { location, totalSize, mimeType };
  } else {
    // console.warn("Failed to create location or determine size for download:", file.name, "Media Object:", actualMedia);
    return null;
  }
}

export async function downloadFileChunk(
    location: any,
    offset: number,
    limit: number,
    signal?: AbortSignal
): Promise<FileChunkResponse> {
  if (!location) {
    // console.error("downloadFileChunk called with no location.");
    return { errorType: 'OTHER' as const };
  }

  try {
    const result = await telegramApiInstance.call('upload.getFile', {
      location: location,
      offset: offset,
      limit: limit,
      precise: true, // Request precise offset and limit
      cdn_supported: true // Indicate CDN support
    }, { signal });

    if (!result || typeof result !== 'object' || (Object.keys(result).length === 0 && result.constructor === Object)) {
        // console.warn("Unexpected empty or invalid response from upload.getFile:", result);
        return { errorType: 'OTHER' as const };
    }

    if (result._ === 'upload.fileCdnRedirect') {
      // console.log("CDN Redirect received:", result);
      const cdnRedirectData: CdnRedirectDataType = {
          dc_id: result.dc_id,
          file_token: result.file_token,
          encryption_key: result.encryption_key,
          encryption_iv: result.encryption_iv,
          file_hashes: (result.file_hashes || []).map((fh: any) => ({
            offset: Number(fh.offset), // Ensure offset is number
            limit: fh.limit,
            hash: fh.hash,
          })) as FileHash[],
        };
      return {
        isCdnRedirect: true,
        cdnRedirectData: cdnRedirectData
      };
    }

    if (result._ === 'upload.file' && result.bytes) {
      return { bytes: result.bytes, type: result.type?._ || 'storage.fileUnknown' };
    }
    // console.warn("Unexpected response type from upload.getFile:", result._);
    return { errorType: 'OTHER' as const };
  } catch (error: any) {
    if (error.name === 'AbortError' || (error.message && error.message.toLowerCase().includes('aborted'))) {
      // console.log("Download chunk aborted by signal.");
      return { errorType: 'OTHER' as const }; // Or a specific 'ABORTED' type
    }
    const errorMessage = error.message || error.originalErrorObject?.error_message;
    if (errorMessage?.includes('FILE_REFERENCE_EXPIRED') || errorMessage?.includes('FILE_ID_INVALID') || errorMessage?.includes('LOCATION_INVALID')) {
      // console.warn("File reference expired or invalid for download chunk.");
      return { errorType: 'FILE_REFERENCE_EXPIRED' as const };
    }
    // console.error("Error downloading file chunk:", error);
    return { errorType: 'OTHER' as const };
  }
}

export async function downloadCdnFileChunk(
  cdnRedirectData: NonNullable<FileChunkResponse['cdnRedirectData']>,
  offset: number,
  limit: number,
  signal?: AbortSignal
): Promise<FileChunkResponse> {
  try {
    const result = await telegramApiInstance.call('upload.getCdnFile', {
      file_token: cdnRedirectData.file_token,
      offset: offset,
      limit: limit,
    }, { dcId: cdnRedirectData.dc_id, signal }); // Ensure request goes to the CDN DC

    if (!result || typeof result !== 'object' || (Object.keys(result).length === 0 && result.constructor === Object) ) {
        // console.warn("Unexpected empty or invalid response from upload.getCdnFile:", result);
        return { errorType: 'OTHER' as const };
    }

    if (result._ === 'upload.cdnFile' && result.bytes) {
      return { bytes: result.bytes, type: 'application/octet-stream' }; // CDN files don't have rich type info
    }
    // console.warn("Unexpected response type from upload.getCdnFile:", result._);
    return { errorType: 'OTHER' as const };
  } catch (error: any)
   {
    if (error.name === 'AbortError' || (error.message && error.message.toLowerCase().includes('aborted'))) {
      // console.log("CDN Download chunk aborted by signal.");
      return { errorType: 'OTHER' as const };
    }
    // console.error("Error downloading CDN file chunk:", error);
    return { errorType: 'OTHER' as const };
  }
}

export async function refreshFileReference(item: DownloadQueueItemType): Promise<any | null> {
  if (!item.telegramMessage || !item.messageId || !item.inputPeer) {
      // console.warn("Cannot refresh file reference: item is missing critical info.", item.name);
      return null;
  }

  try {
    let messagesResult;
    // Use channels.getMessages for channels, messages.getMessages for other peer types
    if (item.inputPeer._ === 'inputPeerChannel') {
        messagesResult = await telegramApiInstance.call('channels.getMessages', {
            channel: item.inputPeer,
            id: [{ _: 'inputMessageID', id: item.messageId }],
        });
    } else {
        messagesResult = await telegramApiInstance.call('messages.getMessages', {
            id: [{ _: 'inputMessageID', id: item.messageId }],
        });
    }


    let foundMessage = null;
    if (messagesResult.messages && Array.isArray(messagesResult.messages)) {
        foundMessage = messagesResult.messages.find((m: any) => String(m.id) === String(item.messageId));
    }

    const updatedMessage = foundMessage; // The message object itself

    if (updatedMessage?.media) {
      let newFileReference = null;
      let updatedMediaObject = null; // This will be the photo or document object

      // Extract the actual media object (photo or document)
      if (updatedMessage.media.photo && updatedMessage.media.photo.id) {
        // Try to find the full photo object in the 'photos' array from the response
        updatedMediaObject = messagesResult.photos?.find((p:any) => String(p.id) === String(updatedMessage.media.photo.id)) || updatedMessage.media.photo;
        newFileReference = updatedMediaObject?.file_reference;
      } else if (updatedMessage.media.document && updatedMessage.media.document.id) {
        updatedMediaObject = messagesResult.documents?.find((d:any) => String(d.id) === String(updatedMessage.media.document.id)) || updatedMessage.media.document;
        newFileReference = updatedMediaObject?.file_reference;
      } else if (updatedMessage.media.photo) { // Fallback if not in top-level arrays
         updatedMediaObject = updatedMessage.media.photo;
         newFileReference = updatedMediaObject?.file_reference;
      } else if (updatedMessage.media.document) {
         updatedMediaObject = updatedMessage.media.document;
         newFileReference = updatedMediaObject?.file_reference;
      }


      if (newFileReference && updatedMediaObject) {
        // MTProto expects file_reference to be Uint8Array. If it's not, there's an issue upstream or API change.
        if (typeof newFileReference === 'object' && !(newFileReference instanceof Uint8Array)) {
          // console.warn("File reference is not Uint8Array:", newFileReference, "for item:", item.name);
          // Potentially try to convert if it's an array-like object, or handle error
        }
        return updatedMediaObject; // Return the full media object with the new reference
      }
    }
  } catch (error: any) {
    // console.error("Error refreshing file reference for item:", item.name, error);
  }
  return null;
}

export async function calculateSHA256(data: Uint8Array): Promise<Uint8Array> {
  try {
    const hash = cryptoSha256(data); // Directly returns Uint8Array
    return Promise.resolve(hash);
  } catch (error) {
    // console.error("SHA256 calculation failed:", error);
    throw new Error("SHA256 calculation failed");
  }
}

export function areUint8ArraysEqual(arr1?: Uint8Array, arr2?: Uint8Array): boolean {
  if (!arr1 || !arr2 || arr1.length !== arr2.length) {
    return false;
  }
  for (let i = 0; i < arr1.length; i++) {
    if (arr1[i] !== arr2[i]) {
      return false;
    }
  }
  return true;
}

export async function uploadFile(
  inputPeer: InputPeer,
  fileToUpload: File,
  onProgress: (percent: number) => void,
  signal?: AbortSignal,
  caption?: string
): Promise<any> {
  const client_file_id_str = generateRandomLong(); // Used for client-side tracking of parts
  const isBigFile = fileToUpload.size > TEN_MB;
  const totalChunks = Math.ceil(fileToUpload.size / UPLOAD_PART_SIZE);

  onProgress(0); // Initial progress

  for (let i = 0; i < totalChunks; i++) {
    if (signal?.aborted) {
      throw new Error('Upload aborted by user.');
    }

    const offset = i * UPLOAD_PART_SIZE;
    const chunkBlob = fileToUpload.slice(offset, offset + UPLOAD_PART_SIZE);
    // Convert Blob to ArrayBuffer, then to Uint8Array
    const chunkBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(chunkBlob);
    });
    const chunkBytes = new Uint8Array(chunkBuffer);

    try {
      let partUploadResult;
      if (isBigFile) {
        partUploadResult = await telegramApiInstance.call('upload.saveBigFilePart', {
          file_id: client_file_id_str, // This is a string representation of a long
          file_part: i,
          file_total_parts: totalChunks,
          bytes: chunkBytes,
        }, { signal });
      } else {
        partUploadResult = await telegramApiInstance.call('upload.saveFilePart', {
          file_id: client_file_id_str, // This is a string representation of a long
          file_part: i,
          bytes: chunkBytes,
        }, { signal });
      }

      if (partUploadResult?._ !== 'boolTrue' && partUploadResult !== true) { // Check for boolean true or { _: 'boolTrue' }
          // console.error("Failed to save file part:", i, "Response:", partUploadResult);
          throw new Error(`Failed to save file part ${i}. Server response: ${JSON.stringify(partUploadResult)}`);
      }
      // Update progress: 90% is for upload, 5% for preparing media, 5% for sending
      const progressPercent = Math.round(((i + 1) / totalChunks) * 90); 
      onProgress(progressPercent);
    } catch (error: any) {
      // console.error(`Error uploading part ${i}:`, error);
      throw error; // Re-throw to be caught by the caller
    }
  }

  onProgress(95); // Progress after all parts are uploaded
  const inputFilePayload = isBigFile
    ? { _: 'inputFileBig', id: client_file_id_str, parts: totalChunks, name: fileToUpload.name }
    : { _: 'inputFile', id: client_file_id_str, parts: totalChunks, name: fileToUpload.name, md5_checksum: '' /* MD5 not strictly needed for small files by modern clients */ };

  try {
    const result = await telegramApiInstance.call('messages.sendMedia', {
      peer: inputPeer,
      media: {
        _: 'inputMediaUploadedDocument',
        nosound_video: false, // Adjust if sending video specifically
        force_file: false, // Let Telegram decide best representation, or true to force as file
        spoiler: false, // No spoiler by default
        file: inputFilePayload,
        mime_type: fileToUpload.type || 'application/octet-stream',
        attributes: [
          { _: 'documentAttributeFilename', file_name: fileToUpload.name },
          // Add other attributes if needed, e.g., for video duration, audio performer, etc.
        ],
        // thumb: InputFile, // Optional: for custom thumbnail
      },
      message: caption || '', // Caption for the media
      random_id: generateRandomLong(), // Unique random ID for the message
      // schedule_date, reply_to_msg_id, etc. can be added here
    }, { signal });
    onProgress(100);
    return result;
  } catch (error: any) {
    // console.error("Error sending media:", error);
    throw error;
  }
}

export async function deleteTelegramMessages(inputPeer: InputPeer, messageIds: number[]): Promise<boolean> {
  if (!inputPeer || messageIds.length === 0) return false;
  try {
    // For channels, it's better to use channels.deleteMessages if applicable,
    // but messages.deleteMessages also works for channels if the user has rights.
    const result = await telegramApiInstance.call('messages.deleteMessages', {
      id: messageIds,
      revoke: true, // Attempt to delete for everyone
    });
    // Successful deletion returns an messages.AffectedMessages object
    return result && (Array.isArray(result) || result._ === 'messages.affectedMessages');
  } catch (error: any) {
    // console.error("Error deleting messages:", error);
    throw error;
  }
}

export async function editMessageCaption(
  inputPeer: InputPeer,
  messageId: number,
  newCaption: string
): Promise<boolean> {
  if (!inputPeer) {
    throw new Error("InputPeer is required to edit message caption.");
  }
  try {
    const result = await telegramApiInstance.call('messages.editMessage', {
      peer: inputPeer,
      id: messageId,
      message: newCaption,
      no_webpage: true, // Typically true for VFS captions
    });
    return !!result; // Successful edit usually returns an Updates object
  } catch (error: any) {
    // console.error("Error editing message caption:", error);
    throw error;
  }
}
