"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface DrawerProps {
  children: React.ReactNode;
  className?: string;
}

export function Drawer({ children, className }: DrawerProps) {
  return (
    <div className={cn("fixed inset-0 z-50 bg-background/80 backdrop-blur-sm", className)}>
      <div className="fixed right-0 top-0 h-full w-80 bg-background border-l shadow-lg">
        {children}
      </div>
    </div>
  );
}