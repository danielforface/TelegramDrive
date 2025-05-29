
"use client";

import type { DialogFilter } from "@/types";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Loader2, ListFilter } from "lucide-react"; // Added ListFilter for default "All"

interface FolderTabsBarProps {
  filters: DialogFilter[];
  activeFilterId: number | null; // Can be null if no filter is active or before loading
  onSelectFilter: (filterId: number) => void;
  isLoading: boolean;
}

// Special ID for "All Chats" tab, should match the one in page.tsx
const ALL_CHATS_FILTER_ID = 0; 

export function FolderTabsBar({
  filters,
  activeFilterId,
  onSelectFilter,
  isLoading,
}: FolderTabsBarProps) {

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-12 border-b px-4 bg-background sticky top-0 z-10">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
        <span className="ml-2 text-sm text-muted-foreground">Loading folders...</span>
      </div>
    );
  }
  
  // Ensure there's always an "All Chats" option, even if API returns no custom filters.
  // The service should already prepend this, but as a fallback for UI:
  const displayFilters = [...filters];
  if (!displayFilters.some(f => f.id === ALL_CHATS_FILTER_ID)) {
      displayFilters.unshift({
          id: ALL_CHATS_FILTER_ID,
          title: "All Chats",
          _: 'dialogFilterDefault', // Convention
          flags: 0,
          include_peers: [],
      });
  }


  // Default to "All Chats" if activeFilterId is null or not found
  const currentTabValue = (activeFilterId !== null && displayFilters.some(f => f.id === activeFilterId))
                          ? activeFilterId.toString()
                          : ALL_CHATS_FILTER_ID.toString();

  return (
    <div className="border-b sticky top-0 bg-background z-10 shadow-sm">
      <ScrollArea className="w-full whitespace-nowrap">
        <Tabs
          value={currentTabValue}
          onValueChange={(value) => {
            const newFilterId = parseInt(value, 10);
            if (!isNaN(newFilterId)) {
              onSelectFilter(newFilterId);
            }
          }}
          className="w-max min-w-full" // Allow tabs to extend, ensure full width for scroll container
        >
          <TabsList className="h-12 rounded-none border-none bg-transparent p-0 gap-0 sm:gap-1 px-1 sm:px-2">
            {displayFilters.map((filter) => (
              <TabsTrigger
                key={filter.id}
                value={filter.id.toString()}
                className="h-10 relative rounded-md px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-sm hover:bg-muted/50 flex items-center gap-1.5"
              >
                {filter.id === ALL_CHATS_FILTER_ID && !filter.emoticon && <ListFilter className="h-4 w-4" />}
                {filter.emoticon && <span className="text-lg">{filter.emoticon}</span>}
                <span className="truncate max-w-[150px] sm:max-w-xs">{filter.title}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <ScrollBar orientation="horizontal" className="h-2"/>
      </ScrollArea>
    </div>
  );
}
