
"use client";

import type { CloudFolder } from "@/types";
import { ContentFolderItem } from "./content-folder-item";
import { ContentFileItem } from "./content-file-item";
import { Input } from "@/components/ui/input";
import { Search, FolderOpen } from "lucide-react";
import { useState, useMemo, useEffect } from "react";

interface MainContentViewProps {
  folder: CloudFolder | null;
}

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

  // Reset search term when folder changes
  useEffect(() => {
    setSearchTerm("");
    setDebouncedSearchTerm("");
  }, [folder]);

  const updateDebouncedSearchTerm = useMemo(
    () => debounce((term: string) => setDebouncedSearchTerm(term.toLowerCase()), 300),
    []
  );

  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(event.target.value);
    updateDebouncedSearchTerm(event.target.value);
  };

  const filteredFolderContent = useMemo(() => {
    if (!folder) return { files: [], folders: [] };
    
    const term = debouncedSearchTerm; // Already lowercased by debounced function
    
    const filteredSubFolders = folder.folders.filter(subFolder => 
      subFolder.name.toLowerCase().includes(term)
    );
    
    const filteredFiles = folder.files.filter(file => 
      file.name.toLowerCase().includes(term) || 
      file.type.toLowerCase().includes(term)
    );
    
    return { files: filteredFiles, folders: filteredSubFolders };
  }, [folder, debouncedSearchTerm]);


  if (!folder) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-8">
        <FolderOpen className="w-20 h-20 mb-6 opacity-40" />
        <p className="text-xl font-medium">Select a chat to view its media and files.</p>
        <p className="text-sm mt-1">Your organized cloud view awaits!</p>
      </div>
    );
  }

  const { files: displayFiles, folders: displayFolders } = filteredFolderContent;
  const totalItems = displayFiles.length + displayFolders.length;

  return (
    <div className="space-y-6 h-full flex flex-col p-4 md:p-6 lg:p-8">
      <div className="flex-shrink-0">
        <h1 className="text-3xl font-bold text-primary mb-2 pb-2 border-b">{folder.name}</h1>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <Input
            type="search"
            placeholder={`Search in ${folder.name}... (e.g., "photo", ".jpg", "report")`}
            className="pl-10 pr-4 py-2 text-base"
            value={searchTerm}
            onChange={handleSearchChange}
          />
        </div>
      </div>

      {totalItems === 0 ? (
        <div className="flex-grow flex flex-col items-center justify-center text-muted-foreground text-center">
          <FolderOpen className="w-16 h-16 mb-4 opacity-50" />
          <p className="text-lg">
            This chat folder {searchTerm ? `has no items matching "${searchTerm}".` : `is empty or contains no media.`}
          </p>
        </div>
      ) : (
        <div className="flex-grow overflow-y-auto space-y-0 pr-1">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {displayFolders.map((subFolder, index) => (
              <ContentFolderItem
                key={subFolder.id}
                folder={subFolder}
                // onClick={() => console.log("Sub-folder clicked:", subFolder.name)} // Placeholder for future navigation
                style={{ animationDelay: `${index * 60}ms` }}
              />
            ))}
            {displayFiles.map((file, index) => (
              <ContentFileItem 
                key={file.id} 
                file={file} 
                style={{ animationDelay: `${(displayFolders.length + index) * 60}ms` }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
