import * as React from "react";

interface DrawerProps {
  className?: string;
}

export function Drawer({ className }: DrawerProps) {
  return (
    <div className={className}>
      Drawer Component
    </div>
  );
}