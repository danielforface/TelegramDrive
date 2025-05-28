"use client";

import { Cloud } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AnimatedCloudIconProps {
  className?: string;
  isAnimating?: boolean;
}

export function AnimatedCloudIcon({ className, isAnimating = true }: AnimatedCloudIconProps) {
  return (
    <div className={cn("relative", className)}>
      <Cloud
        className={cn(
          "w-24 h-24 text-primary drop-shadow-lg",
          isAnimating && "animate-pulse- थोड़ा"
        )}
        strokeWidth={1.5}
      />
      <style jsx>{`
        @keyframes pulse- थोड़ा {
          0%, 100% {
            opacity: 0.8;
            transform: scale(1);
          }
          50% {
            opacity: 1;
            transform: scale(1.05);
          }
        }
        .animate-pulse-थोड़ा {
          animation: pulse-थोड़ा 2.5s infinite ease-in-out;
        }
      `}</style>
    </div>
  );
}
