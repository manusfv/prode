"use client";

import { useState } from "react";

import { updateDisplayNameAction } from "@/app/actions";
import { LoadingLabel } from "@/components/badges";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useApp } from "@/components/app-context";
import { validatePasswordChange } from "@/lib/account";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import { ui } from "@/lib/ui-tokens";
import { cn } from "@/lib/utils";

export function AccountScreen() {
  const { currentUser, refreshSupabaseData } = useApp();

  const [name, setName] = useState(currentUser.displayName);
  const [savingName, setSavingName] = useState(false);
  const [nameMessage, setNameMessage] = useState("");

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState("");

  async function saveName() {
    if (savingName) return;
    setNameMessage("");
    setSavingName(true);
    try {
      const result = await updateDisplayNameAction(name);
      setNameMessage(result.message);
      if (result.ok) await refreshSupabaseData();
    } finally {
      setSavingName(false);
    }
  }

  async function savePassword() {
    if (savingPassword) return;
    setPasswordMessage("");

    const validation = validatePasswordChange(password, confirm);
    if (!validation.ok) {
      setPasswordMessage(validation.message);
      return;
    }

    const supabase = createSupabaseBrowserClient();
    if (!supabase) {
      setPasswordMessage("Supabase no está configurado.");
      return;
    }

    setSavingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        setPasswordMessage(error.message);
        return;
      }
      setPassword("");
      setConfirm("");
      setPasswordMessage("Contraseña actualizada.");
    } finally {
      setSavingPassword(false);
    }
  }

  return (
    <div className="grid max-w-xl gap-5">
      <Card className={cn(ui.panel, "grid gap-4 p-4")}>
        <div>
          <h2 className="m-0 text-lg font-black">Datos del perfil</h2>
          <p className="mt-1 text-sm text-app-muted">Cambiá cómo te ven en el prode.</p>
        </div>
        <label className="grid gap-2">
          <span className={ui.label}>Nombre</span>
          <Input
            type="text"
            className="min-h-11 rounded-lg border-app-line bg-app-surface px-3 text-base font-bold text-app-text"
            value={name}
            disabled={savingName}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label className="grid gap-2">
          <span className={ui.label}>Email</span>
          <Input
            type="email"
            className="min-h-11 rounded-lg border-app-line bg-app-surface-2 px-3 text-base font-bold text-app-muted"
            value={currentUser.email}
            readOnly
            disabled
          />
        </label>
        <Button className="justify-self-start" disabled={savingName} onClick={saveName}>
          <LoadingLabel loading={savingName} label="Guardar" />
        </Button>
        {nameMessage && <small className="text-sm font-bold text-app-muted">{nameMessage}</small>}
      </Card>

      <Card className={cn(ui.panel, "grid gap-4 p-4")}>
        <div>
          <h2 className="m-0 text-lg font-black">Contraseña</h2>
          <p className="mt-1 text-sm text-app-muted">Elegí una contraseña nueva.</p>
        </div>
        <label className="grid gap-2">
          <span className={ui.label}>Nueva contraseña</span>
          <Input
            type="password"
            className="min-h-11 rounded-lg border-app-line bg-app-surface px-3 text-base font-bold text-app-text"
            value={password}
            disabled={savingPassword}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        <label className="grid gap-2">
          <span className={ui.label}>Confirmar contraseña</span>
          <Input
            type="password"
            className="min-h-11 rounded-lg border-app-line bg-app-surface px-3 text-base font-bold text-app-text"
            value={confirm}
            disabled={savingPassword}
            onChange={(event) => setConfirm(event.target.value)}
          />
        </label>
        <Button className="justify-self-start" disabled={savingPassword} onClick={savePassword}>
          <LoadingLabel loading={savingPassword} label="Cambiar contraseña" />
        </Button>
        {passwordMessage && <small className="text-sm font-bold text-app-muted">{passwordMessage}</small>}
      </Card>
    </div>
  );
}
