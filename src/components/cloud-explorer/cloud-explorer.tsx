"use client";

import type { CloudFolder } from "@/types";
import { FolderItem } from "./folder-item";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { useState, useMemo, useEffect } from "react";

interface CloudExplorerProps {
  data: CloudFolder[];
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


export function CloudExplorer({ data }: CloudExplorerProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 500); // Simulate loading structure
    return () => clearTimeout(timer);
  }, [data]);

  const updateDebouncedSearchTerm = useMemo(() => 
    debounce((term: string) => {
      setDebouncedSearchTerm(term);
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

  const filteredData = useMemo(() => filterData(data, debouncedSearchTerm), [data, debouncedSearchTerm]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-8">
        <Search className="w-12 h-12 text-primary animate-pulse mb-4" />
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
      {filteredData.length === 0 && searchTerm && (
        <p className="text-center text-muted-foreground py-4">No results found for "{searchTerm}".</p>
      )}
      {filteredData.length === 0 && !searchTerm && (
         <p className="text-center text-muted-foreground py-4">No chats or files found. Try connecting again or check your Telegram account.</p>
      )}
      <div className="space-y-2">
        {filteredData.map((rootFolder, index) => (
          <FolderItem 
            key={rootFolder.id} 
            folder={rootFolder} 
            defaultOpen={rootFolder.isChatFolder || filteredData.length === 1 || !!searchTerm} // Open chat folders by default or if only one result or searching
            style={{ animationDelay: `${index * 100}ms` }}
          />
        ))}
      </div>
    </div>
  );
}
