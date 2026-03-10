import * as React from "react";
import { Dot } from "lucide-react";
import { cn } from "@/lib/utils";

interface InputOTPProps {
  className?: string;
}

export function InputOTP({ className }: InputOTPProps) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      Input OTP Component
    </div>
  );
}