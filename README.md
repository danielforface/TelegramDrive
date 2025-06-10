
# Telegram Cloudifier

**Transform your Telegram chats and cloud storage into an intuitive, organized, and powerful file management experience.**

Telegram Cloudifier is a web application built with Next.js that leverages the Telegram API (via MTProto) to provide a "cloud-like" interface for your Telegram media. It allows you to browse chats, view media, manage downloads, and even create dedicated "Cloud Storage Channels" with a Virtual File System (VFS). Additionally, a "Global Drive" feature offers a unified view of media across all your accessible chats, with options for default chronological organization or a fully custom folder structure defined by you.

## Core Features

*   **Secure Telegram Connection**: Connects directly to your Telegram account using the official MTProto library via client-side API calls. Your credentials are handled by the MTProto library and are not stored by any intermediary server.
*   **Chat & Folder Browsing**:
    *   View chats based on Telegram's native folder (Dialog Filter) structure.
    *   Browse individual chats and channels.
*   **Media Viewing & Management**:
    *   Inline image viewer.
    *   Inline video player (streams content).
    *   View file details, including some Telegram-specific metadata.
    *   Download files with a download manager (supports pause/resume for direct downloads).
*   **App-Managed Cloud Storage Channels (VFS)**:
    *   Create dedicated private Telegram channels or supergroups to act as personal cloud storage.
    *   **Virtual File System (VFS)**: Organize files within these cloud channels using a virtual folder structure. This structure is stored in a special configuration message within the channel itself.
    *   Create, navigate, and (soon) delete virtual folders.
    *   Upload files directly into the VFS structure within your cloud channels. File paths are stored in message captions.
    *   (Planned) Move files between virtual folders by editing their VFS path in captions.
*   **Global Drive**:
    *   **Unified Media View**: Access media from *all* your accessible chats in one place.
    *   **Default Organization**: Initially, media is shown chronologically. Filters for media type (images, videos, documents, music) and date are available.
    *   **Custom Organization**: Define your own virtual folder structure for the Global Drive. This structure is defined in a JSON configuration file (`telegram_cloudifier_global_drive_config_v1.json`) that you store in your "Saved Messages" chat on Telegram. The app will read this file to render your custom drive.
*   **Download Manager**: Queue multiple file downloads, with basic controls like cancel, pause, and resume for direct Telegram downloads.
*   **Responsive UI**: Designed to be usable on various screen sizes.

## Technology Stack

*   **Frontend**:
    *   Next.js (App Router)
    *   React
    *   TypeScript
*   **Styling**:
    *   Tailwind CSS
    *   ShadCN UI Components (for pre-built, customizable UI elements)
    *   Lucide React (for icons)
*   **Telegram API Interaction**:
    *   `@mtproto/core` (MTProto.js - for direct client-side communication with Telegram)
*   **State Management**: React Hooks (useState, useContext, useReducer, useCallback, useMemo, useEffect) for component and feature-level state.

## Project Structure

A brief overview of key directories:

*   `src/app/`: Main application pages and layouts (Next.js App Router).
*   `src/components/`: Reusable UI components.
    *   `src/components/ui/`: ShadCN UI components.
    *   `src/components/layout/`: Layout components like Header, Footer.
    *   `src/components/main-content-view/`: Components for displaying files and folders.
*   `src/services/`: Modules for interacting with the Telegram API (`telegramService.ts` and its sub-modules like `telegramAPI.ts`, `telegramAuth.ts`, `telegramFiles.ts`, `telegramDialogs.ts`, `telegramCloud.ts`, `telegramUpdates.ts`).
*   `src/hooks/`: Custom React hooks.
    *   `src/hooks/features/`: Hooks encapsulating logic for major features (e.g., `useAuthManager`, `useGlobalDriveManager`).
*   `src/lib/`: Utility functions (`utils.ts`, `vfsUtils.ts`).
*   `src/types/`: TypeScript type definitions.

## Setup and Installation

### Prerequisites

*   Node.js (v18.x or later recommended)
*   npm or yarn

### Environment Variables

To connect to the Telegram API, you need an **API ID** and **API Hash**.

1.  **Obtain API Credentials**:
    *   Go to [my.telegram.org/apps](https://my.telegram.org/apps).
    *   Log in with your Telegram account.
    *   Fill out the form to register a new application. You can use generic names like "My Web App" for App title and Short name. Select "Web" for platform.
    *   Once registered, you will receive your `api_id` and `api_hash`. **Keep these confidential.**

2.  **Create `.env.local` file**:
    In the root of the project, create a file named `.env.local` and add your credentials:

    ```env
    NEXT_PUBLIC_TELEGRAM_API_ID=YOUR_API_ID_HERE
    NEXT_PUBLIC_TELEGRAM_API_HASH=YOUR_API_HASH_HERE
    ```

    Replace `YOUR_API_ID_HERE` and `YOUR_API_HASH_HERE` with the values you obtained.

    **Important**: You **MUST** restart your development server (`npm run dev` or `yarn dev`) after creating or modifying the `.env.local` file for the changes to take effect.

### Installation Steps

1.  **Clone the repository**:
    ```bash
    git clone https://your-repository-url.git
    cd telegram-cloudifier 
    ```

2.  **Install dependencies**:
    ```bash
    npm install
    # or
    yarn install
    ```

## Running the Application

1.  **Start the development server**:
    ```bash
    npm run dev
    # or
    yarn dev
    ```

2.  Open your browser and navigate to `http://localhost:9002` (or the port specified in your `package.json` if different).

## Key Functionalities Explained

### 1. Connecting to Telegram

*   The application uses the MTProto library to connect directly from your browser to Telegram's servers.
*   You'll be prompted for your phone number (including country code).
*   A verification code will be sent to your Telegram account (usually to your "Saved Messages" or a chat from Telegram).
*   If Two-Factor Authentication (2FA) is enabled on your account, you'll be prompted for your 2FA password.
*   Your session information is stored locally in your browser's localStorage to maintain connection across browser sessions until you explicitly disconnect or the session becomes invalid.

### 2. App-Managed Cloud Storage Channels (VFS)

This feature allows you to create dedicated Telegram channels/supergroups that the app manages as cloud storage.

*   **Creation**: From the UI, you can create a "New Cloud Storage." This action creates a new private channel/supergroup in your Telegram account.
*   **Initialization**:
    *   A special "identification message" (ID: 2) is sent to the channel. Its content helps the app recognize this channel as Cloudifier-managed.
    *   A "configuration message" (ID: 3) is sent, containing a JSON object. This JSON (`CloudChannelConfigV1`) defines the Virtual File System (VFS) for this channel. Initially, it's an empty root structure.
*   **VFS Structure**:
    *   Virtual folders do not exist as actual Telegram entities. They are defined within the configuration JSON.
    *   When you create a virtual folder (e.g., `/documents/work/`), the app edits the configuration message (ID: 3) in the channel to include this new folder path.
*   **File Uploads**:
    *   When you upload a file to a virtual path (e.g., `/photos/vacation/image.jpg`), the file is physically uploaded to the Telegram channel.
    *   The virtual path (`{"path":"/photos/vacation/"}`) is stored as a JSON string in the **caption** of the uploaded file's message.
*   **Browsing**: When you navigate the VFS in the UI:
    *   The app reads the `cloudConfig` from the selected Cloud Storage channel.
    *   It lists virtual folders based on this config.
    *   It fetches messages from the channel and filters them based on the `path` in their captions to display files for the current virtual path.

### 3. Global Drive

The Global Drive provides a unified view of media from all your accessible chats.

#### Default Organization Mode

*   **Scanning**: When you open the Global Drive in "Default" mode, the app starts scanning your Telegram dialogs (chats, channels, groups).
*   It fetches media messages (photos, videos, documents, audio) from these dialogs.
*   Media items are displayed chronologically by default.
*   **Filters**: You can filter by media type (All, Images, Videos, Documents, Music, Other) and by date.
*   **Loading**: Media is loaded in batches. You can "Load More" to continue scanning and fetching older items.

#### Custom Organization Mode

This powerful mode allows you to define your own virtual folder structure for all media across your Telegram account.

*   **Configuration File**:
    *   The structure is defined in a JSON file named `telegram_cloudifier_global_drive_config_v1.json`.
    *   You must **manually create this file** and **upload it to your "Saved Messages" chat** on Telegram.
    *   The message containing this file in "Saved Messages" must have a specific JSON caption:
        ```json
        {"app_feature":"telegram_cloudifier_global_drive_config_v1"}
        ```
*   **Loading the Configuration**:
    *   When you switch to "Custom" mode in the Global Drive, the app searches your "Saved Messages" for this specific file (checking pinned messages first, then recent documents).
    *   If found, it downloads the file's content (in-app, not a browser download), parses the JSON, and uses it to render the custom folder structure.
    *   If not found, or if the file is invalid (wrong signature, corrupted JSON), an error will be shown, or it will start with a default empty structure.
*   **JSON Structure (`telegram_cloudifier_global_drive_config_v1.json`)**:
    ```json
    {
      "app_signature": "GLOBAL_DRIVE_CONFIG_V1.0", // Must be exactly this
      "version": 1,
      "last_updated_timestamp_utc": "2023-10-27T10:00:00Z", // Updated by the app when saved
      "root_entries": {
        "My Photos": {
          "type": "folder",
          "name": "My Photos",
          "created_at": "2023-10-27T10:00:00Z",
          "modified_at": "2023-10-27T10:00:00Z",
          "entries": {
            "Vacation 2023": {
              "type": "folder",
              "name": "Vacation 2023",
              "created_at": "2023-10-27T10:01:00Z",
              "modified_at": "2023-10-27T10:01:00Z",
              "entries": {} // Can contain more folders or file_refs
            }
            // Future: "some_file_id_or_ref": { "type": "file_ref", ... }
          }
        },
        "Important Documents": {
          "type": "folder",
          "name": "Important Documents",
          "created_at": "2023-10-27T10:02:00Z",
          "modified_at": "2023-10-27T10:02:00Z",
          "entries": {}
        }
      }
    }
    ```
    *   `app_signature` and `version` are for compatibility.
    *   `root_entries` defines the top-level folders in your custom drive.
    *   Each entry can be a `folder`. (File references are planned for future versions where you can link existing Telegram media into this structure).
    *   The app currently supports creating and deleting these virtual folders directly from the UI when in Custom Global Drive mode, which will update this JSON file in your "Saved Messages."
*   **File Linking (Future)**: The `GlobalDriveFileReference` type in `src/types/index.ts` outlines a planned feature to link existing Telegram messages (media) into this custom structure without re-uploading or moving the original files. This is not yet fully implemented in the UI.

## Troubleshooting Common Issues

*   **Connection Errors / "API_ID_INVALID" / "AUTH_KEY_UNREGISTERED"**:
    *   Ensure `NEXT_PUBLIC_TELEGRAM_API_ID` and `NEXT_PUBLIC_TELEGRAM_API_HASH` in your `.env.local` are correct.
    *   Make sure you have **restarted your development server** (`npm run dev`) after any changes to `.env.local`.
    *   This error can also sometimes appear if Telegram's servers are temporarily busy or if your network has issues reaching them.
*   **"FLOOD_WAIT_X" Errors**: Telegram has rate limits. If you perform too many actions too quickly, you might be temporarily blocked. The app attempts to handle these by waiting, but severe cases might require you to wait longer.
*   **Custom Global Drive Config Not Loading**:
    *   **Filename**: Ensure the file in your "Saved Messages" is exactly `telegram_cloudifier_global_drive_config_v1.json`.
    *   **Caption**: The message containing the file *must* have the JSON caption: `{"app_feature":"telegram_cloudifier_global_drive_config_v1"}`. Copy-paste this carefully.
    *   **JSON Validity**: Ensure the content of your JSON file is valid. Use a JSON validator if unsure.
    *   **File Location**: The app primarily looks for this file among your *pinned messages* in "Saved Messages," then among recent documents. Pinning it is recommended.
    *   **Console Logs**: Check your browser's developer console for detailed logs from `useGlobalDriveConfigManager` prefixed with `[GDC_LoadOrCreate]` and `[GDC_DownloadConfig]` which can provide clues about failures.
*   **Video Playback Issues**: Video streaming depends on successful chunked downloads. Network issues or Telegram API limitations can affect this. Try downloading the video directly if streaming fails.

## Important Considerations & Disclaimer

*   **Telegram API Usage**: This application interacts directly with the Telegram API. Be mindful of Telegram's Terms of Service and API usage policies. Excessive or abusive API usage could lead to restrictions on your account.
*   **Data Privacy**:
    *   Telegram Cloudifier is a **client-side application**. It runs entirely in your browser.
    *   Your Telegram API ID, API Hash, phone number, and session tokens are stored in your browser's local storage.
    *   **No user data, credentials, or session information is sent to any third-party server by this application.** All communication is directly between your browser and Telegram's servers.
*   **File Size Limits**: Telegram has its own limits for file uploads (e.g., 2GB or 4GB for premium users). The app adheres to these. Large file operations can be slow and consume significant bandwidth.
*   **Rate Limiting**: Operations like scanning all chats for the Global Drive can be intensive. The app attempts to manage this, but you might encounter Telegram's rate limits.
*   **Configuration Management**: For the Custom Global Drive, you are responsible for creating and maintaining the `telegram_cloudifier_global_drive_config_v1.json` file if you choose to manage it manually outside the app's creation/deletion UI. The app will attempt to update this file when you create/delete folders in the Custom Global Drive UI.
*   **Software Stability**: This is a project that may be under development. Use with an understanding that bugs or unexpected behavior might occur. Always ensure you have backups of critical data.

## Future Enhancements (Potential)

*   In-app JSON editor for the Custom Global Drive configuration.
*   Drag-and-drop linking of existing Telegram media into the Custom Global Drive.
*   More robust conflict resolution for file operations.
*   Enhanced search capabilities within VFS and Global Drive.
*   Support for more advanced Telegram features (e.g., message scheduling within cloud channels).

Thank you for using or exploring Telegram Cloudifier!
