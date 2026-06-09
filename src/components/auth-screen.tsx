"use client";

import Image from "next/image";
import { Monitor, Moon, RefreshCcw, Sun } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ui } from "@/lib/ui-tokens";
import type { Theme } from "@/lib/use-theme";
import type { Profile } from "@/lib/types";
import { cn } from "@/lib/utils";

import { LoadingLabel } from "./badges";

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

export function LoadingScreen() {
  return (
    <main className="login-shell grid min-h-screen place-items-center p-4 sm:p-7">
      <Card className="login-panel loading-panel">
        <div className="brand login-brand">
          <span className="brand-mark" aria-hidden="true">
            <Image className="size-full object-contain" src="/favicon.svg" alt="" width={455} height={701} priority />
          </span>
          <div>
            <strong>Prode Carbia</strong>
            <small>Familia · 2026</small>
          </div>
        </div>
        <div className="loading-line" />
      </Card>
    </main>
  );
}

export function AuthScreen({
  currentUser,
  authMode,
  authEmail,
  authName,
  authPassword,
  authConfirmPassword,
  authMessage,
  dataMessage,
  theme,
  onEmailChange,
  onNameChange,
  onPasswordChange,
  onConfirmPasswordChange,
  onThemeChange,
  onModeChange,
  onSubmitAuth,
  onRefresh,
  onSignOut,
}: {
  currentUser?: Profile | null;
  authMode: "login" | "signup";
  authEmail: string;
  authName: string;
  authPassword: string;
  authConfirmPassword: string;
  authMessage: string;
  dataMessage: string;
  theme: Theme;
  onEmailChange: (value: string) => void;
  onNameChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onConfirmPasswordChange: (value: string) => void;
  onThemeChange: (theme: Theme) => void;
  onModeChange: (value: "login" | "signup") => void;
  onSubmitAuth: () => Promise<void> | void;
  onRefresh?: () => Promise<void> | void;
  onSignOut?: () => Promise<void> | void;
}) {
  const isPending = Boolean(currentUser && !currentUser.approved);
  const [pendingAction, setPendingAction] = useState<"submit" | "refresh" | "signout" | null>(null);

  async function runAuthAction(action: "submit" | "refresh" | "signout", callback?: () => Promise<void> | void) {
    if (!callback || pendingAction) return;
    setPendingAction(action);
    try {
      await callback();
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-app-bg p-4 text-app-text sm:p-8">
      <Card className="w-full max-w-md rounded-lg border border-app-line bg-app-panel-strong p-6 shadow-app sm:p-8">
        <section aria-label={isPending ? "Cuenta pendiente" : "Autenticación"}>
          <div className="mb-8 flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                <span className="brand-mark size-12 border-app-line bg-white shadow-sm" aria-hidden="true">
                  <Image className="size-full object-contain" src="/favicon.svg" alt="" width={455} height={701} priority />
                </span>
                <div>
                  <strong className="block text-xl font-black leading-tight text-app-text">Prode Carbia</strong>
                  <small className="block text-xs font-black uppercase tracking-wide text-app-brand">Familia 2026</small>
                </div>
              </div>
            </div>
            <div className="w-32">
              <ThemePicker theme={theme} onChange={onThemeChange} />
            </div>
          </div>
          {isPending ? (
            <div className="rounded-lg border border-app-line bg-app-surface-2 p-5">
              <Badge variant="outline" className="status-chip locked">Pendiente</Badge>
              <h1 className="mb-3 mt-5 text-3xl font-black leading-tight text-app-text">Tu cuenta está esperando aprobación</h1>
              <p className="mb-6 text-sm font-bold leading-relaxed text-app-muted">{dataMessage}</p>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Button disabled={Boolean(pendingAction)} onClick={() => runAuthAction("refresh", onRefresh)}>
                  <LoadingLabel loading={pendingAction === "refresh"} icon={<RefreshCcw size={16} />} label="Revisar aprobación" />
                </Button>
                <Button variant="outline" disabled={Boolean(pendingAction)} onClick={() => runAuthAction("signout", onSignOut)}>
                  <LoadingLabel loading={pendingAction === "signout"} label="Salir" />
                </Button>
              </div>
            </div>
          ) : (
            <>
              <Tabs value={authMode} onValueChange={(value) => onModeChange(value as "login" | "signup")} className="mb-8 w-full rounded-lg border border-app-line bg-app-surface-2 p-1">
                <TabsList className="grid h-11 w-full grid-cols-2 !bg-transparent !p-0 shadow-none">
                  <TabsTrigger value="login" className="rounded-md !bg-transparent text-sm font-black !text-app-muted shadow-none data-active:!bg-app-solid data-active:!text-app-solid-fg data-active:shadow-sm">
                    Entrar
                  </TabsTrigger>
                  <TabsTrigger value="signup" className="rounded-md !bg-transparent text-sm font-black !text-app-muted shadow-none data-active:!bg-app-solid data-active:!text-app-solid-fg data-active:shadow-sm">
                    Crear cuenta
                  </TabsTrigger>
                </TabsList>
              </Tabs>

              <h1 className="mb-2 text-3xl font-black leading-tight text-app-text">{authMode === "login" ? "Entrá al prode" : "Creá tu cuenta"}</h1>
              <p className="mb-6 text-sm font-bold leading-relaxed text-app-muted">{dataMessage || "Usá email y contraseña para entrar al prode familiar."}</p>

              <div className="grid gap-4">
                {authMode === "signup" && (
                  <label className="grid gap-2">
                    <span className="text-xs font-black uppercase tracking-wide text-app-muted">Nombre</span>
                    <Input
                      type="text"
                      placeholder="Tu nombre"
                      className="min-h-12 rounded-lg border-app-line bg-app-surface px-3 text-base font-bold text-app-text placeholder:text-app-muted"
                      disabled={pendingAction === "submit"}
                      value={authName}
                      onChange={(event) => onNameChange(event.target.value)}
                    />
                  </label>
                )}
                <label className="grid gap-2">
                  <span className="text-xs font-black uppercase tracking-wide text-app-muted">Email</span>
                  <Input
                    type="email"
                    placeholder="tu@email.com"
                    className="min-h-12 rounded-lg border-app-line bg-app-surface px-3 text-base font-bold text-app-text placeholder:text-app-muted"
                    disabled={pendingAction === "submit"}
                    value={authEmail}
                    onChange={(event) => onEmailChange(event.target.value)}
                  />
                </label>
                <label className="grid gap-2">
                  <span className="text-xs font-black uppercase tracking-wide text-app-muted">Contraseña</span>
                  <Input
                    type="password"
                    placeholder="Ingresá tu contraseña"
                    className="min-h-12 rounded-lg border-app-line bg-app-surface px-3 text-base font-bold text-app-text placeholder:text-app-muted"
                    disabled={pendingAction === "submit"}
                    value={authPassword}
                    onChange={(event) => onPasswordChange(event.target.value)}
                  />
                </label>
                {authMode === "signup" && (
                  <label className="grid gap-2">
                    <span className="text-xs font-black uppercase tracking-wide text-app-muted">Confirmar contraseña</span>
                    <Input
                      type="password"
                      placeholder="Repetí tu contraseña"
                      className="min-h-12 rounded-lg border-app-line bg-app-surface px-3 text-base font-bold text-app-text placeholder:text-app-muted"
                      disabled={pendingAction === "submit"}
                      value={authConfirmPassword}
                      onChange={(event) => onConfirmPasswordChange(event.target.value)}
                    />
                  </label>
                )}
                <Button className="mt-2 min-h-12 rounded-lg bg-app-brand text-app-brand-fg text-base font-black shadow-lg hover:bg-app-brand" disabled={Boolean(pendingAction)} onClick={() => runAuthAction("submit", onSubmitAuth)}>
                  <LoadingLabel loading={pendingAction === "submit"} label={authMode === "login" ? "Entrar" : "Crear cuenta"} />
                </Button>
              </div>

              {authMessage && <small className="auth-message">{authMessage}</small>}
            </>
          )}
        </section>
      </Card>
    </main>
  );
}
