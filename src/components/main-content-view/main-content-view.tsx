
"use client";

import * as React from "react";
import type { CloudFile } from "@/types";
import { ContentFileItem } from "./content-file-item";
import { Button } from "@/components/ui/button";
import { Search, FolderOpen, Loader2, CalendarDays, XCircle as ClearIcon, UploadCloud } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { useState, useMemo, useEffect } from "react";
import { format, isToday, isYesterday, startOfDay, isSameDay, isSameMonth } from "date-fns";

interface MainContentViewProps {
  folderName: string | null;
  files: CloudFile[];
  isLoading: boolean; // For initial load or when files array is empty
  isLoadingMoreMedia?: boolean; // Specifically for the "load more" button state
  hasMore: boolean;
  onFileDetailsClick: (file: CloudFile) => void;
  onQueueDownloadClick: (file: CloudFile) => void;
  onFileViewImageClick: (file: CloudFile) => void;
  onFilePlayVideoClick: (file: CloudFile) => void;
  onOpenUploadDialog: () => void; 
  isPreparingStream?: boolean;
  preparingStreamForFileId?: string | null;
  onLoadMoreMedia?: () => void; // Callback for the "Load More" button
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
  isLoadingMoreMedia,
  hasMore,
  onFileDetailsClick,
  onQueueDownloadClick,
  onFileViewImageClick,
  onFilePlayVideoClick,
  onOpenUploadDialog,
  isPreparingStream,
  preparingStreamForFileId,
  onLoadMoreMedia, 
}: MainContentViewProps) {
  const [activeTab, setActiveTab] = useState("all");
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");


  useEffect(() => {
    setActiveTab("all");
    setSelectedDate(undefined);
    setSearchTerm(""); 
  }, [folderName]);

  const handleSearchButtonClick = () => {
    console.log("Search button clicked. Dialog to be implemented.");
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

  const displayedAndPossiblyFilteredFiles = useMemo(() => {
    let processedFiles = filteredByTypeFiles;

    if (selectedDate) {
      processedFiles = processedFiles.filter(file =>
        file.timestamp && isSameDay(new Date(file.timestamp * 1000), selectedDate)
      );
    }
    
    if (!selectedDate) { 
        return processedFiles.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    }
    return processedFiles; 
  }, [filteredByTypeFiles, selectedDate]);


  if (!folderName) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-8">
        <FolderOpen className="w-20 h-20 mb-6 opacity-40" />
        <p className="text-xl font-medium">Select a chat to view its media.</p>
        <p className="text-sm">Use the button in the header or the placeholder above to choose a chat.</p>
      </div>
    );
  }

  const displayFiles = displayedAndPossiblyFilteredFiles;
  const noResultsForFilter = (activeTab !== "all" || selectedDate || searchTerm) && displayFiles.length === 0 && !isLoading;
  const noMediaAtAll = activeTab === "all" && !selectedDate && !searchTerm && displayFiles.length === 0 && !isLoading && !hasMore;

  let lastDisplayedDay: Date | null = null;
  let lastDisplayedMonth: Date | null = null;


  return (
    <div className="space-y-4 h-full flex flex-col p-1 md:p-2 lg:p-4">
      <div className="flex-shrink-0">
        <h1 className="text-3xl font-bold text-primary mb-3 pb-2 border-b">{folderName}</h1>
        <div className="flex flex-col sm:flex-row gap-3 mb-3 items-center flex-wrap">
          <Button variant="outline" onClick={handleSearchButtonClick} className="w-full sm:w-auto">
            <Search className="mr-2 h-4 w-4" /> Search
          </Button>

          <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
            <PopoverTrigger asChild>
              <Button
                variant={"outline"}
                className="w-full sm:w-auto justify-start text-left font-normal min-w-[200px]"
              >
                <CalendarDays className="mr-2 h-4 w-4" />
                {selectedDate ? format(selectedDate, "PPP") : <span>Filter by date</span>}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={(date) => {
                    setSelectedDate(date || undefined);
                    setIsCalendarOpen(false);
                }}
                initialFocus
              />
            </PopoverContent>
          </Popover>
          {selectedDate && (
            <Button variant="ghost" size="icon" onClick={() => setSelectedDate(undefined)} title="Clear date filter">
              <ClearIcon className="h-5 w-5 text-muted-foreground hover:text-destructive" />
            </Button>
          )}
           <Button variant="outline" onClick={onOpenUploadDialog} className="w-full sm:w-auto">
            <UploadCloud className="mr-2 h-4 w-4" /> Upload File
          </Button>

          <div className="flex-grow"></div> {/* Spacer */}
          <Tabs defaultValue="all" onValueChange={setActiveTab} value={activeTab} className="w-full sm:w-auto">
            <TabsList className="grid w-full grid-cols-3 sm:grid-cols-none sm:inline-flex h-auto">
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
      ) : noResultsForFilter ? (
        <div className="flex-grow flex flex-col items-center justify-center text-muted-foreground text-center">
          <FolderOpen className="w-16 h-16 mb-4 opacity-50" />
          <p className="text-lg">
            No media items found for the current filter
            {activeTab !== "all" ? ` in "${TABS_CONFIG.find(t=>t.value === activeTab)?.label}"` : ""}
            {selectedDate ? ` on ${format(selectedDate, "PPP")}` : ""}.
          </p>
        </div>
      ) : noMediaAtAll ? (
         <div className="flex-grow flex flex-col items-center justify-center text-muted-foreground text-center">
          <FolderOpen className="w-16 h-16 mb-4 opacity-50" />
          <p className="text-lg">This chat contains no media items.</p>
        </div>
      ) : (
        <div className="flex-grow overflow-y-auto space-y-0 pr-1 pb-4">
          {displayFiles.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {displayFiles.map((file, index) => {
                if (!file.timestamp) return null; 
                const fileDate = new Date(file.timestamp * 1000);
                let dayHeader = null;
                let monthHeader = null;

                if (!selectedDate) { 
                  if (!lastDisplayedMonth || !isSameMonth(fileDate, lastDisplayedMonth)) {
                    monthHeader = (
                      <div key={`month-${file.id}`} className="col-span-full text-lg font-semibold text-primary py-3 mt-4 mb-2 border-b-2 border-primary/30">
                        {format(fileDate, "MMMM yyyy")}
                      </div>
                    );
                    lastDisplayedMonth = fileDate;
                    lastDisplayedDay = null; 
                  }

                  if (!lastDisplayedDay || !isSameDay(fileDate, lastDisplayedDay)) {
                    let dayLabel;
                    if (isToday(fileDate)) dayLabel = "Today";
                    else if (isYesterday(fileDate)) dayLabel = "Yesterday";
                    else dayLabel = format(fileDate, "eeee, MMMM d");

                    dayHeader = (
                      <div key={`day-${file.id}`} className="col-span-full text-sm font-medium text-muted-foreground py-2 mt-2 mb-1 border-b border-border">
                        {dayLabel}
                      </div>
                    );
                    lastDisplayedDay = fileDate;
                  }
                }
                
                const itemContent = (
                  <ContentFileItem
                    key={`${file.id}-${activeTab}-${selectedDate ? format(selectedDate, "yyyy-MM-dd") : 'all'}-${index}`}
                    file={file}
                    style={{ animationDelay: `${index * 30}ms` }}
                    onDetailsClick={onFileDetailsClick} 
                    onQueueDownloadClick={onQueueDownloadClick}
                    onViewImageClick={onFileViewImageClick}
                    onPlayVideoClick={onFilePlayVideoClick}
                    isPreparingStream={isPreparingStream && preparingStreamForFileId === file.id}
                    preparingStreamForFileId={preparingStreamForFileId}
                  />
                );
                
                return (
                  <React.Fragment key={`fragment-${file.id}`}>
                    {monthHeader}
                    {dayHeader}
                    {/* Wrapper div for ref is removed, button handles load more */}
                    {itemContent}
                  </React.Fragment>
                );
              })}
            </div>
          ) : (
             <div className="flex-grow flex flex-col items-center justify-center text-muted-foreground text-center">
                <FolderOpen className="w-16 h-16 mb-4 opacity-50" />
                <p className="text-lg">No media items to display for the current selection.</p>
             </div>
          )}
          {isLoadingMoreMedia && displayFiles.length > 0 && ( // Use isLoadingMoreMedia for button spinner
            <div className="flex justify-center items-center p-4 mt-4">
              <Loader2 className="animate-spin h-8 w-8 text-primary" />
              <p className="ml-3 text-muted-foreground">Loading more media...</p>
            </div>
          )}
          {!isLoading && !isLoadingMoreMedia && hasMore && displayFiles.length > 0 && !selectedDate && onLoadMoreMedia && (
            <div className="col-span-full flex justify-center py-4 mt-4">
              <Button
                onClick={onLoadMoreMedia}
                disabled={isLoadingMoreMedia}
                variant="outline"
              >
                {isLoadingMoreMedia ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Load More Media
              </Button>
            </div>
          )}
          {!isLoading && !isLoadingMoreMedia && !hasMore && displayFiles.length > 0 && (
             <p className="text-center text-sm text-muted-foreground py-4 mt-4">No more media to load for the current filter.</p>
          )}
        </div>
      )}
    </div>
  );
}


    