"use client";

import { useEffect, useState } from "react";

const initialRenderNowIso = "2026-06-07T23:00:00.000Z";

export function useHydratedNow() {
  const [now, setNow] = useState(() => new Date(initialRenderNowIso));

  useEffect(() => {
    setNow(new Date());
  }, []);

  return now;
}
