"use client";

/**
 * Content inspector for the freeform `form` node. Extracted from
 * builder-node-content.tsx so date / file / consent + the inbox section
 * picker could land without growing that god file.
 */

import { useEffect, useState, type KeyboardEvent } from "react";

import {
  AtSign,
  Calendar,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CircleDot,
  FileUp,
  List,
  MessageSquare,
  Phone,
  Send,
  ShieldCheck,
  Trash2,
  Type,
} from "lucide-react";

import type { BuilderFormNode } from "@/lib/site-admin/builder-node";
import { stripLockedKeysFromPatch } from "@/lib/site-admin/builder-node/prop-lock";
import {
  listInboxFormSectionsAction,
  type InboxFormSectionPick,
} from "@/lib/site-admin/edit-mode/form-inbox-sections-action";
import { useEditContext } from "../edit-context";
import { Card, CardBody, CardHead, Field, FieldLabel, Helper, Segmented, Toggle } from "../kit";
import { ColorSwatchButton } from "./color-swatch-button";
import { useInspectorT } from "./kit/use-inspector-t";
import { KIT } from "./kit/tokens";
import { InspectorInfoTip } from "./kit";

type FormFieldType = BuilderFormNode["props"]["fields"][number]["type"];

export function FormNodeContentInspector({ node }: { node: BuilderFormNode }) {
  const { t } = useInspectorT();
  const { patchBuilderNodeProps, reportMutationError } = useEditContext();
  const [inboxSections, setInboxSections] = useState<InboxFormSectionPick[] | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    void listInboxFormSectionsAction().then((res) => {
      if (cancelled) return;
      setInboxSections(res.ok ? res.sections : []);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function commitPatch(patch: Record<string, unknown>) {
    const guarded = stripLockedKeysFromPatch(
      patch,
      node.props as Record<string, unknown>,
      node.lockedProps,
    );
    if (Object.keys(guarded).length === 0 && Object.keys(patch).length > 0) {
      reportMutationError("That field is locked by the platform admin and can’t be changed.");
      return;
    }
    const result = await patchBuilderNodeProps(node.id, guarded);
    if (!result.ok && result.error) reportMutationError(result.error);
  }

  const commitTextInput =
    (key: string, currentValue: string, allowEmpty = false) =>
    async (nextValue: string) => {
      const next = nextValue.trim();
      if (!allowEmpty && next.length === 0) return;
      const normalized = allowEmpty ? next || undefined : next;
      if (normalized === currentValue || (normalized ?? "") === currentValue) return;
      await commitPatch({ [key]: normalized });
    };

  const handleCommitKey =
    (commit: (value: string) => void) =>
    (event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (event.key !== "Enter" || event.shiftKey) return;
      event.preventDefault();
      commit(event.currentTarget.value);
      event.currentTarget.blur();
    };

  const fields = node.props.fields;
  /**
   * One field open at a time. The panel used to render every control of every
   * field at once - six fields became a wall of ~40 inputs ("so overwhelming",
   * the owner). A collapsed row shows what an operator scans for (icon, label,
   * type, required); everything else appears only for the row being edited.
   * Default: all collapsed. A newly added field opens itself.
   */
  const [openFieldId, setOpenFieldId] = useState<string | null>(null);
  const action = node.props.action ?? "internal";
  const isInternal = action.trim().toLowerCase() === "internal";
  const selectedInbox = inboxSections?.find((s) => s.id === node.props.sectionId);
  const FIELD_TYPE_OPTIONS: Array<{ value: FormFieldType; label: string }> = [
    { value: "text", label: t("Text") },
    { value: "email", label: t("Email") },
    { value: "tel", label: t("Phone") },
    { value: "textarea", label: t("Message") },
    { value: "select", label: t("Dropdown list") },
    { value: "radio", label: t("Radio group") },
    { value: "checkbox", label: t("Checkbox") },
    { value: "date", label: t("Date") },
    { value: "file", label: t("File") },
    { value: "consent", label: t("Consent") },
    { value: "submit", label: t("Submit button") },
  ];
  const FIELD_TYPE_ICONS: Record<FormFieldType, typeof Type> = {
    text: Type,
    email: AtSign,
    tel: Phone,
    textarea: MessageSquare,
    select: List,
    radio: CircleDot,
    checkbox: CheckSquare,
    date: Calendar,
    file: FileUp,
    consent: ShieldCheck,
    submit: Send,
  };
  const typeLabelFor = (type: FormFieldType) =>
    FIELD_TYPE_OPTIONS.find((o) => o.value === type)?.label ?? type;

  return (
    <div className="flex flex-col gap-3">
      <Card state="active">
        <CardHead
          title={t("Form")}
          sub={`${fields.length} field${fields.length === 1 ? "" : "s"}`}
          iconAccent="blue"
        />
        <CardBody>
          <div className="flex flex-col gap-3">
            <Field flush>
              <FieldLabel>{t("Where submissions go")}</FieldLabel>
              <Segmented
                fullWidth
                compact
                value={isInternal ? "internal" : "external"}
                onChange={(next) => {
                  void commitPatch({
                    action: next === "internal" ? "internal" : "https://",
                  });
                }}
                options={[
                  { value: "internal", label: t("Workspace inbox") },
                  { value: "external", label: t("External URL") },
                ]}
              />
              <Helper>
                {isInternal
                  ? t(
                      "Submissions are recorded in your workspace and emailed to admins. Pick the inbox form below.",
                    )
                  : t(
                      "Posts the form straight to your own endpoint (Formspree, a custom handler, …).",
                    )}
              </Helper>
            </Field>
            {isInternal ? (
              <Field flush>
                <FieldLabel>{t("Inbox form")}</FieldLabel>
                <select
                  className={KIT.select}
                  value={node.props.sectionId ?? ""}
                  onChange={(event) => {
                    const next = event.currentTarget.value.trim();
                    void commitPatch({ sectionId: next || undefined });
                  }}
                >
                  <option value="">{t("Select a contact form…")}</option>
                  {(inboxSections ?? []).map((section) => (
                    <option key={section.id} value={section.id}>
                      {section.name}
                      {section.routingMode === "inquiry"
                        ? ` (${t("Inquiry")})`
                        : ""}
                    </option>
                  ))}
                </select>
                <Helper>
                  {selectedInbox?.routingMode === "inquiry"
                    ? t(
                        "This destination opens a real inquiry, not an inbox row. File fields are not stored on that path.",
                      )
                    : t(
                        "Required for inbox delivery. Without a destination the form renders but submissions are rejected.",
                      )}
                </Helper>
              </Field>
            ) : (
              <Field flush>
                <FieldLabel info="Full https:// URL the form data POSTs to.">
                  {t("Submit URL")}
                </FieldLabel>
                <input
                  key={`${node.id}:action:${node.props.action ?? ""}`}
                  defaultValue={node.props.action ?? ""}
                  className={KIT.input}
                  placeholder="https://formspree.io/f/..."
                  onBlur={(event) => {
                    void commitTextInput("action", node.props.action ?? "", true)(
                      event.currentTarget.value,
                    );
                  }}
                  onKeyDown={handleCommitKey((value) => {
                    void commitTextInput("action", node.props.action ?? "", true)(value);
                  })}
                />
              </Field>
            )}
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHead
          title={t("Fields")}
          sub={`${fields.length} field${fields.length === 1 ? "" : "s"}`}
          action={
            <InspectorInfoTip
              title="Fields"
              content="Edit each field below. Use Submit for the send action. Dropdown, radio, and checkbox need one option per line."
            />
          }
        />
        <CardBody>
          <div className="flex flex-col gap-3">
            {fields.map((field, fieldIndex) => {
              const isOpen = openFieldId === field.id;
              const TypeIcon = FIELD_TYPE_ICONS[field.type] ?? Type;
              return (
              <div
                key={field.id}
                className="rounded-lg border"
                style={{
                  borderColor: isOpen ? "rgba(24,24,27,0.28)" : "rgba(24,24,27,0.14)",
                  background: "var(--chrome-paper, #fff)",
                }}
              >
                {/* Collapsed row: what an operator scans for, nothing else. */}
                <div className="flex items-center gap-1.5 px-2 py-1.5">
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-2 rounded px-1 py-1 text-left"
                    aria-expanded={isOpen}
                    onClick={() => setOpenFieldId(isOpen ? null : field.id)}
                  >
                    {isOpen ? (
                      <ChevronDown size={13} className="shrink-0 opacity-50" aria-hidden />
                    ) : (
                      <ChevronRight size={13} className="shrink-0 opacity-50" aria-hidden />
                    )}
                    <TypeIcon size={14} className="shrink-0 opacity-70" aria-hidden />
                    <span
                      className="min-w-0 flex-1 truncate text-[12px] font-semibold"
                      style={{ color: "rgba(24,24,27,0.88)" }}
                    >
                      {field.label || `Field ${fieldIndex + 1}`}
                    </span>
                    {/* The label wins the space fight: a row reading "E…" next
                        to a fully spelled-out CORREO ELECTRÓNICO badge has its
                        priorities backwards. The icon already carries the type;
                        the badge is a reminder, capped so it can never push the
                        label into an ellipsis. */}
                    <span
                      className="max-w-[72px] shrink-0 truncate text-[10px] uppercase tracking-wide"
                      style={{ color: "rgba(24,24,27,0.42)" }}
                    >
                      {typeLabelFor(field.type)}
                    </span>
                    {field.required ? (
                      <span
                        className="shrink-0 text-[12px] font-bold"
                        style={{ color: "#b4530a" }}
                        title={t("Required")}
                        aria-label={t("Required")}
                      >
                        *
                      </span>
                    ) : null}
                  </button>
                  <button
                    type="button"
                    className="rounded p-1 opacity-40 transition-opacity hover:opacity-90 disabled:opacity-15"
                    disabled={fieldIndex === 0}
                    title={t("Up")}
                    aria-label={t("Up")}
                    onClick={() => {
                      const next = [...fields];
                      [next[fieldIndex - 1], next[fieldIndex]] = [
                        next[fieldIndex]!,
                        next[fieldIndex - 1]!,
                      ];
                      void commitPatch({ fields: next });
                    }}
                  >
                    <ChevronUp size={13} aria-hidden />
                  </button>
                  <button
                    type="button"
                    className="rounded p-1 opacity-40 transition-opacity hover:opacity-90 disabled:opacity-15"
                    disabled={fieldIndex === fields.length - 1}
                    title={t("Down")}
                    aria-label={t("Down")}
                    onClick={() => {
                      const next = [...fields];
                      [next[fieldIndex], next[fieldIndex + 1]] = [
                        next[fieldIndex + 1]!,
                        next[fieldIndex]!,
                      ];
                      void commitPatch({ fields: next });
                    }}
                  >
                    <ChevronDown size={13} aria-hidden />
                  </button>
                  {fields.length > 1 ? (
                    <button
                      type="button"
                      className="rounded p-1 opacity-40 transition-opacity hover:opacity-90"
                      title={t("Remove")}
                      aria-label={t("Remove")}
                      onClick={() => {
                        void commitPatch({
                          fields: fields.filter((_, i) => i !== fieldIndex),
                        });
                      }}
                    >
                      <Trash2 size={13} aria-hidden />
                    </button>
                  ) : null}
                </div>
                {isOpen ? (
                <div className="flex flex-col gap-2 border-t px-3 pb-3 pt-2" style={{ borderColor: "rgba(24,24,27,0.10)" }}>
                  <Field flush>
                    <FieldLabel>{t("Type")}</FieldLabel>
                    <select
                      className={KIT.select}
                      value={field.type}
                      onChange={(event) => {
                        const nextType = event.currentTarget.value as FormFieldType;
                        const next = fields.map((f, i) => {
                          if (i !== fieldIndex) return f;
                          if (
                            (nextType === "select" || nextType === "radio") &&
                            !(f.options && f.options.length > 0)
                          ) {
                            return {
                              ...f,
                              type: nextType,
                              options: ["Option 1", "Option 2"],
                            };
                          }
                          return { ...f, type: nextType };
                        });
                        void commitPatch({ fields: next });
                      }}
                    >
                      {FIELD_TYPE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field flush>
                    <FieldLabel>{t("Label")}</FieldLabel>
                    <input
                      key={`${field.id}:label:${field.label}`}
                      defaultValue={field.label}
                      className={KIT.input}
                      placeholder={field.type === "submit" ? "e.g. Send" : "e.g. Email"}
                      onBlur={(event) => {
                        const next = event.currentTarget.value.trim();
                        if (!next || next === field.label) return;
                        void commitPatch({
                          fields: fields.map((f, i) =>
                            i === fieldIndex ? { ...f, label: next } : f,
                          ),
                        });
                      }}
                    />
                  </Field>
                  {field.type !== "submit" ? (
                    <>
                      <Field flush>
                        <FieldLabel info={t("The submission key. Use “email” and “name” for the contact fields.")}>
                          {t("Field name")}
                        </FieldLabel>
                        <input
                          key={`${field.id}:name:${field.name}`}
                          defaultValue={field.name}
                          className={KIT.input}
                          placeholder="e.g. email"
                          onBlur={(event) => {
                            const next = event.currentTarget.value.trim();
                            if (!next || next === field.name) return;
                            void commitPatch({
                              fields: fields.map((f, i) =>
                                i === fieldIndex ? { ...f, name: next } : f,
                              ),
                            });
                          }}
                        />
                      </Field>
                      {field.type === "consent" ? (
                        <Field flush>
                          <FieldLabel>{t("Consent")}</FieldLabel>
                          <textarea
                            key={`${field.id}:consent:${field.consentText ?? ""}`}
                            defaultValue={field.consentText ?? ""}
                            className={KIT.input}
                            rows={3}
                            placeholder={t("I agree to the privacy policy.")}
                            onBlur={(event) => {
                              const next = event.currentTarget.value.trim();
                              if (next === (field.consentText ?? "")) return;
                              void commitPatch({
                                fields: fields.map((f, i) =>
                                  i === fieldIndex
                                    ? { ...f, consentText: next || undefined }
                                    : f,
                                ),
                              });
                            }}
                          />
                        </Field>
                      ) : (
                        <Field flush>
                          <FieldLabel>{t("Placeholder")}</FieldLabel>
                          <input
                            key={`${field.id}:placeholder:${field.placeholder ?? ""}`}
                            defaultValue={field.placeholder ?? ""}
                            className={KIT.input}
                            placeholder={t("Optional hint text")}
                            onBlur={(event) => {
                              const next = event.currentTarget.value.trim();
                              if (next === (field.placeholder ?? "")) return;
                              void commitPatch({
                                fields: fields.map((f, i) =>
                                  i === fieldIndex
                                    ? { ...f, placeholder: next || undefined }
                                    : f,
                                ),
                              });
                            }}
                          />
                        </Field>
                      )}
                      {field.type === "select" || field.type === "radio" ? (
                        <Field flush>
                          <FieldLabel>{t("Options")}</FieldLabel>
                          <textarea
                            key={`${field.id}:options:${(field.options ?? []).join("\n")}`}
                            defaultValue={(field.options ?? []).join("\n")}
                            className={KIT.input}
                            rows={3}
                            placeholder={t("One option per line")}
                            onBlur={(event) => {
                              const next = event.currentTarget.value
                                .split("\n")
                                .map((line) => line.trim())
                                .filter(Boolean)
                                .slice(0, 24);
                              const prev = field.options ?? [];
                              if (
                                next.length === prev.length &&
                                next.every((opt, i) => opt === prev[i])
                              ) {
                                return;
                              }
                              void commitPatch({
                                fields: fields.map((f, i) =>
                                  i === fieldIndex ? { ...f, options: next } : f,
                                ),
                              });
                            }}
                          />
                        </Field>
                      ) : null}
                      {field.type === "file" ? (
                        <Helper>
                          {t(
                            "Files only store when this form posts to an inbox destination that also declares a matching file field. Inquiry destinations cannot keep uploads.",
                          )}
                        </Helper>
                      ) : null}
                      <div style={{ padding: "4px 0" }}>
                        <Toggle
                          on={field.required ?? false}
                          onChange={(nextOn) => {
                            void commitPatch({
                              fields: fields.map((f, i) =>
                                i === fieldIndex ? { ...f, required: nextOn } : f,
                              ),
                            });
                          }}
                          label={t("Required")}
                          helper={t("Visitors must fill this field before submitting.")}
                        />
                      </div>
                    </>
                  ) : null}
                </div>
                ) : null}
              </div>
              );
            })}
            {fields.length < 24 ? (
              <button
                type="button"
                className={KIT.ghostButton}
                onClick={() => {
                  const id =
                    typeof crypto !== "undefined" && crypto.randomUUID
                      ? crypto.randomUUID()
                      : `field-${Date.now()}`;
                  void commitPatch({
                    fields: [
                      ...fields,
                      {
                        id,
                        name: `field_${fields.length + 1}`,
                        type: "text" as const,
                        label: "New field",
                      },
                    ],
                  });
                  // A field you just added is the one you are about to edit.
                  setOpenFieldId(id);
                }}
              >
                {t("+ Add field")}
              </button>
            ) : null}
          </div>
        </CardBody>
      </Card>

      {/* ── field style ─────────────────────────────────────────────────────
       *  The one place the INPUT BOXES can be styled. The node's Style tab
       *  dresses the form wrapper; until this card existed the fields
       *  themselves were untouchable from the builder - the renderer's
       *  defaults, sound or not, were the only option. Unset = those
       *  token-driven defaults, so existing forms are byte-identical. */}
      <Card>
        <CardHead title={t("Field style")} sub={t("Borders, fill and corners of the inputs")} />
        <CardBody>
          <div className="flex flex-col gap-3">
            <Field flush>
              <FieldLabel info={t("The outline of each input box. Leave on Default to follow the site's palette.")}>
                {t("Border color")}
              </FieldLabel>
              <div className="flex items-center gap-2">
                <ColorSwatchButton
                  color={node.props.fieldBorderColor ?? ""}
                  ariaLabel={t("Border color")}
                  dataAttr={["data-form-field-border-swatch", node.id]}
                  onChange={(next) => void commitPatch({ fieldBorderColor: next })}
                />
                <span className={KIT.hint}>
                  {node.props.fieldBorderColor ?? t("Default")}
                </span>
                {node.props.fieldBorderColor ? (
                  <button
                    type="button"
                    className={KIT.subtleButton}
                    onClick={() => void commitPatch({ fieldBorderColor: undefined })}
                  >
                    {t("Reset")}
                  </button>
                ) : null}
              </div>
            </Field>
            <Field flush>
              <FieldLabel info={t("The background inside each input box.")}>
                {t("Field fill")}
              </FieldLabel>
              <div className="flex items-center gap-2">
                <ColorSwatchButton
                  color={node.props.fieldBackground ?? ""}
                  ariaLabel={t("Field fill")}
                  dataAttr={["data-form-field-bg-swatch", node.id]}
                  onChange={(next) => void commitPatch({ fieldBackground: next })}
                />
                <span className={KIT.hint}>
                  {node.props.fieldBackground ?? t("Default")}
                </span>
                {node.props.fieldBackground ? (
                  <button
                    type="button"
                    className={KIT.subtleButton}
                    onClick={() => void commitPatch({ fieldBackground: undefined })}
                  >
                    {t("Reset")}
                  </button>
                ) : null}
              </div>
            </Field>
            <Field flush>
              <FieldLabel>{t("Corners")}</FieldLabel>
              <Segmented
                fullWidth
                compact
                value={node.props.fieldCornerRadius ?? "3px"}
                onChange={(next) => {
                  void commitPatch({
                    fieldCornerRadius: next === "3px" ? undefined : next,
                  });
                }}
                options={[
                  { value: "0px", label: t("Sharp") },
                  { value: "3px", label: t("Soft") },
                  { value: "10px", label: t("Round") },
                ]}
              />
            </Field>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
