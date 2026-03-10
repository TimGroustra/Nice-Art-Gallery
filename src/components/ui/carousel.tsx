"use client";

import * as React from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface CarouselProps {
  children: React.ReactNode;
  className?: string;
}

export function Carousel({ children, className }: CarouselProps) {
  return (
    <div className={cn("relative group", className)}>
      <div className="overflow-hidden rounded-lg">
        <div className="flex">
          {children}
        </div>
      </div>
      <Button variant="outline" size="icon" className="absolute left-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
        <ArrowLeft className="h-4 w-4" />
      </Button>
      <Button variant="outline" size="icon" className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
        <ArrowRight className="h-4 w-4" />
      </Button>
    </div>
  );
}