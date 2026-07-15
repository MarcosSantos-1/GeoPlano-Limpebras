"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { motion, useMotionTemplate, useMotionValue } from "motion/react";

import { cn } from "@/lib/utils";

type MagicCardProps = {
  children?: React.ReactNode;
  className?: string;
  gradientSize?: number;
  gradientColor?: string;
  gradientOpacity?: number;
  gradientFrom?: string;
  gradientTo?: string;
};

export function MagicCard({
  children,
  className,
  gradientSize = 220,
  gradientColor = "#262626",
  gradientOpacity = 0.7,
  gradientFrom = "#38bdf8",
  gradientTo = "#818cf8",
}: MagicCardProps) {
  const [isDark, setIsDark] = useState(false);
  const mouseX = useMotionValue(-gradientSize);
  const mouseY = useMotionValue(-gradientSize);
  const gradientSizeRef = useRef(gradientSize);

  const borderBackground = useMotionTemplate`
    linear-gradient(${isDark ? "#09090b" : "#ffffff"} 0 0) padding-box,
    radial-gradient(${gradientSize}px circle at ${mouseX}px ${mouseY}px,
      ${gradientFrom},
      ${gradientTo},
      ${isDark ? "#3f3f46" : "#e4e4e7"} 100%
    ) border-box
  `;

  const glowBackground = useMotionTemplate`
    radial-gradient(${gradientSize}px circle at ${mouseX}px ${mouseY}px,
      ${gradientColor},
      transparent 100%
    )
  `;

  useEffect(() => {
    gradientSizeRef.current = gradientSize;
  }, [gradientSize]);

  useEffect(() => {
    const sync = () => setIsDark(document.documentElement.classList.contains("dark"));
    sync();
    window.addEventListener("themechange", sync);
    return () => window.removeEventListener("themechange", sync);
  }, []);

  const reset = useCallback(() => {
    const off = -gradientSizeRef.current;
    mouseX.set(off);
    mouseY.set(off);
  }, [mouseX, mouseY]);

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      mouseX.set(e.clientX - rect.left);
      mouseY.set(e.clientY - rect.top);
    },
    [mouseX, mouseY],
  );

  useEffect(() => {
    reset();
  }, [reset]);

  return (
    <motion.div
      className={cn(
        "group relative isolate overflow-hidden rounded-[inherit] border border-transparent transition duration-300 hover:-translate-y-1 hover:shadow-lg",
        className,
      )}
      onPointerMove={handlePointerMove}
      onPointerLeave={reset}
      style={{ background: borderBackground }}
    >
      <div
        className={cn(
          "absolute inset-px z-20 rounded-[inherit]",
          isDark ? "bg-zinc-950" : "bg-white",
        )}
      />
      <motion.div
        className="pointer-events-none absolute inset-px z-30 rounded-[inherit] opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{
          background: glowBackground,
          opacity: gradientOpacity,
        }}
      />
      <div className="relative z-40">{children}</div>
    </motion.div>
  );
}
