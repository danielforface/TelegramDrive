
"use client";

import type { CloudFile } from "@/types";
import { ContentFileItem } from "./content-file-item";
import { Input } from "@/components/ui/input";
import { Search, FolderOpen, Loader2 } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useState, useMemo, useEffect } from "react";

interface MainContentViewProps {
  folderName: string | null;
  files: CloudFile[];
  isLoading: boolean;
  hasMore: boolean;
  lastItemRef?: (node: HTMLDivElement | null) => void;
  onFileDetailsClick: (file: CloudFile) => void;
  onQueueDownloadClick: (file: CloudFile) => void;
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

const TABS_CONFIG = [
  { value: "all", label: "All" },
  { value: "images", label: "Images" },
  { value: "videos", label: "Videos" },
  { value: "documents", label: "Documents" },
  { value: "music", label: "Music" },
  { value: "other", label: "Other" },
];

const DOCUMENT_EXTENSIONS = ['.pdf', '.docx', '.doc', '.txt', '.pptx', '.ppt'];

export function MainContentView({
  folderName,
  files,
  isLoading,
  hasMore,
  lastItemRef,
  onFileDetailsClick,
  onQueueDownloadClick,
  onFileViewImageClick,
  onFilePlayVideoClick
}: MainContentViewProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("all");

  useEffect(() => {
    setSearchTerm("");
    setDebouncedSearchTerm("");
    setActiveTab("all"); // Reset tab when folder changes
  }, [folderName]);

  const updateDebouncedSearchTerm = useMemo(
    () => debounce((term: string) => setDebouncedSearchTerm(term.toLowerCase()), 300),
    []
  );

  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(event.target.value);
    updateDebouncedSearchTerm(event.target.value);
  };

  const filteredByTypeFiles = useMemo(() => {
    if (!files) return [];
    switch (activeTab) {
      case "images":
        return files.filter(file => file.type === 'image');
      case "videos":
        return files.filter(file => file.type === 'video');
      case "documents":
        return files.filter(file =>
          file.type === 'document' &&
          DOCUMENT_EXTENSIONS.some(ext => file.name.toLowerCase().endsWith(ext))
        );
      case "music":
        return files.filter(file => file.type === 'audio');
      case "other":
        return files.filter(file =>
          file.type === 'document' &&
          !DOCUMENT_EXTENSIONS.some(ext => file.name.toLowerCase().endsWith(ext))
        );
      case "all":
      default:
        return files;
    }
  }, [files, activeTab]);

  const searchedAndTypedFiles = useMemo(() => {
    if (!filteredByTypeFiles) return [];
    const term = debouncedSearchTerm;
    if (!term) return filteredByTypeFiles; // If no search term, return all files from the active tab
    return filteredByTypeFiles.filter(file =>
      file.name.toLowerCase().includes(term) ||
      file.type.toLowerCase().includes(term)
    );
  }, [filteredByTypeFiles, debouncedSearchTerm]);

  if (!folderName) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-8">
        <FolderOpen className="w-20 h-20 mb-6 opacity-40" />
        <p className="text-xl font-medium">Select a chat to view its media.</p>
      </div>
    );
  }

  const displayFiles = searchedAndTypedFiles;
  const noResultsForSearchOrTab = (searchTerm || activeTab !== "all") && displayFiles.length === 0 && !isLoading;
  const noMediaAtAll = !searchTerm && activeTab === "all" && displayFiles.length === 0 && !isLoading && !hasMore;

  return (
    <div className="space-y-4 h-full flex flex-col p-1 md:p-2 lg:p-4">
      <div className="flex-shrink-0">
        <h1 className="text-3xl font-bold text-primary mb-3 pb-2 border-b">{folderName}</h1>
        <div className="flex flex-col sm:flex-row gap-3 mb-3 items-center">
          <div className="relative flex-grow w-full sm:w-auto">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <Input
              type="search"
              placeholder={`Search in ${folderName}...`}
              className="pl-10 pr-4 py-2 text-base w-full"
              value={searchTerm}
              onChange={handleSearchChange}
            />
          </div>
          <Tabs defaultValue="all" onValueChange={setActiveTab} value={activeTab} className="w-full sm:w-auto">
            <TabsList className="grid w-full grid-cols-3 sm:w-auto sm:inline-flex h-auto">
              {TABS_CONFIG.map(tab => (
                <TabsTrigger key={tab.value} value={tab.value} className="px-3 py-1.5 text-xs sm:text-sm">
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
      </div>

      {isLoading && displayFiles.length === 0 ? (
         <div className="flex-grow flex flex-col items-center justify-center text-muted-foreground text-center">
          <Loader2 className="animate-spin h-12 w-12 text-primary mb-4" />
          <p className="text-lg">Loading media...</p>
        </div>
      ) : noResultsForSearchOrTab ? (
        <div className="flex-grow flex flex-col items-center justify-center text-muted-foreground text-center">
          <FolderOpen className="w-16 h-16 mb-4 opacity-50" />
          <p className="text-lg">
            No media items matching your filter {searchTerm && `"${searchTerm}"`} in the "{TABS_CONFIG.find(t=>t.value === activeTab)?.label}" tab.
          </p>
        </div>
      ) : noMediaAtAll ? (
         <div className="flex-grow flex flex-col items-center justify-center text-muted-foreground text-center">
          <FolderOpen className="w-16 h-16 mb-4 opacity-50" />
          <p className="text-lg">This chat contains no media items.</p>
        </div>
      ) : (
        <div className="flex-grow overflow-y-auto space-y-0 pr-1 pb-4"> {/* Added pb-4 for scrollbar visibility */}
          {displayFiles.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {displayFiles.map((file, index) => {
                const itemContent = (
                  <ContentFileItem
                    key={`${file.id}-${activeTab}-${index}`} // Ensure key uniqueness when tab changes
                    file={file}
                    style={{ animationDelay: `${index * 30}ms` }}
                    onDetailsClick={onFileDetailsClick}
                    onQueueDownloadClick={onQueueDownloadClick}
                    onViewImageClick={onFileViewImageClick}
                    onPlayVideoClick={onFilePlayVideoClick}
                  />
                );
                if (index === displayFiles.length - 1 && hasMore && !isLoading && !searchTerm && activeTab === 'all') { // lastItemRef only for "all" tab without search for now
                  return <div ref={lastItemRef} key={`ref-${file.id}-${index}`}>{itemContent}</div>;
                }
                return itemContent;
              })}
            </div>
          )}
          {isLoading && displayFiles.length > 0 && ( // Show spinner if loading more items for current view
            <div className="flex justify-center items-center p-4 mt-4">
              <Loader2 className="animate-spin h-8 w-8 text-primary" />
              <p className="ml-3 text-muted-foreground">Loading more media...</p>
            </div>
          )}
          {!isLoading && !hasMore && displayFiles.length > 0 && (
             <p className="text-center text-sm text-muted-foreground py-4 mt-4">No more media to load for the current filter.</p>
          )}
           {!isLoading && hasMore && displayFiles.length > 0 && searchTerm === '' && activeTab === 'all' && (
             <p className="text-center text-sm text-muted-foreground py-4 mt-4">Scroll down to load more media.</p>
          )}
        </div>
      )}
    </div>
  );
}

