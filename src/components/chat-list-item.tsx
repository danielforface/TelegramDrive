
"use client";
import React from 'react';
import type { CloudFolder } from "@/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MessageSquare, Users } from "lucide-react";

interface ChatListItemProps {
  folder: CloudFolder;
  isSelected: boolean;
  onSelect: () => void;
}

export const ChatListItem = React.forwardRef<HTMLLIElement, ChatListItemProps>(
  ({ folder, isSelected, onSelect }, ref) => {
    const Icon = folder.name.toLowerCase().includes("group") || folder.name.toLowerCase().includes("channel") 
                 ? Users 
                 : MessageSquare;

    return (
      <li ref={ref} className="animate-item-enter" style={{ animationDelay: '50ms' }}>
        <Button
          variant={isSelected ? "secondary" : "ghost"}
          className={cn(
            "w-full justify-start text-left h-auto py-2.5 px-3", // Increased padding slightly
            isSelected && "font-semibold bg-primary/10 text-primary"
          )}
          onClick={onSelect}
          title={folder.name}
        >
          <Icon className="mr-3 h-5 w-5 flex-shrink-0" />
          <span className="truncate flex-grow text-sm">{folder.name}</span>
        </Button>
      </li>
    );
  }
);

ChatListItem.displayName = "ChatListItem";
