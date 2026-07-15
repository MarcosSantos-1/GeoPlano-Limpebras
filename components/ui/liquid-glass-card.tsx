"use client";

import type { ReactNode } from "react";
import { motion } from "motion/react";

import { cn } from "@/lib/utils";

type LiquidGlassCardProps = {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  accentFrom?: string;
  accentTo?: string;
  delay?: number;
};

export function LiquidGlassCard({
  children,
  className,
  contentClassName,
  accentFrom = "rgba(56,189,248,0.35)",
  accentTo = "rgba(129,140,248,0.25)",
  delay = 0,
}: LiquidGlassCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 18, scale: 0.96, filter: "blur(6px)" }}
      animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
      transition={{
        duration: 0.55,
        delay,
        ease: [0.16, 1, 0.3, 1],
      }}
      whileHover={{ y: -4, transition: { duration: 0.25 } }}
      className={cn(
        "group relative overflow-hidden rounded-2xl border border-white/40 shadow-[0_8px_32px_rgba(15,23,42,0.08)] backdrop-blur-2xl transition dark:border-white/10 dark:shadow-[0_8px_32px_rgba(0,0,0,0.35)]",
        "bg-white/45 dark:bg-white/[0.06]",
        className,
      )}
      style={{
        backgroundImage: `linear-gradient(135deg, ${accentFrom}, transparent 45%, ${accentTo})`,
      }}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background:
            "radial-gradient(120% 80% at 10% 0%, rgba(255,255,255,0.55), transparent 55%), radial-gradient(90% 70% at 90% 100%, rgba(255,255,255,0.18), transparent 50%)",
        }}
      />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/80 to-transparent dark:via-white/30" />
      <div className={cn("relative z-10", contentClassName)}>{children}</div>
    </motion.div>
  );
}
