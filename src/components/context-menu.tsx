
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

  // Adjust position if menu goes off-screen
  const [adjustedX, setAdjustedX] = useState(x);
  const [adjustedY, setAdjustedY] = useState(y);

  useEffect(() => {
    if (menuRef.current) {
      const menuWidth = menuRef.current.offsetWidth;
      const menuHeight = menuRef.current.offsetHeight;
      const screenWidth = window.innerWidth;
      const screenHeight = window.innerHeight;

      let newX = x;
      let newY = y;

      if (x + menuWidth > screenWidth) {
        newX = screenWidth - menuWidth - 5; // 5px buffer
      }
      if (y + menuHeight > screenHeight) {
        newY = screenHeight - menuHeight - 5; // 5px buffer
      }
      if (newX < 0) newX = 5;
      if (newY < 0) newY = 5;

      setAdjustedX(newX);
      setAdjustedY(newY);
    }
  }, [x, y, items]); // Re-calculate if items change, as height might change

  return (
    <div
      ref={menuRef}
      style={{
        position: 'absolute',
        top: adjustedY,
        left: adjustedX,
      }}
      className={cn(
        "bg-popover text-popover-foreground border border-border rounded-md shadow-lg p-1 min-w-[180px] z-50",
        className
      )}
    >
      {items.map((item, index) => {
        if (item.isSeparator) {
          return <div key={`separator-${index}`} className="h-px bg-border my-1" />;
        }
        return (
          <div
            key={index}
            className={cn(
              "flex items-center px-2 py-1.5 text-sm rounded-sm cursor-pointer hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground outline-none",
              item.disabled && "opacity-50 cursor-not-allowed hover:bg-transparent hover:text-popover-foreground",
              item.className
            )}
            onClick={() => {
              if (!item.disabled) {
                item.onClick();
                onClose(); // Close menu after action
              }
            }}
            onMouseDown={(e) => e.stopPropagation()} // Prevent click outside from firing on item click
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
            {item.icon && <span className="mr-2 h-4 w-4 flex-shrink-0">{item.icon}</span>}
            <span>{item.label}</span>
          </div>
        );
      })}
    </div>
  );
};
