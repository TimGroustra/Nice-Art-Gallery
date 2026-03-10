"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface CalendarProps {
  className?: string;
}

export function Calendar({ className }: CalendarProps) {
  return (
    <div className={cn("p-3", className)}>
      <div className="flex items-center text-sm font-medium">
        Date Picker Component
      </div>
    </div>
  );
}