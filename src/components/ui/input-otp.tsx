"use client";

import * as React from "react";

interface InputOTPProps {
  children: React.ReactNode;
  className?: string;
}

export function InputOTP({ children, className }: InputOTPProps) {
  return (
    <div className={className}>
      {children}
    </div>
  );
}