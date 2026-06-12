"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { LoadingLabel } from "@/components/badges";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { validatePasswordChange } from "@/lib/account";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import { ui } from "@/lib/ui-tokens";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function submit() {
    if (saving) return;
    setMessage("");

    const validation = validatePasswordChange(password, confirm);
    if (!validation.ok) {
      setMessage(validation.message);
      return;
    }

    const supabase = createSupabaseBrowserClient();
    if (!supabase) {
      setMessage("Supabase no está configurado.");
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        setMessage(error.message);
        return;
      }
      router.replace("/");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-app-bg p-4 text-app-text sm:p-8">
      <Card className="w-full max-w-md rounded-lg border border-app-line bg-app-panel-strong p-6 shadow-app sm:p-8">
        <div className="mb-6 flex items-center gap-3">
          <span className="brand-mark size-12 border-app-line bg-white shadow-sm" aria-hidden="true">
            <Image className="size-full object-contain" src="/favicon.svg" alt="" width={455} height={701} priority />
          </span>
          <div>
            <strong className="block text-xl font-black leading-tight text-app-text">Prode Carbia</strong>
            <small className="block text-xs font-black uppercase tracking-wide text-app-brand">Restablecer contraseña</small>
          </div>
        </div>
        <h1 className="mb-2 text-2xl font-black leading-tight text-app-text">Elegí una contraseña nueva</h1>
        <p className="mb-6 text-sm font-bold leading-relaxed text-app-muted">Ingresá tu nueva contraseña para volver a entrar.</p>
        <div className="grid gap-4">
          <label className="grid gap-2">
            <span className={ui.label}>Nueva contraseña</span>
            <Input
              type="password"
              className="min-h-12 rounded-lg border-app-line bg-app-surface px-3 text-base font-bold text-app-text"
              value={password}
              disabled={saving}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          <label className="grid gap-2">
            <span className={ui.label}>Confirmar contraseña</span>
            <Input
              type="password"
              className="min-h-12 rounded-lg border-app-line bg-app-surface px-3 text-base font-bold text-app-text"
              value={confirm}
              disabled={saving}
              onChange={(event) => setConfirm(event.target.value)}
            />
          </label>
          <Button className="mt-2 min-h-12 rounded-lg bg-app-brand text-app-brand-fg text-base font-black" disabled={saving} onClick={submit}>
            <LoadingLabel loading={saving} label="Guardar contraseña" />
          </Button>
          {message && <small className="text-sm font-bold text-app-muted">{message}</small>}
        </div>
      </Card>
    </main>
  );
}
