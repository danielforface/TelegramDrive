
"use client";

import type { CloudFolder } from "@/types";
import { FolderItem } from "./folder-item";
import { Input } from "@/components/ui/input";
import { Search, Loader2 } from "lucide-react";
import { useState, useMemo, useEffect, useCallback } from "react";

interface CloudExplorerProps {
  data: CloudFolder[];
  // The lastItemRef will be passed from the parent (page.tsx)
  // to attach to the very last FolderItem rendered by this component.
  lastItemRef?: (node: HTMLDivElement | null) => void; 
}

// Debounce function
function debounce<F extends (...args: any[]) => any>(func: F, waitFor: number) {
  let timeout: ReturnType<typeof setTimeout> | null = null;

  const debounced = (...args: Parameters<F>) => {
    if (timeout !== null) {
      clearTimeout(timeout);
      timeout = null;
    }
    timeout = setTimeout(() => func(...args), waitFor);
  };

  return debounced as (...args: Parameters<F>) => ReturnType<F>;
}


export function CloudExplorer({ data, lastItemRef }: CloudExplorerProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
  const [isFiltering, setIsFiltering] = useState(false); // Separate loading for filtering

  useEffect(() => {
    // This effect is just to show initial loading state of the component itself,
    // not related to data fetching which is handled by page.tsx
    const timer = setTimeout(() => setIsFiltering(false), 300); // Simulate structure filtering time
    return () => clearTimeout(timer);
  }, [debouncedSearchTerm]); // Trigger on actual search term change

  const updateDebouncedSearchTerm = useMemo(() =>
    debounce((term: string) => {
      setDebouncedSearchTerm(term);
      setIsFiltering(true); // Start filtering visual cue
    }, 300),
  []);

  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(event.target.value);
    updateDebouncedSearchTerm(event.target.value);
  };

  const filterData = (folders: CloudFolder[], term: string): CloudFolder[] => {
    if (!term.trim()) return folders;
    term = term.toLowerCase();

    return folders.map(folder => {
      const filteredFiles = folder.files.filter(file => file.name.toLowerCase().includes(term));
      const filteredSubFolders = filterData(folder.folders, term);
      
      if (filteredFiles.length > 0 || filteredSubFolders.length > 0 || folder.name.toLowerCase().includes(term)) {
        return { ...folder, files: filteredFiles, folders: filteredSubFolders };
      }
      return null;
    }).filter(folder => folder !== null) as CloudFolder[];
  };

  const filteredData = useMemo(() => {
    if (!data) return [];
    const result = filterData(data, debouncedSearchTerm);
    setIsFiltering(false); // Filtering done
    return result;
  }, [data, debouncedSearchTerm]);


  if (!data && !searchTerm) { // Handles case where initial data is null (during initial fetch)
    return (
      <div className="flex flex-col items-center justify-center p-8">
        <Loader2 className="w-12 h-12 text-primary animate-spin mb-4" />
        <p className="text-lg text-muted-foreground">Loading your cloud structure...</p>
      </div>
    );
  }
  
  return (
    <div className="w-full space-y-6">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
        <Input
          type="search"
          placeholder="Search files and folders..."
          className="pl-10 pr-4 py-2 text-base"
          value={searchTerm}
          onChange={handleSearchChange}
        />
      </div>
      {isFiltering && (
         <div className="flex justify-center items-center p-4">
            <Loader2 className="animate-spin h-6 w-6 text-primary" />
            <p className="ml-2 text-muted-foreground">Filtering...</p>
          </div>
      )}
      {!isFiltering && filteredData.length === 0 && searchTerm && (
        <p className="text-center text-muted-foreground py-4">No results found for "{searchTerm}".</p>
      )}
      {!isFiltering && filteredData.length === 0 && !searchTerm && data && data.length === 0 && (
         <p className="text-center text-muted-foreground py-4">No chats found. Your Telegram appears to be empty.</p>
      )}
      {!isFiltering && (
        <div className="space-y-2">
          {filteredData.map((rootFolder, index) => (
            <div key={rootFolder.id} ref={index === filteredData.length - 1 ? lastItemRef : null}>
              <FolderItem
                folder={rootFolder}
                defaultOpen={rootFolder.isChatFolder || filteredData.length === 1 || !!searchTerm || data.length <= 5 } // Open chat folders, or if only one result, or searching, or few items
                style={{ animationDelay: `${index * 100}ms` }}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
