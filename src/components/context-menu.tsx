
"use client";

import React, { useState, useRef, useEffect, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import type { MenuItemType } from '@/types';

interface ContextMenuProps {
  x: number;
  y: number;
  items: MenuItemType[];
  onClose: () => void;
  className?: string;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({ x, y, items, onClose, className }) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({
    position: 'absolute',
    top: y, // Initial tentative position
    left: x, // Initial tentative position
    visibility: 'hidden', // Initially hidden
  });

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  useEffect(() => {
    if (menuRef.current) {
      const menuWidth = menuRef.current.offsetWidth;
      const menuHeight = menuRef.current.offsetHeight;
      const screenWidth = window.innerWidth;
      const screenHeight = window.innerHeight;

      let finalLeft = x; // Start with prop x (cursor position)
      let finalTop = y;  // Start with prop y (cursor position)

      // Adjust if going off right edge
      if (x + menuWidth > screenWidth) {
        finalLeft = screenWidth - menuWidth - 5; // Place 5px from right screen edge
      }
      // Adjust if going off bottom edge
      if (y + menuHeight > screenHeight) {
        finalTop = screenHeight - menuHeight - 5; // Place 5px from bottom screen edge
      }
      // Adjust if going off left edge (can happen if menu is wider than x or shifted by right edge adjustment)
      if (finalLeft < 5) {
        finalLeft = 5; // Place 5px from left screen edge
      }
      // Adjust if going off top edge
      if (finalTop < 5) {
        finalTop = 5; // Place 5px from top screen edge
      }

      setMenuStyle({
        position: 'absolute',
        top: finalTop,
        left: finalLeft,
        visibility: 'visible', // Make visible now that position is calculated
      });
    }
    // If menuRef.current is null (e.g., first render pass before ref is attached),
    // menuStyle remains { visibility: 'hidden' }. The effect will run again once the ref is available.
  }, [x, y, items]); // Rerun when x, y, or items (which affects menu size) change

  return (
    <div
      ref={menuRef}
      style={menuStyle}
      className={cn(
        "bg-popover text-popover-foreground border border-border rounded-md shadow-lg p-0.5 min-w-[160px] z-50", // Base styles
        className // Allow overriding via prop
      )}
      onMouseDown={(e) => e.stopPropagation()} // Prevent click outside from closing if click is on menu itself
    >
      {items.map((item, index) => {
        if (item.isSeparator) {
          return <div key={`separator-${index}`} className="h-px bg-border my-0.5" />;
        }
        return (
          <div
            key={index}
            className={cn(
              "flex items-center px-1.5 py-1 text-xs rounded-sm cursor-pointer hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground outline-none",
              item.disabled && "opacity-50 cursor-not-allowed hover:bg-transparent hover:text-popover-foreground",
              item.className
            )}
            onClick={() => {
              if (!item.disabled) {
                item.onClick();
                onClose();
              }
            }}
            tabIndex={item.disabled ? -1 : 0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                if (!item.disabled) {
                  item.onClick();
                  onClose();
                }
              }
            }}
            role="menuitem"
            aria-disabled={item.disabled}
          >
            {item.icon && <span className="mr-1.5 h-3.5 w-3.5 flex-shrink-0">{item.icon}</span>}
            <span className="flex-grow">{item.label}</span>
          </div>
        );
      })}
    </div>
  );
};

