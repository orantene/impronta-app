"use client";

/**
 * useGateEmailCheck — debounced claim-email check while the guest is at the
 * contact gate (350ms after the address becomes a valid email). Extracted
 * verbatim from MiniChatPanel.tsx (W1-A decomposition pre-pass) to keep that
 * file under the 800-line cap. No logic changes.
 */

import { useEffect, useState } from "react";

import type { CheckGuestClaimEmailCallback } from "@/lib/inquiry/guest-chat-contract";
import type { Translator } from "@/i18n/interpolate";
import { claimEmailNotice } from "./claim-email-notice";
import { EMAIL_RE } from "./mini-chat-styles";

export function useGateEmailCheck({
  stage,
  email,
  onCheckClaimEmail,
  t,
}: {
  stage: "intro" | "gate" | "thread";
  email: string;
  onCheckClaimEmail: CheckGuestClaimEmailCallback | null;
  t: Translator;
}): { gateEmailNotice: string | null; gateEmailBlocksSubmit: boolean } {
  const [gateEmailNotice, setGateEmailNotice] = useState<string | null>(null);
  const [gateEmailBlocksSubmit, setGateEmailBlocksSubmit] = useState(false);

  useEffect(() => {
    if (stage !== "gate" || !onCheckClaimEmail) {
      setGateEmailNotice(null);
      setGateEmailBlocksSubmit(false);
      return;
    }

    const addr = email.trim();
    if (!EMAIL_RE.test(addr)) {
      setGateEmailNotice(null);
      setGateEmailBlocksSubmit(false);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        const res = await onCheckClaimEmail({ email: addr, replacePrimary: false });
        if (cancelled) return;
        if (!res.ok) {
          setGateEmailNotice(null);
          setGateEmailBlocksSubmit(false);
          return;
        }
        // Map the STATUS through the catalogs; res.message is hardcoded
        // English on the server and stays only as the unknown-status fallback.
        setGateEmailNotice(
          claimEmailNotice(t, res.status, { replacePrimary: false }, res.message),
        );
        setGateEmailBlocksSubmit(Boolean(res.blocksSubmit));
      })();
    }, 350);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [email, onCheckClaimEmail, stage, t]);

  return { gateEmailNotice, gateEmailBlocksSubmit };
}
