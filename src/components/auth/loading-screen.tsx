"use client";

import Image from "next/image";

import { Card } from "@/components/ui/card";

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
