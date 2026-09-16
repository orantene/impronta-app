"use client";

/** The 8-digit code: auto-submits when complete, resend after a cooldown, change email. */

import { useEffect, useState } from "react";

import { OtpCodeInput } from "@/components/auth/otp-code-input";
import { SIGNUP_RESEND_COOLDOWN_SECONDS } from "@/components/auth/signup-code-confirm";

import { GhostLink, Notice, Sub, Title } from "../ui";

export function CodeStep({
  t,
  email,
  busy,
  error,
  notice,
  onVerify,
  onResend,
  onChangeEmail,
}: {
  t: (key: string) => string;
  email: string;
  busy: boolean;
  error: string | null;
  notice: string | null;
  onVerify: (code: string) => void;
  onResend: () => void;
  onChangeEmail: () => void;
}) {
  const [resetKey, setResetKey] = useState(0);
  const [cooldown, setCooldown] = useState(SIGNUP_RESEND_COOLDOWN_SECONDS);
  useEffect(() => {
    if (cooldown <= 0) return;
    const id = window.setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => window.clearTimeout(id);
  }, [cooldown]);
  return (
    <div data-testid="onb-code">
      <Title>{t("public.onboarding.code.title")}</Title>
      <Sub>{t("public.onboarding.code.sub").replace("{email}", email)}</Sub>
      <div className="mt-5" aria-busy={busy}>
        <OtpCodeInput name="code" disabled={busy} invalid={!!error} resetKey={resetKey} onComplete={(code) => onVerify(code)} />
      </div>
      {busy ? <p className="mt-2 text-[0.8125rem]" style={{ color: "var(--tl-muted)" }}>{t("public.onboarding.code.verifying")}</p> : null}
      {error ? <Notice tone="error" testId="onb-error">{error}</Notice> : null}
      {notice ? <Notice tone="muted" testId="onb-notice">{notice}</Notice> : null}
      <div className="mt-5 flex flex-col items-center gap-3">
        {cooldown > 0 ? (
          <span className="text-[0.875rem]" style={{ color: "var(--tl-muted)" }} data-testid="onb-resend-wait">
            {t("public.onboarding.code.resendIn").replace("{s}", String(cooldown))}
          </span>
        ) : (
          <GhostLink
            onClick={() => {
              setCooldown(SIGNUP_RESEND_COOLDOWN_SECONDS);
              setResetKey((k) => k + 1);
              onResend();
            }}
            testId="onb-resend"
          >
            {t("public.onboarding.code.resend")}
          </GhostLink>
        )}
        <GhostLink onClick={onChangeEmail} testId="onb-change-email">{t("public.onboarding.code.changeEmail")}</GhostLink>
      </div>
    </div>
  );
}
