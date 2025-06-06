
"use client";

import * as React from "react";
import type { CloudFile, CloudFolder, CloudChannelConfigV1, CloudChannelConfigEntry, InputPeer } from "@/types";
import { ContentFileItem } from "./content-file-item";
import { ContentFolderItem } from "./content-folder-item";
import { Button } from "@/components/ui/button";
import { Search, FolderOpen, Loader2, CalendarDays, XCircle as ClearIcon, UploadCloud, Cloud, FolderPlus, ArrowUpCircle, ChevronRight, MoreVertical, FolderUp, FolderPlus as CreateFolderIcon, ArrowLeftCircle, Trash2 } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { useState, useMemo, useEffect } from "react";
import { format, isToday, isYesterday, startOfDay, isSameDay, isSameMonth } from "date-fns";
import { parseVfsPathFromCaption, getEntriesForPath, normalizePath, getParentPath } from "@/lib/vfsUtils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface MainContentViewProps {
  folderName: string | null;
  files: CloudFile[];
  isLoading: boolean;
  isLoadingMoreMedia?: boolean;
  hasMore: boolean;
  onFileDetailsClick: (file: CloudFile) => void;
  onQueueDownloadClick: (file: CloudFile) => void;
  onFileViewImageClick: (file: CloudFile) => void;
  onFilePlayVideoClick: (file: CloudFile) => void;
  onOpenUploadDialog: () => void;
  isPreparingStream?: boolean;
  preparingStreamForFileId?: string | null;
  onLoadMoreMedia?: () => void;
  isCloudChannel: boolean;
  cloudConfig?: CloudChannelConfigV1 | null;
  currentVirtualPath: string;
  onNavigateVirtualPath: (path: string) => void;
  onOpenCreateVirtualFolderDialog: (parentPath: string) => void;
  onDeleteFile: (file: CloudFile) => void; // New prop
  onDeleteVirtualFolder: (folderPath: string, folderName: string, parentInputPeer?: InputPeer) => void; // New prop
  selectedFolderInputPeer?: InputPeer | null; // New prop
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
const IDENTIFICATION_MESSAGE_ID = 2;
const CONFIG_MESSAGE_ID = 3;

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
  isCloudChannel,
  cloudConfig,
  currentVirtualPath,
  onNavigateVirtualPath,
  onOpenCreateVirtualFolderDialog,
  onDeleteFile,
  onDeleteVirtualFolder,
  selectedFolderInputPeer,
}: MainContentViewProps) {
  const [activeTab, setActiveTab] = useState("all");
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");


  useEffect(() => {
    if (!isCloudChannel) {
        setActiveTab("all");
        setSelectedDate(undefined);
        setSearchTerm("");
    }
  }, [folderName, isCloudChannel]);


  const handleSearchButtonClick = () => {
    // Search functionality to be implemented
  };

  const vfsItems = useMemo(() => {
    if (!isCloudChannel || !cloudConfig) return [];

    const normalizedCurrentPath = normalizePath(currentVirtualPath);
    const folderEntriesFromConfig = getEntriesForPath(cloudConfig, normalizedCurrentPath);

    const displayedFolders: { type: 'folder'; name: string; entry: CloudChannelConfigEntry, itemCount: number }[] = [];
    if (folderEntriesFromConfig) {
      Object.entries(folderEntriesFromConfig).forEach(([name, entry]) => {
        if (entry.type === 'folder') {
          const virtualFolderPath = normalizePath(normalizedCurrentPath + name + '/'); // Ensure trailing slash for matching
          const subFoldersCount = Object.values(entry.entries || {}).filter(e => e.type === 'folder').length;
          const filesInThisVirtualFolderCount = files.filter(f => {
            const vfsPath = parseVfsPathFromCaption(f.caption);
            // Ensure exact match for folder path, not just prefix
            return vfsPath === virtualFolderPath && f.messageId !== CONFIG_MESSAGE_ID && f.messageId !== IDENTIFICATION_MESSAGE_ID;
          }).length;
          const totalVirtualItems = subFoldersCount + filesInThisVirtualFolderCount;
          displayedFolders.push({ type: 'folder', name, entry, itemCount: totalVirtualItems });
        }
      });
    }

    const displayedFiles: { type: 'file'; cloudFile: CloudFile }[] = [];
    files.forEach(fileMessage => {
      const vfsPath = parseVfsPathFromCaption(fileMessage.caption);
      if (vfsPath === normalizedCurrentPath) {
        if (fileMessage.messageId === CONFIG_MESSAGE_ID || fileMessage.messageId === IDENTIFICATION_MESSAGE_ID) {
            return;
        }
        if (fileMessage.telegramMessage && (fileMessage.telegramMessage.media || (fileMessage.type !== 'unknown' && fileMessage.totalSizeInBytes && fileMessage.totalSizeInBytes > 0))) {
             displayedFiles.push({ type: 'file', cloudFile: fileMessage });
        }
      }
    });

    return [
      ...displayedFolders.sort((a, b) => a.name.localeCompare(b.name)),
      ...displayedFiles.sort((a, b) => a.cloudFile.name.localeCompare(b.cloudFile.name)),
    ];
  }, [isCloudChannel, cloudConfig, files, currentVirtualPath]);


  const regularChatFiles = useMemo(() => {
    if (isCloudChannel || !files) return [];
    let processedFiles = files;
    switch (activeTab) {
      case "images":
        processedFiles = files.filter(file => file.type === 'image');
        break;
      case "videos":
        processedFiles = files.filter(file => file.type === 'video');
        break;
      case "documents":
        processedFiles = files.filter(file =>
          file.type === 'document' &&
          DOCUMENT_EXTENSIONS.some(ext => file.name.toLowerCase().endsWith(ext))
        );
        break;
      case "music":
        processedFiles = files.filter(file => file.type === 'audio');
        break;
      case "other":
        processedFiles = files.filter(file =>
          file.type === 'document' &&
          !DOCUMENT_EXTENSIONS.some(ext => file.name.toLowerCase().endsWith(ext))
        );
        break;
      case "all":
      default:
        break;
    }

    if (selectedDate) {
      processedFiles = processedFiles.filter(file =>
        file.timestamp && isSameDay(new Date(file.timestamp * 1000), selectedDate)
      );
    }
    return selectedDate ? processedFiles : processedFiles.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  }, [files, activeTab, selectedDate, isCloudChannel]);


  if (!folderName) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-8">
        <FolderOpen className="w-20 h-20 mb-6 opacity-40" />
        <p className="text-xl font-medium">Select a chat to view its media.</p>
        <p className="text-sm">Use the button in the header or the placeholder above to choose a chat.</p>
      </div>
    );
  }

  const displayItemsRegular = regularChatFiles;
  const noResultsForFilter = !isCloudChannel && (activeTab !== "all" || selectedDate || searchTerm) && displayItemsRegular.length === 0 && !isLoading;
  const noMediaAtAll = !isCloudChannel && activeTab === "all" && !selectedDate && !searchTerm && displayItemsRegular.length === 0 && !isLoading && !hasMore;

  let lastDisplayedDay: Date | null = null;
  let lastDisplayedMonth: Date | null = null;

  const renderBreadcrumbs = () => {
    const pathSegments = currentVirtualPath.split('/').filter(s => s.length > 0);
    return (
      <div className="flex items-center text-sm text-muted-foreground mb-3 flex-wrap">
        <Button variant="link" className="p-0 h-auto hover:text-primary" onClick={() => onNavigateVirtualPath('/')}>
          Root
        </Button>
        {pathSegments.map((segment, index) => {
          const pathOnClick = normalizePath(pathSegments.slice(0, index + 1).join('/'));
          return (
            <React.Fragment key={segment + index}>
              <ChevronRight className="w-4 h-4 mx-1" />
              <Button
                variant="link"
                className="p-0 h-auto hover:text-primary"
                onClick={() => onNavigateVirtualPath(pathOnClick)}
              >
                {segment}
              </Button>
            </React.Fragment>
          );
        })}
      </div>
    );
  };

  const mainContent = (
    <div className="flex-grow overflow-y-auto space-y-0 pr-1 pb-4">
      {isCloudChannel ? (
        // Cloud Channel VFS View
        vfsItems.length === 0 && !isLoading ? (
          <div className="flex-grow flex flex-col items-center justify-center text-muted-foreground text-center py-10">
            <FolderOpen className="w-16 h-16 mb-4 opacity-50" />
            <p className="text-lg">This folder is empty.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {vfsItems.map((item, index) => {
              if (item.type === 'folder') {
                const syntheticFolder: CloudFolder = {
                  id: item.name,
                  name: item.name,
                  files: [],
                  folders: [],
                  isAppManagedCloud: true,
                  vfsPath: normalizePath(currentVirtualPath + item.name + '/')
                };
                return (
                    <ContentFolderItem
                      key={`vfs-folder-${item.name}-${index}`}
                      folder={syntheticFolder}
                      itemCountOverride={item.itemCount}
                      style={{ animationDelay: `${index * 30}ms` }}
                      onClick={() => onNavigateVirtualPath(normalizePath(currentVirtualPath + item.name + '/'))}
                      onDelete={() => onDeleteVirtualFolder(normalizePath(currentVirtualPath + item.name + '/'), item.name, selectedFolderInputPeer)}
                      onCreateFolderInside={() => onOpenCreateVirtualFolderDialog(normalizePath(currentVirtualPath + item.name + '/'))}
                      isCloudChannelContext={true}
                    />
                );
              } else if (item.type === 'file') {
                return (
                    <ContentFileItem
                      key={`vfs-file-${item.cloudFile.id}-${index}`}
                      file={item.cloudFile}
                      style={{ animationDelay: `${index * 30}ms` }}
                      onDetailsClick={onFileDetailsClick}
                      onQueueDownloadClick={onQueueDownloadClick}
                      onViewImageClick={onFileViewImageClick}
                      onPlayVideoClick={onFilePlayVideoClick}
                      isPreparingStream={isPreparingStream && preparingStreamForFileId === item.cloudFile.id}
                      preparingStreamForFileId={preparingStreamForFileId}
                      onDeleteFile={() => onDeleteFile(item.cloudFile)}
                    />
                );
              }
              return null;
            })}
          </div>
        )
      ) : (
        // Regular Chat Media View
        displayItemsRegular.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {displayItemsRegular.map((file, index) => {
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
                  let dayLabel = isToday(fileDate) ? "Today" : isYesterday(fileDate) ? "Yesterday" : format(fileDate, "eeee, MMMM d");
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
                    onDeleteFile={() => onDeleteFile(file)}
                  />
              );
              return (
                <React.Fragment key={`fragment-${file.id}`}>
                  {monthHeader}
                  {dayHeader}
                  {itemContent}
                </React.Fragment>
              );
            })}
          </div>
        ) : (
           <div className="flex-grow flex flex-col items-center justify-center text-muted-foreground text-center py-10">
              <FolderOpen className="w-16 h-16 mb-4 opacity-50" />
              <p className="text-lg">No media items to display for the current selection.</p>
           </div>
        )
      )}

      {/* Loading Indicators for both views */}
      {isLoadingMoreMedia && (isCloudChannel ? vfsItems.length > 0 : displayItemsRegular.length > 0) && (
        <div className="flex justify-center items-center p-4 mt-4">
          <Loader2 className="animate-spin h-8 w-8 text-primary" />
          <p className="ml-3 text-muted-foreground">Loading more content...</p>
        </div>
      )}
      {!isLoading && !isLoadingMoreMedia && hasMore && (isCloudChannel ? vfsItems.length > 0 : displayItemsRegular.length > 0) && onLoadMoreMedia && (
        <div className="col-span-full flex justify-center py-4 mt-4">
          <Button onClick={onLoadMoreMedia} disabled={isLoadingMoreMedia} variant="outline">
            {isLoadingMoreMedia && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Load More
          </Button>
        </div>
      )}
      {!isLoading && !isLoadingMoreMedia && !hasMore && (isCloudChannel ? vfsItems.length > 0 : displayItemsRegular.length > 0) && (
        <p className="text-center text-sm text-muted-foreground py-4 mt-4">No more content to load.</p>
      )}
    </div>
  );


  const viewContent = (
    <div className="space-y-4 h-full flex flex-col p-1 md:p-2 lg:p-4">
      <div className="flex-shrink-0">
          <h1 className="text-3xl font-bold text-primary mb-1 pb-2 border-b flex items-center">
              {isCloudChannel ? <Cloud className="w-8 h-8 mr-3 text-primary/80" /> : null}
              {folderName}
          </h1>
          {isCloudChannel && renderBreadcrumbs()}
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-3 items-center flex-wrap flex-shrink-0">
         {isCloudChannel ? (
           <>
             {currentVirtualPath !== '/' && (
               <Button variant="outline" onClick={() => onNavigateVirtualPath(getParentPath(currentVirtualPath))} className="w-full sm:w-auto">
                 <FolderUp className="mr-2 h-4 w-4" /> Up
               </Button>
             )}
             <Button variant="outline" onClick={onOpenUploadDialog} className="w-full sm:w-auto">
              <UploadCloud className="mr-2 h-4 w-4" /> Upload File
            </Button>
             <Button variant="outline" onClick={() => onOpenCreateVirtualFolderDialog(currentVirtualPath)} className="w-full sm:w-auto">
              <FolderPlus className="mr-2 h-4 w-4" /> Create Folder
            </Button>
           </>
         ) : (
            <>
              <Button variant="outline" onClick={handleSearchButtonClick} className="w-full sm:w-auto">
                <Search className="mr-2 h-4 w-4" /> Search
              </Button>
              <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
                <PopoverTrigger asChild>
                  <Button variant={"outline"} className="w-full sm:w-auto justify-start text-left font-normal min-w-[200px]">
                    <CalendarDays className="mr-2 h-4 w-4" />
                    {selectedDate ? format(selectedDate, "PPP") : <span>Filter by date</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={selectedDate} onSelect={(date) => { setSelectedDate(date || undefined); setIsCalendarOpen(false); }} initialFocus />
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
            </>
         )}
        {!isCloudChannel && (
          <>
            <div className="flex-grow"></div>
            <Tabs defaultValue="all" onValueChange={setActiveTab} value={activeTab} className="w-full sm:w-auto">
              <TabsList className="grid w-full grid-cols-3 sm:grid-cols-none sm:inline-flex h-auto">
                {TABS_CONFIG.map(tab => (
                  <TabsTrigger key={tab.value} value={tab.value} className="px-3 py-1.5 text-xs sm:text-sm">
                    {tab.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </>
        )}
      </div>

      {isLoading && (isCloudChannel ? vfsItems.length === 0 : displayItemsRegular.length === 0) ? (
          <div className="flex-grow flex flex-col items-center justify-center text-muted-foreground text-center">
              <Loader2 className="animate-spin h-12 w-12 text-primary mb-4" />
              <p className="text-lg">{isCloudChannel ? "Loading cloud storage contents..." : "Loading media..."}</p>
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
      ) : mainContent }
    </div>
  );

  if (isCloudChannel) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          {viewContent}
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-56">
          <DropdownMenuItem onClick={() => onOpenCreateVirtualFolderDialog(currentVirtualPath)}>
            <CreateFolderIcon className="mr-2 h-4 w-4" />
            <span>Create New Folder Here</span>
          </DropdownMenuItem>
          {currentVirtualPath !== '/' && (
            <DropdownMenuItem onClick={() => onNavigateVirtualPath(getParentPath(currentVirtualPath))}>
              <ArrowLeftCircle className="mr-2 h-4 w-4" />
              <span>Go Up One Level</span>
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return viewContent; // For regular chats, no background context menu
}

    