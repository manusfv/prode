"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { AuthLayout, authInputClass } from "@/components/auth/auth-layout";
import { LoadingLabel } from "@/components/badges";
import { Button } from "@/components/ui/button";
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
    <AuthLayout eyebrow="Restablecer contraseña">
      <h1 className="mb-2 text-2xl font-black leading-tight text-app-text">Elegí una contraseña nueva</h1>
      <p className="mb-6 text-sm font-bold leading-relaxed text-app-muted">Ingresá tu nueva contraseña para volver a entrar.</p>
      <form
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <label className="grid gap-2">
          <span className={ui.label}>Nueva contraseña</span>
          <Input
            type="password"
            className={authInputClass}
            value={password}
            disabled={saving}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        <label className="grid gap-2">
          <span className={ui.label}>Confirmar contraseña</span>
          <Input
            type="password"
            className={authInputClass}
            value={confirm}
            disabled={saving}
            onChange={(event) => setConfirm(event.target.value)}
          />
        </label>
        <Button
          className="mt-2 min-h-12 rounded-lg bg-app-brand text-app-brand-fg text-base font-black"
          disabled={saving}
          type="submit"
        >
          <LoadingLabel loading={saving} label="Guardar contraseña" />
        </Button>
        {message && <small className="text-sm font-bold text-app-muted">{message}</small>}
      </form>
    </AuthLayout>
  );
}
