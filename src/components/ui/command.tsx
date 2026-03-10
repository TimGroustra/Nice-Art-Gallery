"use client";

import * as React from "react";

interface CommandProps {
  children: React.ReactNode;
  className?: string;
}

export function Command({ children, className }: CommandProps) {
  return (
    <div className={className}>
      {children}
    </div>
  );
}