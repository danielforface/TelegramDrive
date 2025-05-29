
"use client";

import type { CloudFile } from "@/types";
import { ContentFileItem } from "./content-file-item";
import { Input } from "@/components/ui/input";
import { Search, FolderOpen, Loader2 } from "lucide-react";
import { useState, useMemo, useEffect } from "react";

interface MainContentViewProps {
  folderName: string | null;
  files: CloudFile[];
  isLoading: boolean; 
  hasMore: boolean;
  lastItemRef?: (node: HTMLDivElement | null) => void;
  onFileDetailsClick: (file: CloudFile) => void;
  onFileDownloadClick: (file: CloudFile) => void;
  onFileViewImageClick: (file: CloudFile) => void;
  onFilePlayVideoClick: (file: CloudFile) => void;
}

// Debounce function
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

export function MainContentView({ 
  folderName, 
  files, 
  isLoading, 
  hasMore, 
  lastItemRef, 
  onFileDetailsClick,
  onFileDownloadClick,
  onFileViewImageClick,
  onFilePlayVideoClick
}: MainContentViewProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");

  useEffect(() => {
    setSearchTerm("");
    setDebouncedSearchTerm("");
  }, [folderName]);

  const updateDebouncedSearchTerm = useMemo(
    () => debounce((term: string) => setDebouncedSearchTerm(term.toLowerCase()), 300),
    []
  );

  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(event.target.value);
    updateDebouncedSearchTerm(event.target.value);
  };

  const filteredFiles = useMemo(() => {
    if (!files) return [];
    const term = debouncedSearchTerm;
    return files.filter(file =>
      file.name.toLowerCase().includes(term) ||
      file.type.toLowerCase().includes(term)
    );
  }, [files, debouncedSearchTerm]);

  if (!folderName) { 
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-8">
        <FolderOpen className="w-20 h-20 mb-6 opacity-40" />
        <p className="text-xl font-medium">Select a chat to view its media.</p>
      </div>
    );
  }
  
  const displayFiles = filteredFiles;
  const noResultsForSearch = searchTerm && displayFiles.length === 0 && !isLoading;
  const noMediaAtAll = !searchTerm && displayFiles.length === 0 && !isLoading && !hasMore;

  return (
    <div className="space-y-6 h-full flex flex-col p-1 md:p-2 lg:p-4">
      <div className="flex-shrink-0">
        <h1 className="text-3xl font-bold text-primary mb-2 pb-2 border-b">{folderName}</h1>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <Input
            type="search"
            placeholder={`Search in ${folderName}... (e.g., "photo", ".jpg", "report")`}
            className="pl-10 pr-4 py-2 text-base"
            value={searchTerm}
            onChange={handleSearchChange}
          />
        </div>
      </div>

      {isLoading && displayFiles.length === 0 ? (
         <div className="flex-grow flex flex-col items-center justify-center text-muted-foreground text-center">
          <Loader2 className="animate-spin h-12 w-12 text-primary mb-4" />
          <p className="text-lg">Loading media...</p>
        </div>
      ) : noResultsForSearch ? (
        <div className="flex-grow flex flex-col items-center justify-center text-muted-foreground text-center">
          <FolderOpen className="w-16 h-16 mb-4 opacity-50" />
          <p className="text-lg">No media items matching "{searchTerm}".</p>
        </div>
      ) : noMediaAtAll ? (
         <div className="flex-grow flex flex-col items-center justify-center text-muted-foreground text-center">
          <FolderOpen className="w-16 h-16 mb-4 opacity-50" />
          <p className="text-lg">This chat contains no media items.</p>
        </div>
      ) : (
        <div className="flex-grow overflow-y-auto space-y-0 pr-1">
          {displayFiles.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {displayFiles.map((file, index) => {
                const itemContent = (
                  <ContentFileItem
                    key={file.id + '-' + index} 
                    file={file}
                    style={{ animationDelay: `${index * 30}ms` }}
                    onDetailsClick={onFileDetailsClick}
                    onDownloadClick={onFileDownloadClick}
                    onViewImageClick={file.type === 'image' ? onFileViewImageClick : undefined}
                    onPlayVideoClick={file.type === 'video' ? onFilePlayVideoClick : undefined}
                  />
                );
                // Attach ref to the div wrapper for the last item for IntersectionObserver
                if (index === displayFiles.length - 1 && lastItemRef) {
                  return <div ref={lastItemRef} key={`ref-${file.id}-${index}`}>{itemContent}</div>;
                }
                return itemContent;
              })}
            </div>
          )}
          {isLoading && displayFiles.length > 0 && ( 
            <div className="flex justify-center items-center p-4 mt-4">
              <Loader2 className="animate-spin h-8 w-8 text-primary" />
              <p className="ml-3 text-muted-foreground">Loading more media...</p>
            </div>
          )}
          {!isLoading && !hasMore && displayFiles.length > 0 && (
             <p className="text-center text-sm text-muted-foreground py-4 mt-4">No more media to load.</p>
          )}
        </div>
      )}
    </div>
  );
}
