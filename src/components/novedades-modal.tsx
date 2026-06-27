"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BarChart3, Medal, Sparkles, TimerReset, type LucideIcon } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ui, tabRoutes } from "@/lib/ui-tokens";
import { cn } from "@/lib/utils";

// Bump this whenever there are new novedades to show everyone again.
const NOVEDADES_VERSION = "2026-06-stage-scoring";
const STORAGE_KEY = "prode-novedades-seen";

type Novedad = {
  icon: LucideIcon;
  title: string;
  body: string;
  href?: string;
  cta?: string;
};

const novedades: Novedad[] = [
  {
    icon: Medal,
    title: "Puntajes por etapa",
    body: "Los cruces ahora valen más a medida que avanza el torneo: desde 16avos hasta la final, acertar suma cada vez más puntos. Y si pronosticás un empate, ya no hace falta elegir quién clasifica. Recorda que el 28 de junio se habilitan los pronósticos de los 16avos!",
  },
];

export function NovedadesModal() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(STORAGE_KEY) !== NOVEDADES_VERSION) {
        setOpen(true);
      }
    } catch {
      // localStorage unavailable (private mode, etc.) — just skip.
    }
  }, []);

  function dismiss() {
    setOpen(false);
    try {
      window.localStorage.setItem(STORAGE_KEY, NOVEDADES_VERSION);
    } catch {
      // ignore write failures
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) dismiss();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <span className={cn(ui.label, "mb-1 inline-flex items-center gap-1.5 text-app-green")}>
            <Sparkles className="size-3.5" aria-hidden="true" />
            Novedades
          </span>
          <DialogTitle>¿Qué hay de nuevo?</DialogTitle>
          <DialogDescription>Un par de cosas que sumamos al prode.</DialogDescription>
        </DialogHeader>

        <ul className="flex flex-col gap-3 p-5 pt-4">
          {novedades.map((item) => {
            const Icon = item.icon;
            return (
              <li key={item.title} className={cn(ui.panelPlain, "flex gap-3 p-3.5")}>
                <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-app-surface-2 text-app-green">
                  <Icon className="size-4.5" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-black leading-tight text-app-text">{item.title}</p>
                  <p className="mt-1 text-sm leading-snug text-app-muted">{item.body}</p>
                  {item.href && (
                    <Button
                      render={<Link href={item.href} />}
                      variant="outline"
                      size="sm"
                      className="mt-2.5"
                      onClick={dismiss}
                    >
                      {item.cta}
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>

        <DialogFooter>
          <Button onClick={dismiss}>Entendido</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
