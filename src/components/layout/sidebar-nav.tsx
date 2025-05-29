
// This component is no longer used and can be deleted.
// Its functionality is replaced by ChatSelectionDialog.tsx
// and ChatListItem.tsx.

"use client";

import type { CloudFolder } from "@/types";
// import { SidebarNavItem } from "./sidebar-nav-item"; // No longer used

interface SidebarNavProps {
  folders: CloudFolder[];
  selectedFolderId: string | null;
  onSelectFolder: (folderId: string) => void;
  lastItemRef?: (node: HTMLLIElement | null) => void;
}

export function SidebarNav({ folders, selectedFolderId, onSelectFolder, lastItemRef }: SidebarNavProps) {
  if (!folders || folders.length === 0) {
    return <p className="text-sm text-muted-foreground p-4 text-center">No chats to display.</p>;
  }
  // console.warn("SidebarNav component is deprecated and should be removed.");
  return (
    <nav>
      <p className="text-red-500 p-4 text-center">SidebarNav is deprecated.</p>
      {/*
      <ul className="space-y-1">
        {folders.map((folder, index) => (
          <SidebarNavItem
            key={folder.id}
            folder={folder}
            isSelected={folder.id === selectedFolderId}
            onSelect={() => onSelectFolder(folder.id)}
            ref={index === folders.length - 1 ? lastItemRef : null}
          />
        ))}
      </ul>
      */}
    </nav>
  );
}
