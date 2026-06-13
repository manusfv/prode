"use client";

import Link from "next/link";
import { useState } from "react";

import { AuthLayout, authInputClass } from "@/components/auth/auth-layout";
import { LoadingLabel } from "@/components/badges";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { validateLogin } from "@/lib/account";
import { createSupabaseBrowserClient, hasSupabaseConfig } from "@/lib/supabase";

export default function LoginPage() {
  const supabaseEnabled = hasSupabaseConfig();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  async function submit() {
    if (submitting) return;
    setMessage("");

    const validation = validateLogin(email, password);
    if (!validation.ok) {
      setMessage(validation.message);
      return;
    }

    const supabase = createSupabaseBrowserClient();
    if (!supabase) {
      setMessage("Supabase no está configurado.");
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setMessage(error.message);
        return;
      }
      // Success: AppShell's auth-state subscription loads the profile and its
      // redirect effect moves us off this route. Keep the button busy meanwhile.
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout eyebrow="Mundial 2026">
      <h1 className="mb-2 text-3xl font-black leading-tight text-app-text">Entrá al prode</h1>
      <p className="mb-6 text-sm font-bold leading-relaxed text-app-muted">
        {supabaseEnabled
          ? "Usá email y contraseña para entrar al prode familiar."
          : "Configurá NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY."}
      </p>
      <form
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <label className="grid gap-2">
          <span className="text-xs font-black uppercase tracking-wide text-app-muted">Email</span>
          <Input
            type="email"
            placeholder="tu@email.com"
            className={authInputClass}
            disabled={submitting || !supabaseEnabled}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <label className="grid gap-2">
          <span className="text-xs font-black uppercase tracking-wide text-app-muted">Contraseña</span>
          <Input
            type="password"
            placeholder="Ingresá tu contraseña"
            className={authInputClass}
            disabled={submitting || !supabaseEnabled}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        <Button
          className="mt-2 min-h-12 rounded-lg bg-app-brand text-app-brand-fg text-base font-black shadow-lg hover:bg-app-brand"
          disabled={submitting || !supabaseEnabled}
          type="submit"
        >
          <LoadingLabel loading={submitting} label="Entrar" />
        </Button>
        <Link href="/recuperar" className="mt-1 justify-self-start text-xs font-bold text-app-brand hover:underline">
          ¿Olvidaste tu contraseña?
        </Link>
      </form>
      <p className="mt-6 text-sm font-bold text-app-muted">
        ¿No tenés cuenta?{" "}
        <Link href="/crear-cuenta" className="text-app-brand hover:underline">Crear cuenta</Link>
      </p>
      {message && <small className="auth-message">{message}</small>}
    </AuthLayout>
  );
}
