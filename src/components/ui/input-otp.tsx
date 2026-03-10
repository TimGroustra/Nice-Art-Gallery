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
    <div className={cn("flex items-center gap-2", className)}>
      OTP Input
    </div>
  );
}