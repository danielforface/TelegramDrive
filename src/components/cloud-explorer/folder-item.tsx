
// This component has been moved and adapted to:
// src/components/main-content-view/content-folder-item.tsx
// This file can be deleted.

"use client";
import type { CloudFolder } from "@/types";
import { Folder } from "lucide-react"; // Example

export function FolderItem({ folder, style }: { folder: CloudFolder, style?: React.CSSProperties }) {
  // console.warn("FolderItem (cloud-explorer) component is deprecated and should be removed.");
  return (
    <div style={style} className="p-2 border rounded mb-1 bg-blue-50">
      <Folder className="inline-block mr-2" /> {folder.name}
      {/* Original content commented out or removed */}
    </div>
  );
}

    