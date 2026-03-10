"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface CalendarProps {
  className?: string;
  children?: React.ReactNode;
}

export function Calendar({ className, children }: CalendarProps) {
  return (
    <div className={cn("p-3 border rounded-md bg-card", className)}>
      <div className="flex items-center justify-between mb-4">
        <button className={buttonVariants({ variant: "outline", size: "icon" })}>
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-medium">Calendar</span>
        <button className={buttonVariants({ variant: "outline", size: "icon" })}>
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      {children}
    </div>
  );
}