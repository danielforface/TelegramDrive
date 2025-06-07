
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
  confiningElementRef?: React.RefObject<HTMLElement>;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({ x, y, items, onClose, className, confiningElementRef }) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({
    position: 'absolute',
    top: y,
    left: x,
    visibility: 'hidden', 
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
      
      let boundaryRect;
      if (confiningElementRef?.current) {
        boundaryRect = confiningElementRef.current.getBoundingClientRect();
      } else {
        boundaryRect = { 
          top: 0, 
          left: 0, 
          right: window.innerWidth, 
          bottom: window.innerHeight, 
          width: window.innerWidth, 
          height: window.innerHeight 
        };
      }

      let finalLeft = x;
      let finalTop = y;

      // Adjust if going off right edge of boundary
      if (x + menuWidth > boundaryRect.right - 5) {
        finalLeft = boundaryRect.right - menuWidth - 5;
      }
      // Adjust if going off bottom edge of boundary
      if (y + menuHeight > boundaryRect.bottom - 5) {
        finalTop = boundaryRect.bottom - menuHeight - 5;
      }
      // Adjust if going off left edge of boundary (can happen if menu is wider than x or shifted)
      if (finalLeft < boundaryRect.left + 5) {
        finalLeft = boundaryRect.left + 5;
      }
      // Adjust if going off top edge of boundary
      if (finalTop < boundaryRect.top + 5) {
        finalTop = boundaryRect.top + 5;
      }

      setMenuStyle({
        position: 'absolute',
        top: finalTop,
        left: finalLeft,
        visibility: 'visible',
      });
    }
  }, [x, y, items, confiningElementRef]);

  return (
    <div
      ref={menuRef}
      style={menuStyle}
      className={cn(
        "bg-popover text-popover-foreground border border-border rounded-md shadow-lg p-0.5 min-w-[150px] text-xs z-50",
        className
      )}
      onMouseDown={(e) => e.stopPropagation()} 
    >
      {items.map((item, index) => {
        if (item.isSeparator) {
          return <div key={`separator-${index}`} className="h-px bg-border my-0.5" />;
        }
        return (
          <div
            key={index}
            className={cn(
              "flex items-center px-1.5 py-1 rounded-sm cursor-pointer hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground outline-none",
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
