"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ModalShell, PrimaryButton, SecondaryButton } from "../../../primitives";

function useDesktopTaskShell() {
  const [isDesktop, setIsDesktop] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return window.innerWidth >= 720;
  });

  useEffect(() => {
    const update = () => setIsDesktop(window.innerWidth >= 720);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  return isDesktop;
}

export function TaskShell({
  open,
  onClose,
  title,
  subtitle,
  children,
  primaryActionLabel,
  onPrimaryAction,
  secondaryActionLabel,
  onSecondaryAction,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  primaryActionLabel?: string;
  onPrimaryAction?: () => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
}) {
  const isDesktop = useDesktopTaskShell();

  if (!open) return null;

  const content = (
    <div className="flex min-h-0 flex-1 flex-col bg-[var(--tc-canvas,#FAFAF7)]">
      <div className="border-b border-[rgba(11,11,13,0.10)] bg-white px-4 py-4 sm:px-5">
        <div className="text-[18px] font-semibold text-[var(--tc-primary)]">{title}</div>
        {subtitle ? (
          <div className="mt-1 text-[13px] leading-5 text-[#5F6368]">{subtitle}</div>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">{children}</div>
      {/* T9.2 — sticky above home indicator; stays visible with soft keyboard */}
      <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-2 border-t border-[rgba(11,11,13,0.10)] bg-white px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))] sm:px-5">
        <SecondaryButton onClick={onSecondaryAction ?? onClose}>
          {secondaryActionLabel ?? "Back"}
        </SecondaryButton>
        {primaryActionLabel ? (
          <PrimaryButton onClick={onPrimaryAction} disabled={!onPrimaryAction}>
            {primaryActionLabel}
          </PrimaryButton>
        ) : null}
      </div>
    </div>
  );

  if (isDesktop) {
    return (
      <ModalShell open={open} onClose={onClose} width={680}>
        {content}
      </ModalShell>
    );
  }

  return (
    <div className="fixed inset-0 z-[120] bg-[var(--tc-canvas,#FAFAF7)]">
      {content}
    </div>
  );
}
