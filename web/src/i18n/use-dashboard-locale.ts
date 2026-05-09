"use client";
import { useEffect, useState } from "react";
import { LOCALE_COOKIE } from "./locale-middleware";

export function useDashboardLocale(): string {
  const [locale, setLocale] = useState("en");
  useEffect(() => {
    const m = document.cookie.match(new RegExp(`(?:^|; )${LOCALE_COOKIE}=([^;]*)`));
    if (m) setLocale(decodeURIComponent(m[1]));
  }, []);
  return locale;
}
