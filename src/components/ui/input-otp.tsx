"use client";

import * as React from "react";
import { Dot } from "lucide-react";
import { cn } from "@/lib/utils";

interface InputOTPProps {
  children: React.ReactNode;
  className?: string;
}

export function InputOTP({ children, className }: InputOTPProps) {
  return (
    <div className={cn("flex items-center gap-2 p-2 border rounded-md", className)}>
      {React.Children.map(children, (child, index) => (
        <div key={index} className="w-10 h-10 border rounded-md flex items-center justify-center">
          {child || <Dot className="h-2 w-2" />}
        </div>
      ))}
    </div>
  );
}