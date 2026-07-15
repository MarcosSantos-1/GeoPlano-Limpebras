"use client";

import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type AnimatedThemeTogglerProps = {
  className?: string;
  duration?: number;
  theme?: "light" | "dark";
  onThemeChange?: (theme: "light" | "dark") => void;
};

export function AnimatedThemeToggler({
  className,
  duration = 400,
  theme,
  onThemeChange,
}: AnimatedThemeTogglerProps) {
  const [mounted, setMounted] = useState(false);
  const [internalDark, setInternalDark] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (theme) {
      setInternalDark(theme === "dark");
      return;
    }
    setInternalDark(document.documentElement.classList.contains("dark"));
  }, [theme]);

  const isDark = theme ? theme === "dark" : internalDark;

  const applyTheme = useCallback(
    (nextDark: boolean) => {
      const nextTheme = nextDark ? "dark" : "light";
      if (onThemeChange) {
        onThemeChange(nextTheme);
      } else {
        document.documentElement.classList.toggle("dark", nextDark);
        localStorage.setItem("theme", nextTheme);
        window.dispatchEvent(new Event("themechange"));
      }
      setInternalDark(nextDark);
    },
    [onThemeChange],
  );

  const toggleTheme = useCallback(async () => {
    const nextDark = !isDark;
    const root = document.documentElement;
    root.style.setProperty("--magicui-theme-toggle-vt-duration", `${duration}ms`);

    if (typeof document !== "undefined" && "startViewTransition" in document) {
      root.dataset.magicuiThemeVt = "active";
      try {
        // @ts-expect-error View Transitions API
        const transition = document.startViewTransition(() => {
          applyTheme(nextDark);
        });
        await transition.finished;
      } finally {
        delete root.dataset.magicuiThemeVt;
      }
      return;
    }

    applyTheme(nextDark);
  }, [applyTheme, duration, isDark]);

  if (!mounted) {
    return (
      <button
        type="button"
        className={cn(
          "relative flex h-10 w-10 items-center justify-center rounded-full border border-zinc-300 bg-white text-zinc-700 shadow-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200",
          className,
        )}
        aria-label="Alternar tema"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => void toggleTheme()}
      className={cn(
        "relative flex h-10 w-10 items-center justify-center rounded-full border border-zinc-300 bg-white text-zinc-700 shadow-sm transition hover:scale-105 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700",
        className,
      )}
      aria-label={isDark ? "Alternar para tema claro" : "Alternar para tema escuro"}
    >
      <span
        className={cn(
          "absolute transition-all duration-300",
          isDark ? "scale-0 rotate-90 opacity-0" : "scale-100 rotate-0 opacity-100",
        )}
      >
        <i className="fa-solid fa-sun text-sm" aria-hidden />
      </span>
      <span
        className={cn(
          "absolute transition-all duration-300",
          isDark ? "scale-100 rotate-0 opacity-100" : "scale-0 -rotate-90 opacity-0",
        )}
      >
        <i className="fa-solid fa-moon text-sm" aria-hidden />
      </span>
    </button>
  );
}
