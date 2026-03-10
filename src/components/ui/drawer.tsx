"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface DrawerProps {
  children: React.ReactNode;
  className?: string;
}

export function Drawer({ children, className }: DrawerProps) {
  return (
    <div className={cn(className)}>
      Drawer Component
    </div>
  );
}