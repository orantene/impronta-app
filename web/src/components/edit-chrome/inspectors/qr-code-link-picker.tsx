"use client";

// The `qr_code` block's link picker. A <select> over the workspace's links,
// loaded once via listLinksForPickerAction (tenant resolved from the session,
// never a client-passed id). Lives in its own component because it owns hooks,
// and the inspector's per-kind branch is an early return where hooks cannot run.
//
// TWO behaviours pinned by the QR & Links contract and NOT to be "fixed" away:
//   - PAUSED links are shown, with their status marked — never filtered. An
//     operator choosing what to print must see a paused code.
//   - A FAILED read is surfaced (an error + a manual-code fallback), never
//     swallowed into an empty list that reads as an empty workspace.
//
// "Create a link" is the first writer the links table ever had from the
// product: a readable code + a path on this site, minted through
// `mintLinkAction` (tenant from the session). On success the new link is
// prepended and selected, so the block renders a working QR at once.

import { useEffect, useState } from "react";

import type { LinkSummary } from "@/lib/links/link-store";
import { listLinksForPickerAction, mintLinkAction } from "@/lib/site-admin/links/actions";

import { KIT } from "./kit/tokens";

type PickerState =
  | { status: "loading" }
  | { status: "ready"; links: LinkSummary[] }
  | { status: "error" };

export function QrCodeLinkPicker({
  linkCode,
  onPick,
}: {
  linkCode: string;
  onPick: (code: string) => void;
}) {
  const [state, setState] = useState<PickerState>({ status: "loading" });

  useEffect(() => {
    let alive = true;
    void listLinksForPickerAction().then((result) => {
      if (!alive) return;
      setState(
        result.ok
          ? { status: "ready", links: result.links }
          : { status: "error" },
      );
    });
    return () => {
      alive = false;
    };
  }, []);

  if (state.status === "loading") {
    return (
      <div className={KIT.field}>
        <select className={KIT.input} disabled defaultValue="">
          <option value="">Loading your links…</option>
        </select>
      </div>
    );
  }

  if (state.status === "error") {
    // Surfaced, never []: say the read failed AND keep a manual code entry so
    // the operator is not stranded when the picker cannot load.
    return (
      <div className={KIT.field}>
        <p style={{ fontSize: 12, color: "#b4231f", margin: "0 0 4px" }}>
          Couldn&apos;t load your links. Enter a code by hand.
        </p>
        <input
          type="text"
          className={KIT.input}
          value={linkCode}
          placeholder="Paste a link code"
          onChange={(event) => onPick(event.currentTarget.value)}
        />
      </div>
    );
  }

  return (
    <div className={KIT.field}>
      <select
        className={KIT.input}
        value={linkCode}
        onChange={(event) => onPick(event.currentTarget.value)}
      >
        <option value="">Choose a link…</option>
        {state.links.map((link) => (
          <option key={link.id} value={link.code}>
            {(link.name || link.code) + (link.status === "paused" ? " (paused)" : "")}
          </option>
        ))}
      </select>
      <CreateLinkDisclosure
        onCreated={(link) => {
          setState({ status: "ready", links: [link, ...state.links] });
          onPick(link.code);
        }}
      />
    </div>
  );
}

function CreateLinkDisclosure({ onCreated }: { onCreated: (link: LinkSummary) => void }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [targetPath, setTargetPath] = useState("/");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <button
        type="button"
        className={KIT.subtleButton}
        onClick={() => setOpen(true)}
        data-testid="qr-create-link-open"
      >
        Create a link…
      </button>
    );
  }

  async function submit() {
    setBusy(true);
    setError(null);
    const result = await mintLinkAction({ code, name: name || code, targetPath });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onCreated(result.link);
    setOpen(false);
    setCode("");
    setName("");
    setTargetPath("/");
  }

  return (
    <div className={KIT.field} data-testid="qr-create-link">
      <label className={KIT.label}>
        Code
        <input
          type="text"
          className={KIT.input}
          value={code}
          placeholder="lumina"
          autoCapitalize="none"
          onChange={(event) => setCode(event.currentTarget.value.toLowerCase())}
        />
      </label>
      <p className={KIT.hint}>Guests open it at /q/{code || "…"} on this site.</p>
      <label className={KIT.label}>
        Name
        <input
          type="text"
          className={KIT.input}
          value={name}
          placeholder="Instagram bio"
          onChange={(event) => setName(event.currentTarget.value)}
        />
      </label>
      <label className={KIT.label}>
        Sends guests to
        <input
          type="text"
          className={KIT.input}
          value={targetPath}
          placeholder="/lumina"
          onChange={(event) => setTargetPath(event.currentTarget.value)}
        />
      </label>
      {error ? (
        <p role="alert" style={{ fontSize: 12, color: "#b4231f", margin: 0 }}>
          {error}
        </p>
      ) : null}
      <div className={KIT.row}>
        <button
          type="button"
          className={KIT.primaryButton}
          disabled={busy || !code || !targetPath}
          onClick={() => void submit()}
          data-testid="qr-create-link-submit"
        >
          {busy ? "Creating…" : "Create link"}
        </button>
        <button type="button" className={KIT.ghostButton} disabled={busy} onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </div>
  );
}
