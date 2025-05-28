
// This component has been moved and adapted to:
// src/components/main-content-view/content-file-item.tsx
// This file can be deleted.

"use client";

import type { CloudFile } from "@/types";
import { FileText } from "lucide-react"; // Example

export function FileItem({ file, style }: { file: CloudFile, style?: React.CSSProperties }) {
  // console.warn("FileItem (cloud-explorer) component is deprecated and should be removed.");
  return (
    <div style={style} className="p-2 border rounded mb-1 bg-gray-50">
      <FileText className="inline-block mr-2" /> {file.name} ({file.type})
      {/* Original content commented out or removed */}
    </div>
  );
}

    