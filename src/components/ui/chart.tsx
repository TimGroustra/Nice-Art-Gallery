"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface ChartProps {
  children: React.ReactNode;
  className?: string;
}

export function Chart({ children, className }: ChartProps) {
  return (
    <div className={cn("w-full h-64 bg-muted rounded-lg flex items-center justify-center", className)}>
      <div className="text-muted-foreground text-sm">Chart Component</div>
    </div>
  );
}