"use client";

/**
 * ClientSheet (board D15): edit name / phone / email, a two-matches list
 * from `messagingMatchCustomers`, a "phone belongs to another client"
 * refusal with a link to that client, identity level chips with the help
 * sentence, and Save.
 *
 * Contract: `ClientSheetProps` (`./contracts`). Its core is a two-action
 * routing sheet (`capture_identity` / `edit_contact`); the optional
 * `matchState` / `onFieldChange` / `onSelectMatch` / `onSave` fields
 * (D-MSG-91) turn it into the fuller inline editor. When the shell does not
 * pass `matchState`, the sheet is the minimal summary with an "Edit contact"
 * button that calls `onAction("edit_contact")`.
 */

import { IdentityPill } from "../kit/StateTags";
import { OptionRow } from "../kit/OptionRow";
import { Btn } from "../kit/primitives";
import { RefusalLine } from "../kit/RefusalLine";
import "../kit/tokens.css";
import { Sheet } from "../kit/Sheet";

import type { IdentityLevel } from "@/lib/messaging/types";

import type { ClientSheetProps } from "./contracts";

export function ClientSheet(props: ClientSheetProps) {
  const { essentials, open, onClose, copy, variant, onAction, matchState, onFieldChange, onSelectMatch, onSave } = props;
  const level: IdentityLevel = essentials.customer.identityLevel;
  const help = copy.client.help[level];

  return (
    <Sheet
      open={open}
      title={copy.client.title}
      copy={copy}
      onClose={onClose}
      variant={variant === "mobile" ? "mobile-h60" : "desktop"}
      width={520}
      hint={variant === "mobile" ? undefined : help}
    >
      <div className="msgv5" data-client-sheet>
        <div data-identity-row>
          <IdentityPill level={level} copy={copy} />
          {variant === "mobile" ? <span data-identity-help>{help}</span> : null}
        </div>

        {matchState ? (
          <>
            <div className="fld">
              <label htmlFor="msgv5-client-name">{copy.idCapture.name}</label>
              <input
                id="msgv5-client-name"
                className="in"
                value={matchState.name}
                disabled={matchState.busy}
                onChange={(e) => onFieldChange?.("name", e.target.value)}
              />
            </div>
            <div className="split">
              <div className="fld">
                <label htmlFor="msgv5-client-phone">{copy.idCapture.phone}</label>
                <input
                  id="msgv5-client-phone"
                  className="in"
                  inputMode="tel"
                  value={matchState.phone}
                  disabled={matchState.busy}
                  onChange={(e) => onFieldChange?.("phone", e.target.value)}
                />
              </div>
              <div className="fld">
                <label htmlFor="msgv5-client-email">{copy.idCapture.email}</label>
                <input
                  id="msgv5-client-email"
                  className="in"
                  inputMode="email"
                  value={matchState.email}
                  disabled={matchState.busy}
                  onChange={(e) => onFieldChange?.("email", e.target.value)}
                />
              </div>
            </div>

            {matchState.refusal ? (
              <RefusalLine code={matchState.refusal} copy={copy} variant={variant} />
            ) : null}

            {matchState.matches.length > 0 ? (
              <section data-two-matches>
                <h4>{copy.client.twoMatches}</h4>
                {matchState.matches.map((m) => (
                  <OptionRow
                    key={m.customerId ?? m.displayName ?? "match"}
                    control="radio"
                    selected={matchState.selected === (m.customerId ?? "new")}
                    title={m.displayName ?? copy.idCapture.createNew}
                    sub={[m.level === "phone" ? copy.idCapture.samePhoneOnly : null, m.email ?? m.phoneE164].filter(Boolean).join(" · ")}
                    disabled={matchState.busy}
                    onSelect={onSelectMatch && m.customerId ? () => onSelectMatch(m.customerId as string) : undefined}
                    variant={variant}
                  />
                ))}
                <OptionRow
                  control="radio"
                  selected={matchState.selected === "new"}
                  title={copy.client.keepAsNew}
                  disabled={matchState.busy}
                  onSelect={onSelectMatch ? () => onSelectMatch("new") : undefined}
                  variant={variant}
                />
                {matchState.selected !== "new" ? (
                  <Btn size="sm" onClick={() => onAction("capture_identity")} data-link-client>
                    {copy.client.linkThisClient}
                  </Btn>
                ) : null}
              </section>
            ) : null}

            <Btn size="sm" variant="primary" busy={matchState.busy} onClick={onSave} data-client-save>
              {matchState.busy ? copy.client.saving : copy.client.save}
            </Btn>
          </>
        ) : (
          <>
            <dl className="sum-grid" data-client-summary>
              <dt>{copy.idCapture.name}</dt>
              <dd>{essentials.customer.name || copy.state.noIdentity}</dd>
              <dt>{copy.idCapture.phone}</dt>
              <dd>{essentials.customer.phone ?? ""}</dd>
              <dt>{copy.idCapture.email}</dt>
              <dd>{essentials.customer.email ?? ""}</dd>
            </dl>
            <Btn size="sm" onClick={() => onAction("edit_contact")} data-edit-contact>
              {copy.client.editContact}
            </Btn>
          </>
        )}
      </div>
    </Sheet>
  );
}
