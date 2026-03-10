import * as React from "react";
import { cn } from "@/lib/utils";

interface ChartProps {
  className?: string;
}

export function Chart({ className }: ChartProps) {
  return (
    <div className={cn("p-4", className)}>
      Chart Component
    </div>
  );
}