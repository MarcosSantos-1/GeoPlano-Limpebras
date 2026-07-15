"use client";

import { useEffect, useState } from "react";
import { AnimatedThemeToggler } from "@/components/ui/animated-theme-toggler";

export function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const sync = () => {
      const isDark = document.documentElement.classList.contains("dark");
      setTheme(isDark ? "dark" : "light");
    };
    sync();
    window.addEventListener("themechange", sync);
    return () => window.removeEventListener("themechange", sync);
  }, []);

  const handleThemeChange = (next: "light" | "dark") => {
    const nextDark = next === "dark";
    document.documentElement.classList.toggle("dark", nextDark);
    localStorage.setItem("theme", next);
    setTheme(next);
    window.dispatchEvent(new Event("themechange"));
  };

  if (!mounted) {
    return <AnimatedThemeToggler />;
  }

  return <AnimatedThemeToggler theme={theme} onThemeChange={handleThemeChange} />;
}
