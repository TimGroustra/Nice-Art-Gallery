"use client";

import * as React from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

interface CommandProps {
  children: React.ReactNode;
  className?: string;
}

export function Command({ children, className }: CommandProps) {
  return (
    <div className={cn("border rounded-lg bg-background p-2", className)}>
      <div className="flex items-center px-3 py-2 border-b mb-2">
        <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
        <span className="text-sm text-muted-foreground">Search...</span>
      </div>
      {children}
    </div>
  );
}