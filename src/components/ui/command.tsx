"use client";

import * as React from "react";
import { DialogProps } from "@radix-ui/react-dialog";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

interface CommandProps {
  children: React.ReactNode;
  className?: string;
}

export function Command({ children, className }: CommandProps) {
  return (
    <div className={cn("p-4", className)}>
      Command Component
    </div>
  );
}