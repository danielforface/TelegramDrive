
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
        newX = screenWidth - menuWidth - 5; 
      }
      if (y + menuHeight > screenHeight) {
        newY = screenHeight - menuHeight - 5; 
      }
      if (newX < 0) newX = 5;
      if (newY < 0) newY = 5;

      setAdjustedX(newX);
      setAdjustedY(newY);
    }
  }, [x, y, items]); 

  return (
    <div
      ref={menuRef}
      style={{
        position: 'absolute',
        top: adjustedY,
        left: adjustedX,
      }}
      className={cn(
        "bg-popover text-popover-foreground border border-border rounded-md shadow-lg p-0.5 min-w-[160px] z-50", // Reduced padding
        className
      )}
    >
      {items.map((item, index) => {
        if (item.isSeparator) {
          return <div key={`separator-${index}`} className="h-px bg-border my-0.5" />; // Reduced margin
        }
        return (
          <div
            key={index}
            className={cn(
              "flex items-center px-1.5 py-1 text-xs rounded-sm cursor-pointer hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground outline-none", // Reduced padding and font size
              item.disabled && "opacity-50 cursor-not-allowed hover:bg-transparent hover:text-popover-foreground",
              item.className
            )}
            onClick={() => {
              if (!item.disabled) {
                item.onClick();
                onClose(); 
              }
            }}
            onMouseDown={(e) => e.stopPropagation()} 
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
            {item.icon && <span className="mr-1.5 h-3.5 w-3.5 flex-shrink-0">{item.icon}</span>} {/* Reduced icon margin and size implied by h-3.5 w-3.5 */}
            <span className="flex-grow">{item.label}</span>
          </div>
        );
      })}
    </div>
  );
};

