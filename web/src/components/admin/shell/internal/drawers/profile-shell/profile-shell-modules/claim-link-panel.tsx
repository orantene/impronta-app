"use client";

/**
 * The claim link, shown to an admin after a claim invite is issued.
 *
 * WHY THIS EXISTS
 * `sendTalentClaimInvite` has always returned a `redeem_url`; the invite modal
 * threw it away and only toasted "invite sent". That left the admin with
 * exactly one delivery channel — email to whatever address is on the profile —
 * and on a pre-launch roster those addresses are largely typed from memory:
 * on the live Impronta roster, 13 of 47 are structurally unroutable
 * (`@placeholder.impronta.test`, `gmail.comest`, one missing its `@`
 * altogether) and the rest were never confirmed by the talent. SMS delivery is
 * documented as a later phase and is not switched on.
 *
 * So the link is not a convenience, it is the only channel that reliably
 * works. An admin copies it and sends it through whatever they actually use to
 * reach that person, which for this roster is WhatsApp.
 *
 * Split into its own file rather than inlined: the parent module is at its
 * 800-line ceiling, and `ratchet/no-new-inline-style` freezes new inline
 * styles under components/admin/shell, so this is written with classes.
 */

import React from "react";

export function ClaimLinkPanel({
  link,
  talentName,
  t,
  onToast,
}: {
  link: string;
  talentName: string;
  t: (s: string) => string;
  onToast: (msg: string) => void;
}) {
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(link);
      onToast(t("Claim link copied"));
    } catch {
      // Clipboard access can be refused (permissions, insecure origin, an
      // unfocused document). The field is selectable, so tell the admin that
      // rather than failing silently.
      onToast(t("Couldn't copy. Select the link and copy it manually."));
    }
  };

  return (
    <div className="mb-2.5 rounded-[10px] border border-admin-border bg-white p-3">
      <div className="mb-1.5 text-[11.5px] font-semibold">{t("Claim link")}</div>
      <div className="flex items-center gap-2">
        <input
          readOnly
          value={link}
          onFocus={(e) => e.currentTarget.select()}
          aria-label={t("Claim link")}
          className="min-w-0 flex-1 rounded-lg border border-admin-border bg-white px-2.5 py-1.5 text-[11.5px]"
        />
        <button
          type="button"
          onClick={copyLink}
          className="cursor-pointer whitespace-nowrap rounded-full border-none bg-admin-fill px-3 py-1.5 text-[11.5px] font-semibold text-white"
        >
          {t("Copy")}
        </button>
      </div>
      <div className="mt-1.5 text-[11px] leading-relaxed text-admin-ink-dim">
        {t(
          "Send this to {name} however you actually reach them. It works whether or not the email above is real.",
        ).replace("{name}", talentName)}
      </div>
    </div>
  );
}

/**
 * The "invite sent, waiting for them to claim" state.
 *
 * Lives here rather than in the parent modal for two reasons: the parent is at
 * its 800-line ceiling, and this block is where the claim link belongs, so the
 * two travel together.
 *
 * Two controls that used to be theatre are now real:
 *   • "Resend invite" called nothing — it toasted and returned. It now goes
 *     through `sendTalentClaimInvite` again, which revokes the prior pending
 *     invite and mints a fresh one.
 *   • A "Simulate talent accepting (demo)" button shipped in this production
 *     surface and flipped local state to "claimed" without touching the
 *     database. It is gone.
 */
export function ClaimInvitedState({
  contact,
  talentName,
  inviteLink,
  t,
  onToast,
  onResend,
  onCancel,
}: {
  contact: string;
  talentName: string;
  inviteLink: string | null;
  t: (s: string) => string;
  onToast: (msg: string) => void;
  onResend: () => void;
  onCancel: () => void;
}) {
  return (
    <div>
      <div className="mb-2.5 flex w-fit items-center gap-2 rounded-full bg-admin-amber-soft px-3 py-2 text-xs font-semibold text-admin-amber-deep">
        <span className="size-1.5 rounded-full bg-current" />
        {t("Invite sent to {contact} · waiting for {name} to claim")
          .replace("{contact}", contact)
          .replace("{name}", talentName)}
      </div>

      {inviteLink && (
        <ClaimLinkPanel
          link={inviteLink}
          talentName={talentName}
          t={t}
          onToast={onToast}
        />
      )}

      <div className="mb-2 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onResend}
          className="cursor-pointer rounded-full border border-admin-border bg-transparent px-3 py-2 text-xs font-semibold"
        >
          ↺ {t("Resend invite")}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="cursor-pointer rounded-full border border-admin-border bg-transparent px-3 py-2 text-xs font-semibold text-admin-ink-muted"
        >
          × {t("Cancel invite")}
        </button>
      </div>

      <div className="text-[11px] leading-relaxed text-admin-ink-dim">
        {t(
          "You can keep editing while the invite is pending. Talent's first edit will overwrite drafts in the fields they have permission for.",
        )}
      </div>
    </div>
  );
}
