"use client";

import Image from "next/image";
import { Monitor, Moon, Sun } from "lucide-react";
import type { ReactNode } from "react";

import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ui } from "@/lib/ui-tokens";
import { useTheme, type Theme } from "@/lib/use-theme";
import { cn } from "@/lib/utils";

export const authInputClass =
  "min-h-12 rounded-lg border-app-line bg-app-surface px-3 text-base font-bold text-app-text placeholder:text-app-muted";

export function ThemePicker({ theme, onChange }: { theme: Theme; onChange: (theme: Theme) => void }) {
  const themeLabels: Record<Theme, string> = {
    light: "Claro",
    dark: "Oscuro",
    system: "Sistema",
  };

  return (
    <Select value={theme} onValueChange={(value) => onChange(value as Theme)}>
      <SelectTrigger className={cn(ui.control, "w-full justify-start border-app-brand")} aria-label="Tema">
        {theme === "light" && <Sun size={15} />}
        {theme === "dark" && <Moon size={15} />}
        {theme === "system" && <Monitor size={15} />}
        <SelectValue>{themeLabels[theme]}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="light"><Sun size={15} /> Claro</SelectItem>
        <SelectItem value="dark"><Moon size={15} /> Oscuro</SelectItem>
        <SelectItem value="system"><Monitor size={15} /> Sistema</SelectItem>
      </SelectContent>
    </Select>
  );
}

export function AuthLayout({ eyebrow, children }: { eyebrow: string; children: ReactNode }) {
  const [theme, setTheme] = useTheme();

  return (
    <main className="grid min-h-screen place-items-center bg-app-bg p-4 text-app-text sm:p-8">
      <Card className="w-full max-w-md rounded-lg border border-app-line bg-app-panel-strong p-6 shadow-app sm:p-8">
        <div className="mb-8 flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="brand-mark size-12 border-app-line bg-white shadow-sm" aria-hidden="true">
              <Image className="size-full object-contain" src="/favicon.svg" alt="" width={455} height={701} priority />
            </span>
            <div>
              <strong className="block text-xl font-black leading-tight text-app-text">Prode Carbia</strong>
              <small className="block text-xs font-black uppercase tracking-wide text-app-brand">{eyebrow}</small>
            </div>
          </div>
          <div className="w-32">
            <ThemePicker theme={theme} onChange={setTheme} />
          </div>
        </div>
        {children}
      </Card>
    </main>
  );
}
