
"use client";

import type { DialogFilter } from "@/types";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Loader2, ListFilter, Edit3, Share2, PlusSquare, Check, GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";

interface FolderTabsBarProps {
  filters: DialogFilter[];
  activeFilterId: number | null;
  onSelectFilter: (filterId: number) => void;
  isLoading: boolean;
  isReorderingMode: boolean;
  onToggleReorderMode: () => void;
  onMoveFilter: (dragIndex: number, hoverIndex: number) => void; // Placeholder
  onShareFilter: (filterId: number) => void;
  onAddFilterPlaceholder: () => void;
}

const ALL_CHATS_FILTER_ID = 0; 

export function FolderTabsBar({
  filters,
  activeFilterId,
  onSelectFilter,
  isLoading,
  isReorderingMode,
  onToggleReorderMode,
  onMoveFilter, // Not used yet, for future drag-and-drop
  onShareFilter,
  onAddFilterPlaceholder,
}: FolderTabsBarProps) {

  if (isLoading && filters.length <= 1) { // Show loading only if no or just "All Chats" filter exists
    return (
      <div className="flex items-center justify-center h-14 border-b px-4 bg-background sticky top-0 z-10 shadow-sm">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
        <span className="ml-2 text-sm text-muted-foreground">Loading folders...</span>
      </div>
    );
  }
  
  const displayFilters = [...filters];
  if (!displayFilters.some(f => f.id === ALL_CHATS_FILTER_ID)) {
      displayFilters.unshift({
          id: ALL_CHATS_FILTER_ID,
          title: "All Chats",
          _: 'dialogFilterDefault',
          flags: 0,
          include_peers: [],
      });
  }

  const currentTabValue = (activeFilterId !== null && displayFilters.some(f => f.id === activeFilterId))
                          ? activeFilterId.toString()
                          : ALL_CHATS_FILTER_ID.toString();

  // Placeholder for drag state
  const [draggedItem, setDraggedItem] = React.useState<DialogFilter | null>(null);

  const handleDragStart = (e: React.DragEvent<HTMLButtonElement>, filter: DialogFilter, index: number) => {
    if (!isReorderingMode || filter.id === ALL_CHATS_FILTER_ID) return;
    e.dataTransfer.setData('filterId', filter.id.toString());
    e.dataTransfer.setData('filterIndex', index.toString());
    setDraggedItem(filter);
    // console.log("Drag start:", filter.title);
  };

  const handleDragOver = (e: React.DragEvent<HTMLButtonElement>, index: number) => {
    e.preventDefault(); // Necessary to allow dropping
    if (!isReorderingMode || !draggedItem) return;
    const draggedIndex = filters.findIndex(f => f.id === draggedItem.id);
    if (draggedIndex !== index && filters[index].id !== ALL_CHATS_FILTER_ID) {
       // Visual feedback for drag over (e.g., border, background change) can be added here
    }
  };
  
  const handleDrop = (e: React.DragEvent<HTMLButtonElement>, dropIndex: number) => {
    e.preventDefault();
    if (!isReorderingMode || !draggedItem || filters[dropIndex].id === ALL_CHATS_FILTER_ID) {
      setDraggedItem(null);
      return;
    }
    const draggedFilterId = parseInt(e.dataTransfer.getData('filterId'), 10);
    const dragIndex = filters.findIndex(f => f.id === draggedFilterId);
    
    if (dragIndex !== -1 && dragIndex !== dropIndex) {
      onMoveFilter(dragIndex, dropIndex);
    }
    setDraggedItem(null);
    // console.log("Dropped", draggedItem?.title, "at index", dropIndex);
  };


  return (
    <div className="border-b sticky top-0 bg-background z-10 shadow-sm">
      <div className="flex items-center px-2 sm:px-3 h-14">
        <ScrollArea className="flex-grow whitespace-nowrap">
          <Tabs
            value={currentTabValue}
            onValueChange={(value) => {
              if (isReorderingMode) return; // Don't change tab in reordering mode
              const newFilterId = parseInt(value, 10);
              if (!isNaN(newFilterId)) {
                onSelectFilter(newFilterId);
              }
            }}
            className="w-max min-w-full"
          >
            <TabsList className="h-12 rounded-none border-none bg-transparent p-0 gap-0 sm:gap-1">
              {displayFilters.map((filter, index) => (
                <TooltipProvider key={filter.id} delayDuration={100}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <TabsTrigger
                        value={filter.id.toString()}
                        draggable={isReorderingMode && filter.id !== ALL_CHATS_FILTER_ID}
                        onDragStart={(e) => handleDragStart(e, filter, index)}
                        onDragOver={(e) => handleDragOver(e, index)}
                        onDrop={(e) => handleDrop(e, index)}
                        onDragEnd={() => setDraggedItem(null)}
                        className={cn(
                          "h-10 relative rounded-md px-2 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-sm hover:bg-muted/50 flex items-center gap-1.5",
                          isReorderingMode && filter.id !== ALL_CHATS_FILTER_ID && "tab-shake cursor-move",
                          isReorderingMode && filter.id === ALL_CHATS_FILTER_ID && "cursor-not-allowed opacity-70",
                          draggedItem?.id === filter.id && "opacity-50 border-2 border-dashed border-primary",
                          // Basic visual cue for drop target (can be improved)
                          // e.target.closest('button')?.getAttribute('data-value') === filter.id.toString() && draggedItem && draggedItem.id !== filter.id && "bg-primary/5" 
                        )}
                      >
                        {isReorderingMode && filter.id !== ALL_CHATS_FILTER_ID && <GripVertical className="h-4 w-4 mr-1 text-muted-foreground" />}
                        {filter.id === ALL_CHATS_FILTER_ID && !filter.emoticon && <ListFilter className="h-4 w-4" />}
                        {filter.emoticon && <span className="text-lg">{filter.emoticon}</span>}
                        <span className="truncate max-w-[120px] sm:max-w-xs">{filter.title}</span>
                        {!isReorderingMode && filter.id !== ALL_CHATS_FILTER_ID && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 ml-1 p-0 hover:bg-accent/50 opacity-60 hover:opacity-100"
                            onClick={(e) => {
                              e.stopPropagation();
                              onShareFilter(filter.id);
                            }}
                            disabled={filter.isLoading}
                          >
                            {filter.isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Share2 className="h-3 w-3" />}
                          </Button>
                        )}
                      </TabsTrigger>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{filter.title}</p>
                      {filter.inviteLink && <p className="text-xs text-muted-foreground">Link: {filter.inviteLink}</p>}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ))}
            </TabsList>
          </Tabs>
          <ScrollBar orientation="horizontal" className="h-2"/>
        </ScrollArea>
        <div className="flex items-center pl-2 space-x-1 flex-shrink-0">
          <Button variant="ghost" size="icon" className="h-9 w-9" onClick={onAddFilterPlaceholder}>
            <PlusSquare className="h-5 w-5" />
             <span className="sr-only">Add Folder</span>
          </Button>
          <Button variant="outline" size="sm" onClick={onToggleReorderMode} className="h-9">
            {isReorderingMode ? <Check className="mr-1.5 h-4 w-4" /> : <Edit3 className="mr-1.5 h-4 w-4" />}
            {isReorderingMode ? "Done" : "Reorder"}
          </Button>
        </div>
      </div>
    </div>
  );
}
