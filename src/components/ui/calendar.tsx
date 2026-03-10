"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface CalendarProps {
  className?: string;
}

export function Calendar({ className }: CalendarProps) {
  return (
    <div className={cn("p-3 border rounded-md bg-card", className)}>
      <div className="flex items-center justify-between mb-4">
        <button className={cn(buttonVariants({ variant: "outline", size: "icon" }), "h-7 w-7")}>
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-medium">March 2025</span>
        <button className={cn(buttonVariants({ variant: "outline", size: "icon" }), "h-7 w-7")}>
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(day => (
          <div key={day} className="text-center text-xs font-medium text-muted-foreground">
            {day}
          </div>
        ))}
        {Array.from({ length: 31 }, (_, i) => i + 1).map(day => (
          <button
            key={day}
            className={cn(
              "h-8 w-8 text-sm rounded-md hover:bg-accent",
              day === 10 ? "bg-primary text-primary-foreground" : "text-foreground"
            )}
          >
            {day}
          </button>
        ))}
      </div>
    </div>
  );
}