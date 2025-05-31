
"use client";

import type { DialogFilter } from "@/types";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Loader2, ListFilter, Edit3, Share2, PlusSquare, Check, GripVertical, CloudCog } from "lucide-react"; // Added CloudCog
import { cn } from "@/lib/utils";
import React from "react";

interface FolderTabsBarProps {
  filters: DialogFilter[];
  activeFilterId: number | null;
  onSelectFilter: (filterId: number) => void;
  isLoading: boolean;
  isReorderingMode: boolean;
  onToggleReorderMode: () => void;
  onMoveFilter: (dragIndex: number, hoverIndex: number) => void;
  onShareFilter: (filterId: number) => void;
  onAddFilterPlaceholder: () => void;
  onOpenCreateCloudChannelDialog: () => void; // New prop
  className?: string;
}

const ALL_CHATS_FILTER_ID = 0;

export function FolderTabsBar({
  filters,
  activeFilterId,
  onSelectFilter,
  isLoading,
  isReorderingMode,
  onToggleReorderMode,
  onMoveFilter,
  onShareFilter,
  onAddFilterPlaceholder,
  onOpenCreateCloudChannelDialog, // Destructure new prop
  className,
}: FolderTabsBarProps) {

  if (isLoading && filters.length <= 1) {
    return (
      <div className={cn("flex items-center justify-center h-14 border-b px-4 bg-background shadow-sm", className)}>
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
        <span className="ml-2 text-sm text-muted-foreground">Loading folders...</span>
      </div>
    );
  }

  const displayFilters = [...filters];
  if (!displayFilters.some(f => f.id === ALL_CHATS_FILTER_ID)) {
      const allChatsDefault: DialogFilter = {
          _:'dialogFilterDefault',
          id: ALL_CHATS_FILTER_ID,
          title: "All Chats",
          flags:0,
          pinned_peers: [],
          include_peers: [],
          exclude_peers: []
      };
      displayFilters.unshift(allChatsDefault);
  }

  const currentTabValue = (activeFilterId !== null && displayFilters.some(f => f.id === activeFilterId))
                          ? activeFilterId.toString()
                          : ALL_CHATS_FILTER_ID.toString();

  const [draggedItemIndex, setDraggedItemIndex] = React.useState<number | null>(null);

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, index: number) => {
    if (!isReorderingMode || filters[index].id === ALL_CHATS_FILTER_ID) {
        e.preventDefault();
        return;
    }
    e.dataTransfer.setData('filterIndex', index.toString());
    setDraggedItemIndex(index);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!isReorderingMode || draggedItemIndex === null) return;
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>, dropIndex: number) => {
    e.preventDefault();
    if (!isReorderingMode || draggedItemIndex === null || (filters[dropIndex] && filters[dropIndex].id === ALL_CHATS_FILTER_ID && dropIndex === 0)) {
      setDraggedItemIndex(null);
      return;
    }
    const dragIndexStr = e.dataTransfer.getData('filterIndex');
    if (dragIndexStr) {
      const dragIndex = parseInt(dragIndexStr, 10);
      if (!isNaN(dragIndex) && dragIndex !== dropIndex && (!filters[dropIndex] || filters[dropIndex].id !== ALL_CHATS_FILTER_ID)) {
        onMoveFilter(dragIndex, dropIndex);
      }
    }
    setDraggedItemIndex(null);
  };

  return (
    <div className={cn("border-b bg-background shadow-sm", className)}>
      <div className="flex items-center px-2 sm:px-3 h-14">
        <ScrollArea className="flex-grow whitespace-nowrap">
          <Tabs
            value={currentTabValue}
            onValueChange={(value) => {
              if (isReorderingMode) return;
              const newFilterId = parseInt(value, 10);
              if (!isNaN(newFilterId)) {
                onSelectFilter(newFilterId);
              }
            }}
            className="w-max min-w-full"
          >
            <TabsList className="h-12 rounded-none border-none bg-transparent p-0 gap-0 sm:gap-1">
              {displayFilters.map((filter, index) => (
                <div
                  key={filter.id}
                  className={cn(
                    "flex items-center rounded-md", 
                    isReorderingMode && filter.id !== ALL_CHATS_FILTER_ID && "tab-shake cursor-move",
                    isReorderingMode && filter.id === ALL_CHATS_FILTER_ID && "cursor-not-allowed opacity-70",
                    draggedItemIndex === index && "opacity-50 border-2 border-dashed border-primary",
                    activeFilterId === filter.id && !isReorderingMode && "bg-primary/10"
                  )}
                  draggable={isReorderingMode && filter.id !== ALL_CHATS_FILTER_ID}
                  onDragStart={(e) => handleDragStart(e, index)}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, index)}
                  onDragEnd={() => setDraggedItemIndex(null)}
                >
                  <TooltipProvider delayDuration={100}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <TabsTrigger
                          value={filter.id.toString()}
                          disabled={isReorderingMode && filter.id !== ALL_CHATS_FILTER_ID && draggedItemIndex === index}
                          className={cn(
                            "h-10 relative px-2 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-sm hover:bg-muted/50 flex items-center gap-1.5",
                            activeFilterId === filter.id && !isReorderingMode ? "data-[state=active]:bg-transparent data-[state=active]:shadow-none" : "data-[state=active]:bg-primary/10"
                          )}
                        >
                          {isReorderingMode && filter.id !== ALL_CHATS_FILTER_ID && <GripVertical className="h-4 w-4 mr-1 text-muted-foreground" />}
                          {filter.id === ALL_CHATS_FILTER_ID && !filter.emoticon && <ListFilter className="h-4 w-4" />}
                          {filter.emoticon && <span className="text-lg">{filter.emoticon}</span>}
                          <span className="truncate max-w-[100px] sm:max-w-[180px]">{filter.title}</span>
                        </TabsTrigger>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{filter.title}</p>
                        {filter.inviteLink && <p className="text-xs text-muted-foreground">Link: {filter.inviteLink}</p>}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>

                  {!isReorderingMode && filter.id !== ALL_CHATS_FILTER_ID && (
                    <TooltipProvider delayDuration={100}>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 hover:bg-accent/50 opacity-60 hover:opacity-100 ml-0.5 mr-1 flex-shrink-0"
                                onClick={(e: React.MouseEvent) => {
                                    e.stopPropagation(); 
                                    onShareFilter(filter.id);
                                }}
                                disabled={filter.isLoading}
                                aria-label={`Share folder ${filter.title}`}
                                >
                                {filter.isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Share2 className="h-3 w-3" />}
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                                Share Folder
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                  )}
                </div>
              ))}
            </TabsList>
          </Tabs>
          <ScrollBar orientation="horizontal" className="h-2"/>
        </ScrollArea>
        <div className="flex items-center pl-2 space-x-1 flex-shrink-0">
          <TooltipProvider delayDuration={100}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-9 w-9" onClick={onOpenCreateCloudChannelDialog} title="New Cloud Storage">
                  <CloudCog className="h-5 w-5" />
                  <span className="sr-only">New Cloud Storage</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>New Cloud Storage</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <TooltipProvider delayDuration={100}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-9 w-9" onClick={onAddFilterPlaceholder} title="Add Folder (Filter)">
                  <PlusSquare className="h-5 w-5" />
                  <span className="sr-only">Add Folder (Filter)</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Add Folder (Filter)</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <Button variant="outline" size="sm" onClick={onToggleReorderMode} className="h-9">
            {isReorderingMode ? <Check className="mr-1.5 h-4 w-4" /> : <Edit3 className="mr-1.5 h-4 w-4" />}
            {isReorderingMode ? "Done" : "Reorder"}
          </Button>
        </div>
      </div>
    </div>
  );
}
    
