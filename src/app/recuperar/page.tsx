"use client";

import Link from "next/link";
import { useState } from "react";

import { AuthLayout, authInputClass } from "@/components/auth/auth-layout";
import { LoadingLabel } from "@/components/badges";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createSupabaseBrowserClient, hasSupabaseConfig } from "@/lib/supabase";

export default function RecoverPage() {
  const supabaseEnabled = hasSupabaseConfig();
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [message, setMessage] = useState("");

  async function submit() {
    if (submitting) return;
    setMessage("");

    if (!email.trim()) {
      setMessage("Ingresá tu email para recuperar la contraseña.");
      return;
    }

    const supabase = createSupabaseBrowserClient();
    if (!supabase) {
      setMessage("Supabase no está configurado.");
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback?next=/restablecer`,
      });
      if (error) {
        setMessage(error.message);
        return;
      }
      setSent(true);
      setMessage("Si el email existe, te enviamos un enlace para restablecer la contraseña.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout eyebrow="Recuperar contraseña">
      <h1 className="mb-2 text-3xl font-black leading-tight text-app-text">Recuperá tu contraseña</h1>
      <p className="mb-6 text-sm font-bold leading-relaxed text-app-muted">
        {supabaseEnabled
          ? "Ingresá tu email y te enviamos un enlace para restablecerla."
          : "Configurá NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY."}
      </p>
      <div className="grid gap-4">
        <label className="grid gap-2">
          <span className="text-xs font-black uppercase tracking-wide text-app-muted">Email</span>
          <Input
            type="email"
            placeholder="tu@email.com"
            className={authInputClass}
            disabled={submitting || sent || !supabaseEnabled}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <Button
          className="mt-2 min-h-12 rounded-lg bg-app-brand text-app-brand-fg text-base font-black shadow-lg hover:bg-app-brand"
          disabled={submitting || sent || !supabaseEnabled}
          onClick={submit}
        >
          <LoadingLabel loading={submitting} label="Enviar enlace" />
        </Button>
      </div>
      <p className="mt-6 text-sm font-bold text-app-muted">
        <Link href="/ingresar" className="text-app-brand hover:underline">Volver a entrar</Link>
      </p>
      {message && <small className="auth-message">{message}</small>}
    </AuthLayout>
  );
}
