"use client";

import { RefreshCcw } from "lucide-react";
import { useState } from "react";

import { AuthLayout } from "@/components/auth/auth-layout";
import { LoadingLabel } from "@/components/badges";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function PendingApproval({
  message,
  onRefresh,
  onSignOut,
}: {
  message: string;
  onRefresh?: () => Promise<void> | void;
  onSignOut?: () => Promise<void> | void;
}) {
  const [pending, setPending] = useState<"refresh" | "signout" | null>(null);

  async function run(action: "refresh" | "signout", callback?: () => Promise<void> | void) {
    if (!callback || pending) return;
    setPending(action);
    try {
      await callback();
    } finally {
      setPending(null);
    }
  }

  return (
    <AuthLayout eyebrow="Mundial 2026">
      <div className="rounded-lg border border-app-line bg-app-surface-2 p-5">
        <Badge variant="outline" className="status-chip locked">Pendiente</Badge>
        <h1 className="mb-3 mt-5 text-3xl font-black leading-tight text-app-text">Tu cuenta está esperando aprobación</h1>
        <p className="mb-6 text-sm font-bold leading-relaxed text-app-muted">{message}</p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button disabled={Boolean(pending)} onClick={() => run("refresh", onRefresh)}>
            <LoadingLabel loading={pending === "refresh"} icon={<RefreshCcw size={16} />} label="Revisar aprobación" />
          </Button>
          <Button variant="outline" disabled={Boolean(pending)} onClick={() => run("signout", onSignOut)}>
            <LoadingLabel loading={pending === "signout"} label="Salir" />
          </Button>
        </div>
      </div>
    </AuthLayout>
  );
}
