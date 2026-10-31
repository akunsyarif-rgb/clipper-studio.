"use client";

import { useEffect, useState } from "react";
import { cloud } from "@/lib/cloud";
import { ACCESS_EVENT, getFeatureAccess, type Access } from "@/lib/gemini-access";

/** The AI key that is available right now (undefined while checking, null when there is none). Follows signing in and out. */
export function useGeminiAccess(): Access | null | undefined {
  const [access, setAccess] = useState<Access | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    const refresh = () => { void getFeatureAccess().then(a => { if (alive) setAccess(a); }); };
    refresh();
    const off = cloud.subscribe(refresh);
    window.addEventListener(ACCESS_EVENT, refresh);
    return () => { alive = false; off(); window.removeEventListener(ACCESS_EVENT, refresh); };
  }, []);
  return access;
}
