
"use client";
import React from 'react';
import type { CloudFolder } from "@/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MessageSquare, Users, Zap } from "lucide-react"; // Example icons

interface SidebarNavItemProps {
  folder: CloudFolder;
  isSelected: boolean;
  onSelect: () => void;
}

// ForwardRef correctly typed for an HTMLLIElement
export const SidebarNavItem = React.forwardRef<HTMLLIElement, SidebarNavItemProps>(
  ({ folder, isSelected, onSelect }, ref) => {
    // Simple logic for icon based on name, can be expanded
    const Icon = folder.name.toLowerCase().includes("group") || folder.name.toLowerCase().includes("channel") 
                 ? Users 
                 : MessageSquare;

    return (
      <li ref={ref} className="animate-item-enter" style={{ animationDelay: '50ms' /* Basic delay */ }}>
        <Button
          variant={isSelected ? "secondary" : "ghost"}
          className={cn(
            "w-full justify-start text-left h-auto py-2 px-3",
            isSelected && "font-semibold"
          )}
          onClick={onSelect}
          title={folder.name}
        >
          <Icon className="mr-2 h-4 w-4 flex-shrink-0" />
          <span className="truncate flex-grow">{folder.name}</span>
          {/* You can add a badge for unread count or file count later if needed */}
          {/* <Badge variant="outline" className="ml-auto text-xs">{folder.files.length + folder.folders.length}</Badge> */}
        </Button>
      </li>
    );
  }
);

SidebarNavItem.displayName = "SidebarNavItem";

    