
"use client";

import type { CloudFolder } from "@/types";
import { ContentFolderItem } from "./content-folder-item";
import { ContentFileItem } from "./content-file-item";
import { Input } from "@/components/ui/input";
import { Search, FolderOpen } from "lucide-react";
import { useState, useMemo } from "react";

interface MainContentViewProps {
  folder: CloudFolder | null;
  // onSelectSubFolder: (folderId: string) => void; // For navigating deeper if needed
}

// Debounce function - can be moved to utils if used elsewhere
function debounce<F extends (...args: any[]) => any>(func: F, waitFor: number) {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  const debounced = (...args: Parameters<F>) => {
    if (timeout !== null) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(() => func(...args), waitFor);
  };
  return debounced as (...args: Parameters<F>) => ReturnType<F>;
}

export function MainContentView({ folder }: MainContentViewProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");

  const updateDebouncedSearchTerm = useMemo(
    () => debounce((term: string) => setDebouncedSearchTerm(term), 300),
    []
  );

  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(event.target.value);
    updateDebouncedSearchTerm(event.target.value);
  };

  const filteredFolderContent = useMemo(() => {
    if (!folder) return { files: [], folders: [] };
    if (!debouncedSearchTerm.trim()) return { files: folder.files, folders: folder.folders };

    const term = debouncedSearchTerm.toLowerCase();
    const filteredFiles = folder.files.filter(file => file.name.toLowerCase().includes(term));
    const filteredSubFolders = folder.folders.filter(subFolder => subFolder.name.toLowerCase().includes(term));
    
    return { files: filteredFiles, folders: filteredSubFolders };
  }, [folder, debouncedSearchTerm]);


  if (!folder) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
        <FolderOpen className="w-16 h-16 mb-4 opacity-50" />
        <p className="text-lg">Select a chat to view its media and files.</p>
      </div>
    );
  }

  const { files: displayFiles, folders: displayFolders } = filteredFolderContent;

  return (
    <div className="space-y-6 h-full flex flex-col">
      <div className="flex-shrink-0">
        <h1 className="text-3xl font-bold text-primary mb-2 pb-2 border-b">{folder.name}</h1>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <Input
            type="search"
            placeholder={`Search in ${folder.name}...`}
            className="pl-10 pr-4 py-2 text-base"
            value={searchTerm}
            onChange={handleSearchChange}
          />
        </div>
      </div>

      {(displayFolders.length === 0 && displayFiles.length === 0) ? (
        <div className="flex-grow flex flex-col items-center justify-center text-muted-foreground">
           <FolderOpen className="w-12 h-12 mb-3 opacity-50" />
          <p>This chat folder is empty {searchTerm ? `for "${searchTerm}".` : `or contains no media.`}</p>
        </div>
      ) : (
        <div className="flex-grow overflow-y-auto space-y-3 pr-1">
          {displayFolders.map((subFolder, index) => (
            <ContentFolderItem
              key={subFolder.id}
              folder={subFolder}
              defaultOpen={!!searchTerm || displayFolders.length === 1 || subFolder.files.length > 0}
              // onSelect={() => onSelectSubFolder(subFolder.id)} // If subfolders navigate
              style={{ animationDelay: `${index * 80}ms` }}
            />
          ))}
          {displayFiles.map((file, index) => (
            <ContentFileItem 
              key={file.id} 
              file={file} 
              style={{ animationDelay: `${(displayFolders.length + index) * 80}ms` }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

    