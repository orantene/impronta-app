"use client";

/**
 * Content inspector for the freeform `form` node. Extracted from
 * builder-node-content.tsx so date / file / consent + the inbox section
 * picker could land without growing that god file.
 */

import { useEffect, useState, type KeyboardEvent } from "react";

import type { BuilderFormNode } from "@/lib/site-admin/builder-node";
import { stripLockedKeysFromPatch } from "@/lib/site-admin/builder-node/prop-lock";
import {
  listInboxFormSectionsAction,
  type InboxFormSectionPick,
} from "@/lib/site-admin/edit-mode/form-inbox-sections-action";
import { useEditContext } from "../edit-context";
import { Card, CardBody, CardHead, Field, FieldLabel, Helper, Segmented, Toggle } from "../kit";
import { useInspectorT } from "./kit/use-inspector-t";
import { KIT } from "./kit/tokens";

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
        />
        <CardBody>
          <div className="flex flex-col gap-3">
            <p className={KIT.hint}>
              {t(
                "Edit each field below. Use Submit for the send action. Dropdown, radio, and checkbox need one option per line.",
              )}
            </p>
            {fields.map((field, fieldIndex) => (
              <div
                key={field.id}
                className="rounded-lg border px-3 py-2"
                style={{ borderColor: "rgba(24,24,27,0.16)", background: "var(--chrome-paper, #fff)" }}
              >
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <span className="flex-1 truncate text-[12px] font-semibold">
                      {field.label || `Field ${fieldIndex + 1}`}
                    </span>
                    <button
                      type="button"
                      className={KIT.subtleButton}
                      disabled={fieldIndex === 0}
                      onClick={() => {
                        const next = [...fields];
                        [next[fieldIndex - 1], next[fieldIndex]] = [
                          next[fieldIndex]!,
                          next[fieldIndex - 1]!,
                        ];
                        void commitPatch({ fields: next });
                      }}
                    >
                      {t("Up")}
                    </button>
                    <button
                      type="button"
                      className={KIT.subtleButton}
                      disabled={fieldIndex === fields.length - 1}
                      onClick={() => {
                        const next = [...fields];
                        [next[fieldIndex], next[fieldIndex + 1]] = [
                          next[fieldIndex + 1]!,
                          next[fieldIndex]!,
                        ];
                        void commitPatch({ fields: next });
                      }}
                    >
                      {t("Down")}
                    </button>
                    {fields.length > 1 ? (
                      <button
                        type="button"
                        className={KIT.subtleButton}
                        onClick={() => {
                          void commitPatch({
                            fields: fields.filter((_, i) => i !== fieldIndex),
                          });
                        }}
                      >
                        {t("Remove")}
                      </button>
                    ) : null}
                  </div>
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
              </div>
            ))}
            {fields.length < 24 ? (
              <button
                type="button"
                className={KIT.ghostButton}
                onClick={() => {
                  void commitPatch({
                    fields: [
                      ...fields,
                      {
                        id:
                          typeof crypto !== "undefined" && crypto.randomUUID
                            ? crypto.randomUUID()
                            : `field-${Date.now()}`,
                        name: `field_${fields.length + 1}`,
                        type: "text" as const,
                        label: "New field",
                      },
                    ],
                  });
                }}
              >
                {t("+ Add field")}
              </button>
            ) : null}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
