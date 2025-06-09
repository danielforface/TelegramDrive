
"use client";

import * as React from "react";
import type { CloudFile, CloudFolder, CloudChannelConfigV1, CloudChannelConfigEntry, InputPeer, MenuItemType, ClipboardItemType } from "@/types";
import { ContentFileItem } from "./content-file-item";
import { ContentFolderItem } from "./content-folder-item";
import { Button } from "@/components/ui/button";
import { Search, FolderOpen, Loader2, CalendarDays, XCircle as ClearIcon, UploadCloud, Cloud, FolderPlus, ArrowUpCircle, ChevronRight, FolderUp, ArrowLeftCircle, ClipboardPaste, Settings2, Globe, Info as InfoIcon } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { useState, useMemo, useEffect, useRef } from "react";
import { format, isToday, isYesterday, startOfDay, isSameDay, isSameMonth } from "date-fns";
import { parseVfsPathFromCaption, getEntriesForPath, normalizePath, getParentPath } from "@/lib/vfsUtils";
import { ContextMenu } from "@/components/context-menu";

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
  onDeleteFile: (file: CloudFile) => void;
  onDeleteVirtualFolder: (folderPath: string, folderName: string, parentInputPeer?: InputPeer) => void;
  selectedFolderInputPeer?: InputPeer | null;
  onCopyFile: (file: CloudFile) => void;
  onCopyFolderStructure?: (folderName: string, folderConfig: CloudChannelConfigEntry) => void;
  onPasteItem: (targetPath: string) => void;
  clipboardItem: ClipboardItemType;
  selectedFolderForView: CloudFolder | null;
  onOpenManageCloudChannelDialog: (channel: CloudFolder) => void;
  isGlobalView?: boolean;
  globalStatusMessage?: string | null; // For Global Drive loading status
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
  onCopyFile,
  onCopyFolderStructure,
  onPasteItem,
  clipboardItem,
  selectedFolderForView,
  onOpenManageCloudChannelDialog,
  isGlobalView = false,
  globalStatusMessage,
}: MainContentViewProps) {
  const [activeTab, setActiveTab] = useState("all");
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const mainContentRef = useRef<HTMLDivElement>(null);

  const [backgroundContextMenu, setBackgroundContextMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
    items: MenuItemType[];
  }>({ visible: false, x: 0, y: 0, items: [] });

  useEffect(() => {
    setActiveTab("all");
    setSelectedDate(undefined);
    setSearchTerm("");
  }, [folderName, isGlobalView, isCloudChannel]);


  const handleSearchButtonClick = () => {
    // Placeholder for search functionality
  };

  const handleBackgroundContextMenu = (event: React.MouseEvent) => {
    event.preventDefault();
    const clickedOnItem = (event.target as HTMLElement).closest('[data-file-item="true"]') || (event.target as HTMLElement).closest('[data-folder-item="true"]');

    if (clickedOnItem || (!isCloudChannel && !isGlobalView)) {
      setBackgroundContextMenu({ visible: false, x: 0, y: 0, items: [] });
      return;
    }

    const menuItems: MenuItemType[] = [];

    if (isCloudChannel && !isGlobalView) {
        menuItems.push({
            label: "Create New Folder Here",
            onClick: () => onOpenCreateVirtualFolderDialog(currentVirtualPath),
            icon: <FolderPlus className="w-3.5 h-3.5" />,
        });
        if (clipboardItem) {
          menuItems.push({
            label: `Paste ${clipboardItem.type === 'file' ? `"${clipboardItem.file.name}"` : `"${clipboardItem.folderName}"`}`,
            onClick: () => onPasteItem(currentVirtualPath),
            icon: <ClipboardPaste className="w-3.5 h-3.5" />,
          });
        }
        menuItems.push({
            label: "Go Up One Level",
            onClick: () => onNavigateVirtualPath(getParentPath(currentVirtualPath)),
            icon: <ArrowLeftCircle className="w-3.5 h-3.5" />,
            disabled: currentVirtualPath === '/',
        });
    }

    if(menuItems.length === 0) {
        setBackgroundContextMenu({ visible: false, x: 0, y: 0, items: [] });
        return;
    }

    setBackgroundContextMenu({
      visible: true,
      x: event.clientX,
      y: event.clientY,
      items: menuItems,
    });
  };

  const closeBackgroundContextMenu = () => {
    setBackgroundContextMenu({ ...backgroundContextMenu, visible: false });
  };


  const vfsItems = useMemo(() => {
    if (isGlobalView || !isCloudChannel || !cloudConfig) return [];

    const normalizedCurrentPath = normalizePath(currentVirtualPath);
    const folderEntriesFromConfig = getEntriesForPath(cloudConfig, normalizedCurrentPath);

    const displayedFolders: { type: 'folder'; name: string; entry: CloudChannelConfigEntry, itemCount: number }[] = [];
    if (folderEntriesFromConfig) {
      Object.entries(folderEntriesFromConfig).forEach(([name, entry]) => {
        if (entry.type === 'folder') {
          const virtualFolderPath = normalizePath(normalizedCurrentPath + name + '/');
          const subFoldersCount = Object.values(entry.entries || {}).filter(e => e.type === 'folder').length;
          const filesInThisVirtualFolderCount = files.filter(f => {
            const vfsPath = parseVfsPathFromCaption(f.caption);
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
        if (fileMessage.telegramMessage && (fileMessage.telegramMessage.media || (fileMessage.type !== 'unknown' && fileMessage.totalSizeInBytes && fileMessage.totalSizeInBytes > 0) || fileMessage.message)) {
             displayedFiles.push({ type: 'file', cloudFile: fileMessage });
        }
      }
    });

    return [
      ...displayedFolders.sort((a, b) => a.name.localeCompare(b.name)),
      ...displayedFiles.sort((a, b) => (b.cloudFile.timestamp || 0) - (a.cloudFile.timestamp || 0)),
    ];
  }, [isGlobalView, isCloudChannel, cloudConfig, files, currentVirtualPath]);


  const mediaFilesToDisplay = useMemo(() => {
    let processedFiles = files; // Start with all files passed to the component
    if (isGlobalView || isCloudChannel) {
      // For global or cloud view, tabs filtering is not based on file.type directly from raw list,
      // but rather on the already filtered `files` prop.
      // VFS items are already structured. Global view will present a flat list.
    } else { // Regular chat view specific filtering
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
    }

    if (selectedDate) {
      processedFiles = processedFiles.filter(file =>
        file.timestamp && isSameDay(new Date(file.timestamp * 1000), selectedDate)
      );
    }
    // Sorting is applied externally for global/cloud, internally for regular chat after filtering
    return selectedDate && !isGlobalView && !isCloudChannel ? processedFiles : processedFiles;
  }, [files, activeTab, selectedDate, isCloudChannel, isGlobalView]);


  if (!isGlobalView && !folderName) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-8">
        <FolderOpen className="w-20 h-20 mb-6 opacity-40" />
        <p className="text-xl font-medium">Select a chat to view its media.</p>
        <p className="text-sm">Use the button in the header or the placeholder above to choose a chat.</p>
      </div>
    );
  }

  const displayItems = isGlobalView ? mediaFilesToDisplay : (isCloudChannel ? vfsItems : mediaFilesToDisplay);

  const noResultsForFilter = !isGlobalView && !isCloudChannel && (activeTab !== "all" || selectedDate || searchTerm) && mediaFilesToDisplay.length === 0 && !isLoading;
  const noMediaAtAll = !isGlobalView && !isCloudChannel && activeTab === "all" && !selectedDate && !searchTerm && mediaFilesToDisplay.length === 0 && !isLoading && !hasMore;
  const noGlobalMedia = isGlobalView && mediaFilesToDisplay.length === 0 && !isLoading && !hasMore && !globalStatusMessage?.includes("Loading");


  let lastDisplayedDay: Date | null = null;
  let lastDisplayedMonth: Date | null = null;

  const renderBreadcrumbs = () => {
    if (isGlobalView || !isCloudChannel) return null;
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

  const mainItemsContent = () => {
    return (
      <div className="flex-grow overflow-y-auto space-y-0 pr-1 pb-4">
        {displayItems.length === 0 && !isLoading && !isLoadingMoreMedia ? (
            <div className="flex-grow flex flex-col items-center justify-center text-muted-foreground text-center py-10 h-full">
              <FolderOpen className="w-16 h-16 mb-4 opacity-50" />
              <p className="text-lg">
                  {isGlobalView ? "Global Drive is empty or still loading initial content." : "This folder is empty."}
              </p>
               {isGlobalView && globalStatusMessage && <p className="text-sm mt-2">{globalStatusMessage}</p>}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {displayItems.map((item, index) => {
                if (isCloudChannel && !isGlobalView && item.type === 'folder') {
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
                        folderConfigEntry={(item as any).entry}
                        itemCountOverride={(item as any).itemCount}
                        style={{ animationDelay: `${index * 30}ms` }}
                        onClick={() => onNavigateVirtualPath(normalizePath(currentVirtualPath + item.name + '/'))}
                        onDelete={() => onDeleteVirtualFolder(normalizePath(currentVirtualPath + item.name + '/'), item.name, selectedFolderInputPeer)}
                        onCreateFolderInside={() => onOpenCreateVirtualFolderDialog(normalizePath(currentVirtualPath + item.name + '/'))}
                        onCopyFolderStructure={onCopyFolderStructure}
                        isCloudChannelContext={true}
                      />
                  );
                } else {
                  const fileItem = (isCloudChannel && !isGlobalView) ? (item as any).cloudFile as CloudFile : item as CloudFile;
                  if (!fileItem || !fileItem.id) return null;

                  if (!fileItem.timestamp && !isGlobalView && !isCloudChannel) return null;

                  const fileDate = fileItem.timestamp ? new Date(fileItem.timestamp * 1000) : new Date();
                  let dayHeader = null;
                  let monthHeader = null;

                  if (!selectedDate && (!isGlobalView && !isCloudChannel)) {
                    if (!lastDisplayedMonth || !isSameMonth(fileDate, lastDisplayedMonth)) {
                      monthHeader = (
                        <div key={`month-${fileItem.id}`} className="col-span-full text-lg font-semibold text-primary py-3 mt-4 mb-2 border-b-2 border-primary/30">
                          {format(fileDate, "MMMM yyyy")}
                        </div>
                      );
                      lastDisplayedMonth = fileDate;
                      lastDisplayedDay = null;
                    }
                    if (!lastDisplayedDay || !isSameDay(fileDate, lastDisplayedDay)) {
                      let dayLabel = isToday(fileDate) ? "Today" : isYesterday(fileDate) ? "Yesterday" : format(fileDate, "eeee, MMMM d");
                      dayHeader = (
                        <div key={`day-${fileItem.id}`} className="col-span-full text-sm font-medium text-muted-foreground py-2 mt-2 mb-1 border-b border-border">
                          {dayLabel}
                        </div>
                      );
                      lastDisplayedDay = fileDate;
                    }
                  }
                  const itemRenderContent = (
                      <ContentFileItem
                        key={`file-${fileItem.id}-${activeTab}-${selectedDate ? format(selectedDate, "yyyy-MM-dd") : 'all'}-${index}`}
                        file={fileItem}
                        style={{ animationDelay: `${index * 30}ms` }}
                        onDetailsClick={onFileDetailsClick}
                        onQueueDownloadClick={onQueueDownloadClick}
                        onViewImageClick={onFileViewImageClick}
                        onPlayVideoClick={onFilePlayVideoClick}
                        isPreparingStream={isPreparingStream && preparingStreamForFileId === fileItem.id}
                        preparingStreamForFileId={preparingStreamForFileId}
                        onDeleteFile={() => onDeleteFile(fileItem)}
                        onCopyFile={onCopyFile}
                      />
                  );
                   return (
                      <React.Fragment key={`fragment-${fileItem.id}`}>
                        {monthHeader}
                        {dayHeader}
                        {itemRenderContent}
                      </React.Fragment>
                    );
                }
              }
              )}
            </div>
          )}

        {isLoadingMoreMedia && displayItems.length > 0 && (
          <div className="flex justify-center items-center p-4 mt-4">
            <Loader2 className="animate-spin h-8 w-8 text-primary" />
            <p className="ml-3 text-muted-foreground">Loading more content...</p>
          </div>
        )}
        {!isLoading && !isLoadingMoreMedia && hasMore && displayItems.length > 0 && onLoadMoreMedia && (
          <div className="col-span-full flex justify-center py-4 mt-4">
            <Button onClick={onLoadMoreMedia} disabled={isLoadingMoreMedia || isLoading} variant="outline">
              {(isLoadingMoreMedia || isLoading) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Load More
            </Button>
          </div>
        )}
        {!isLoading && !isLoadingMoreMedia && !hasMore && displayItems.length > 0 && (
          <p className="text-center text-sm text-muted-foreground py-4 mt-4">No more content to load.</p>
        )}
      </div>
    );
  };


  return (
    <div
      ref={mainContentRef}
      className="space-y-4 h-full flex flex-col p-1 md:p-2 lg:p-4 relative"
      onContextMenu={handleBackgroundContextMenu}
    >
      <div className="flex-shrink-0">
          <div className="flex justify-between items-center border-b pb-2 mb-1">
            <h1 className="text-3xl font-bold text-primary flex items-center">
                {isGlobalView ? <Globe className="w-8 h-8 mr-3 text-primary/80" /> : (isCloudChannel ? <Cloud className="w-8 h-8 mr-3 text-primary/80" /> : null)}
                {folderName}
            </h1>
            {isGlobalView && globalStatusMessage && (
              <div className="text-xs text-muted-foreground flex items-center bg-secondary px-3 py-1.5 rounded-full">
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <InfoIcon className="h-4 w-4 mr-2 text-primary/70" />}
                <span>{globalStatusMessage}</span>
              </div>
            )}
          </div>
          {renderBreadcrumbs()}
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-3 items-center flex-wrap flex-shrink-0">
         {isCloudChannel && !isGlobalView && selectedFolderForView ? (
           <>
             {currentVirtualPath !== '/' && (
               <Button variant="outline" onClick={() => onNavigateVirtualPath(getParentPath(currentVirtualPath))} className="w-full sm:w-auto">
                 <FolderUp className="mr-2 h-4 w-4" /> Up One Level
               </Button>
             )}
             <Button variant="outline" onClick={onOpenUploadDialog} className="w-full sm:w-auto">
              <UploadCloud className="mr-2 h-4 w-4" /> Upload File
            </Button>
             <Button variant="outline" onClick={() => onOpenCreateVirtualFolderDialog(currentVirtualPath)} className="w-full sm:w-auto">
              <FolderPlus className="mr-2 h-4 w-4" /> Create Folder
            </Button>
            <Button variant="outline" onClick={() => onOpenManageCloudChannelDialog(selectedFolderForView)} className="w-full sm:w-auto">
              <Settings2 className="mr-2 h-4 w-4" /> Manage Channel
            </Button>
           </>
         ) : !isGlobalView ? (
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
         ) : null }
        {( !isGlobalView && !isCloudChannel) ? ( // Removed "|| isGlobalView" to hide tabs in global view for now
          <>
            <div className="flex-grow"></div> {}
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
        ) : null}
      </div>

      {isLoading && displayItems.length === 0 && !globalStatusMessage?.includes("complete") ? (
          <div className="flex-grow flex flex-col items-center justify-center text-muted-foreground text-center h-full">
              <Loader2 className="animate-spin h-12 w-12 text-primary mb-4" />
              <p className="text-lg">
                {isGlobalView && globalStatusMessage ? globalStatusMessage : (isCloudChannel ? "Loading cloud storage contents..." : "Loading media...")}
              </p>
          </div>
      ) : noResultsForFilter ? (
        <div className="flex-grow flex flex-col items-center justify-center text-muted-foreground text-center h-full">
          <FolderOpen className="w-16 h-16 mb-4 opacity-50" />
          <p className="text-lg">
            No media items found for the current filter
            {activeTab !== "all" ? ` in "${TABS_CONFIG.find(t=>t.value === activeTab)?.label}"` : ""}
            {selectedDate ? ` on ${format(selectedDate, "PPP")}` : ""}.
          </p>
        </div>
      ) : noMediaAtAll ? (
         <div className="flex-grow flex flex-col items-center justify-center text-muted-foreground text-center h-full">
          <FolderOpen className="w-16 h-16 mb-4 opacity-50" />
          <p className="text-lg">This chat contains no media items.</p>
        </div>
      ) : noGlobalMedia && isGlobalView ? (
         <div className="flex-grow flex flex-col items-center justify-center text-muted-foreground text-center h-full">
          <FolderOpen className="w-16 h-16 mb-4 opacity-50" />
          <p className="text-lg">Global Drive is empty or content is still loading.</p>
          {globalStatusMessage && <p className="text-sm mt-2">{globalStatusMessage}</p>}
        </div>
      ): mainItemsContent() }

      {backgroundContextMenu.visible && (
        <ContextMenu
          x={backgroundContextMenu.x}
          y={backgroundContextMenu.y}
          items={backgroundContextMenu.items}
          onClose={closeBackgroundContextMenu}
          confiningElementRef={mainContentRef}
        />
      )}
    </div>
  );
}

