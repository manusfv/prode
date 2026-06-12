"use client";

import Link from "next/link";
import { useState } from "react";

import { AuthLayout, authInputClass } from "@/components/auth/auth-layout";
import { LoadingLabel } from "@/components/badges";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { validateSignup } from "@/lib/account";
import { createSupabaseBrowserClient, hasSupabaseConfig } from "@/lib/supabase";

export default function SignupPage() {
  const supabaseEnabled = hasSupabaseConfig();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  async function submit() {
    if (submitting) return;
    setMessage("");

    const validation = validateSignup(name, email, password, confirm);
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
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { display_name: name || email.split("@")[0] } },
      });
      if (error) {
        setMessage(error.message);
        return;
      }
      // If Supabase creates a session immediately, AppShell redirects to the
      // pending screen. If email confirmation is required, this message stays.
      setMessage("Cuenta creada. Te vamos a aprobar para participar.");
      setPassword("");
      setConfirm("");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout eyebrow="Mundial 2026">
      <h1 className="mb-2 text-3xl font-black leading-tight text-app-text">Creá tu cuenta</h1>
      <p className="mb-6 text-sm font-bold leading-relaxed text-app-muted">
        {supabaseEnabled
          ? "Registrate con email y contraseña para participar del prode familiar."
          : "Configurá NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY."}
      </p>
      <div className="grid gap-4">
        <label className="grid gap-2">
          <span className="text-xs font-black uppercase tracking-wide text-app-muted">Nombre</span>
          <Input
            type="text"
            placeholder="Tu nombre"
            className={authInputClass}
            disabled={submitting || !supabaseEnabled}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
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
        <label className="grid gap-2">
          <span className="text-xs font-black uppercase tracking-wide text-app-muted">Confirmar contraseña</span>
          <Input
            type="password"
            placeholder="Repetí tu contraseña"
            className={authInputClass}
            disabled={submitting || !supabaseEnabled}
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
          />
        </label>
        <Button
          className="mt-2 min-h-12 rounded-lg bg-app-brand text-app-brand-fg text-base font-black shadow-lg hover:bg-app-brand"
          disabled={submitting || !supabaseEnabled}
          onClick={submit}
        >
          <LoadingLabel loading={submitting} label="Crear cuenta" />
        </Button>
      </div>
      <p className="mt-6 text-sm font-bold text-app-muted">
        ¿Ya tenés cuenta?{" "}
        <Link href="/ingresar" className="text-app-brand hover:underline">Entrar</Link>
      </p>
      {message && <small className="auth-message">{message}</small>}
    </AuthLayout>
  );
}
