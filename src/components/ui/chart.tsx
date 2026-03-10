"use client";

import * as React from "react";

interface ChartProps {
  children: React.ReactNode;
  className?: string;
}

export function Chart({ children, className }: ChartProps) {
  return (
    <div className={className}>
      {children}
    </div>
  );
}