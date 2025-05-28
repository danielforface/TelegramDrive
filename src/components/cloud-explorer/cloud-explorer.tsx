
"use client";

// This component is no longer used and can be deleted.
// Its functionality has been moved to MainContentView and page.tsx.

import type { CloudFolder } from "@/types";
import { Loader2 } from "lucide-react";

interface CloudExplorerProps {
  data: CloudFolder[];
  lastItemRef?: (node: HTMLDivElement | null) => void;
}

export function CloudExplorer({ data, lastItemRef }: CloudExplorerProps) {
  // console.warn("CloudExplorer component is deprecated and should be removed.");
  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center p-8">
        <Loader2 className="w-12 h-12 text-primary animate-spin mb-4" />
        <p className="text-lg text-muted-foreground">Loading initial cloud structure...</p>
      </div>
    );
  }
  return (
    <div>
      <p className="text-center text-red-500 p-4">
        CloudExplorer component is deprecated. Please remove references.
      </p>
      {/* Original content commented out or removed */}
    </div>
  );
}

    