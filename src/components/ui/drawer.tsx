"use client";

import * as React from "react";

interface DrawerProps {
  children: React.ReactNode;
  className?: string;
}

export function Drawer({ children, className }: DrawerProps) {
  return (
    <div className={className}>
      {children}
    </div>
  );
}