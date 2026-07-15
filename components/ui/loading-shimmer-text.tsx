"use client";

import { cn } from "@/lib/utils";

type LoadingShimmerTextProps = {
  text?: string;
  className?: string;
};

export function LoadingShimmerText({
  text = "Carregando cronogramas",
  className,
}: LoadingShimmerTextProps) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-sm", className)}>
      <span className="relative h-3.5 w-3.5">
        <span className="absolute inset-0 animate-ping rounded-full bg-sky-400/40" />
        <span className="absolute inset-0.5 animate-spin rounded-full border-2 border-sky-500 border-t-transparent" />
      </span>
      <span className="loading-shimmer-text font-medium tracking-wide">{text}</span>
    </span>
  );
}
