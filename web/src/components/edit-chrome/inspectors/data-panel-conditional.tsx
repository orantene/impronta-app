"use client";

/**
 * Wave 5B — the two inspector blocks that extend the data tab beyond binding:
 *   - #38 {@link VisibilityRulesCard}: an OPTIONAL per-node show/hide rule
 *     (locale / auth / named variant). Works for EVERY node kind; persists via
 *     the normal `patch: { visibilityCondition }` path; the renderer evaluates
 *     it server-side and omits the node when false.
 *   - #37 {@link FieldMapPreview}: a LIVE first-row preview for the field-mapper
 *     — resolves the nearest ancestor repeater's bound collection's first row
 *     and shows, per bindable prop, the value the renderer would emit (reusing
 *     the exact `buildBuilderFieldMapPreview` resolution).
 *
 * Split out of data-panel.tsx to keep that file under the line budget; these
 * are self-contained and imported back into the three DataPanel branches.
 */

import { useEffect, useMemo, useState } from "react";

import {
  BUILDER_VISIBILITY_VARIANT_MAX,
  buildBuilderFieldMapPreview,
  describeBuilderVisibilityCondition,
  EXPERIMENT_ELIGIBLE_KINDS,
  EXPERIMENT_MAX_ARMS,
  EXPERIMENT_VARIANT_LABEL_MAX,
  experimentArmShares,
  experimentVariantKeyAt,
  firstRepeatItemFromRecords,
  getBuilderNodeDataBinding,
  getNodeExperimentConfig,
  getBuilderNodeVisibilityCondition,
  isCollectionDataSourceKey,
  normalizeBuilderVisibilityCondition,
  type BuilderFieldBindingProp,
  type BuilderNode,
  type BuilderRepeatItem,
  type BuilderVisibilityAuth,
  type BuilderVisibilityCondition,
  type BuilderVisibilityLocale,
  type ExperimentPropOverride,
  type ExperimentVariant,
  type NodeExperimentConfig,
} from "@/lib/site-admin/builder-node";
import { getCollectionAction } from "@/lib/site-admin/collections/actions";
import {
  collectionIdFromSourceKey,
  collectionItemsToRecords,
} from "@/lib/site-admin/collections/types";
import { useBuilderTree } from "../builder-tree-bridge";
import { Card, CardBody, CardHead, Field, FieldLabel, Helper, Segmented } from "../kit";
import { KIT } from "./kit/tokens";

interface SharedProps {
  selectedBuilderNode: BuilderNode;
  onPatchBuilderNodeProps: (
    nodeId: string,
    patch: Record<string, unknown>,
  ) => Promise<{ ok: boolean; error?: string }>;
  onMutationError?: (message: string) => void;
}

function fieldBindingPropLabel(prop: BuilderFieldBindingProp): string {
  switch (prop) {
    case "label":
      return "Label";
    case "href":
      return "Link";
    case "src":
      return "Image source";
    case "alt":
      return "Alt text";
    default:
      return "Text";
  }
}

// ── #38 — node-level conditional visibility control ───────────────────────────

const VISIBILITY_LOCALE_OPTIONS: ReadonlyArray<{
  value: "" | BuilderVisibilityLocale;
  label: string;
}> = [
  { value: "", label: "Any" },
  { value: "en", label: "English" },
  { value: "es", label: "Spanish" },
];

const VISIBILITY_AUTH_OPTIONS: ReadonlyArray<{
  value: "" | BuilderVisibilityAuth;
  label: string;
}> = [
  { value: "", label: "Anyone" },
  { value: "signed_in", label: "Signed-in" },
  { value: "signed_out", label: "Signed-out" },
];

/**
 * "Visibility rules" — an OPTIONAL per-node condition that hides the block at
 * publish unless the visitor matches (locale / auth / a named variant flag).
 * Renders for EVERY node kind. The rule persists via the normal patch path
 * (`patch: { visibilityCondition }`); the renderer evaluates it server-side and
 * omits the node when false. Clearing all three controls removes the rule.
 */
export function VisibilityRulesCard({
  selectedBuilderNode,
  onPatchBuilderNodeProps,
  onMutationError,
}: SharedProps) {
  const condition = getBuilderNodeVisibilityCondition(selectedBuilderNode);
  const active = condition != null;

  async function commit(next: BuilderVisibilityCondition | null) {
    const normalized = normalizeBuilderVisibilityCondition(next);
    const result = await onPatchBuilderNodeProps(selectedBuilderNode.id, {
      visibilityCondition: normalized ?? undefined,
    });
    if (!result.ok && result.error) onMutationError?.(result.error);
  }

  function patch(part: Partial<BuilderVisibilityCondition>) {
    void commit({ ...(condition ?? {}), ...part });
  }

  return (
    <Card state={active ? "active" : "default"}>
      <CardHead
        title="Visibility rules"
        sub={active ? describeBuilderVisibilityCondition(condition) : "Always visible"}
        iconAccent={active ? "green" : "blue"}
        action={
          active ? (
            <button
              type="button"
              className={KIT.subtleButton}
              data-builder-visibility-clear
              onClick={() => {
                void commit(null);
              }}
            >
              Clear
            </button>
          ) : null
        }
      />
      <CardBody>
        <div className="flex flex-col gap-3" data-builder-visibility-rules>
          <Field flush>
            <FieldLabel>Language</FieldLabel>
            <Segmented
              fullWidth
              compact
              value={(condition?.locale ?? "") as "" | BuilderVisibilityLocale}
              onChange={(next) =>
                patch({ locale: next ? (next as BuilderVisibilityLocale) : undefined })
              }
              options={VISIBILITY_LOCALE_OPTIONS.map((option) => ({
                value: option.value,
                label: option.label,
              }))}
            />
            <Helper>Show this block only on the selected storefront language.</Helper>
          </Field>

          <Field flush>
            <FieldLabel>Visitor</FieldLabel>
            <Segmented
              fullWidth
              compact
              value={(condition?.auth ?? "") as "" | BuilderVisibilityAuth}
              onChange={(next) =>
                patch({ auth: next ? (next as BuilderVisibilityAuth) : undefined })
              }
              options={VISIBILITY_AUTH_OPTIONS.map((option) => ({
                value: option.value,
                label: option.label,
              }))}
            />
            <Helper>Restrict to signed-in or signed-out visitors.</Helper>
          </Field>

          <Field flush>
            <FieldLabel>Variant flag</FieldLabel>
            <input
              type="text"
              className={KIT.input}
              maxLength={BUILDER_VISIBILITY_VARIANT_MAX}
              value={condition?.variant ?? ""}
              placeholder="e.g. promo"
              aria-label="Visibility variant flag"
              data-builder-visibility-variant
              onChange={(event) => {
                const raw = event.currentTarget.value;
                patch({ variant: raw.trim() ? raw : undefined });
              }}
            />
            <Helper>
              Optional named flag. The block shows only when the page is rendered
              for this variant; an unknown variant always shows it.
            </Helper>
          </Field>

          <p className="text-[11px] leading-snug text-stone-500">
            Rules combine with AND. While editing, hidden blocks still appear on
            the canvas so you can select them; the live site applies the rule.
          </p>
        </div>
      </CardBody>
    </Card>
  );
}

// ── ABTEST-1 — minimal A/B experiment authoring (CTA / form nodes) ────────────

/** Which props the "B" variant may override, per eligible node kind. Kept to a
 *  tiny, meaningful set per kind so the affordance stays minimal. */
function experimentOverrideFieldsForKind(
  kind: string,
): ReadonlyArray<{ key: string; label: string; placeholder: string }> {
  if (kind === "button") {
    return [
      { key: "label", label: "Button text", placeholder: "e.g. Get a quote" },
      { key: "href", label: "Button link", placeholder: "/contact" },
    ];
  }
  if (kind === "form") {
    // The form's submit caption lives on a submit field, not a top-level prop;
    // for v1 we A/B a top-level marketing line many forms carry (layerLabel is
    // not user-facing). The most robust minimal override is the form `action`
    // is off-limits — instead expose a free "B headline" stored as a prop the
    // author can bind. Keep it to ONE field: a CTA-style label override.
    return [{ key: "label", label: "Variant label", placeholder: "Variant B copy" }];
  }
  // cta_group — a single group-level label override.
  return [{ key: "label", label: "Variant label", placeholder: "Variant B copy" }];
}

function mintExperimentId(nodeId: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `exp-${nodeId.slice(0, 6)}-${rand}`.slice(0, 40);
}

/** Author-facing letter for an arm index: 0→"A", 1→"B", … (uppercased key). */
function armLetter(index: number): string {
  return experimentVariantKeyAt(index).toUpperCase();
}

/** Format an arm's split share (0..1) as a rounded whole percent. */
function formatSharePercent(share: number): string {
  return `${Math.round(share * 100)}%`;
}

/**
 * "A/B test" — an OPTIONAL experiment on an eligible CTA / form node, supporting
 * a control ("A") plus up to {@link EXPERIMENT_MAX_ARMS}-1 challengers (B, C, …)
 * with optional per-arm weights (split shares). Variant A is the live node
 * (control); the author sets each challenger's prop overrides + weight here.
 * Enabling mints a stable experiment id; the shared renderer buckets each
 * visitor deterministically (weighted) and tags the element so the runtime
 * records `experiment_view` / `experiment_convert`. Persists via the normal
 * patch path (`patch: { experiment }`); clearing removes it.
 *
 * Weights are RELATIVE — leaving every weight blank/equal is an even split (and
 * normalizes to no weights at all, byte-stable with the original 2-arm engine).
 */
export function ABTestCard({
  selectedBuilderNode,
  onPatchBuilderNodeProps,
  onMutationError,
}: SharedProps) {
  const kind = selectedBuilderNode.kind;
  if (!EXPERIMENT_ELIGIBLE_KINDS.has(kind)) return null;

  const config = getNodeExperimentConfig(selectedBuilderNode);
  const active = config != null;
  const fields = experimentOverrideFieldsForKind(kind);
  const variants = config?.variants ?? [];
  const challengers = variants.slice(1); // arms B, C, … (control is index 0).
  const canAddArm = variants.length < EXPERIMENT_MAX_ARMS;
  // Show weight inputs once there is more than one challenger OR any arm already
  // carries an explicit weight — keeps the simple 2-arm case uncluttered.
  const showWeights =
    challengers.length > 1 || variants.some((v) => v.weight !== undefined);
  const shares = variants.length > 0 ? experimentArmShares(variants) : [];

  async function commit(next: NodeExperimentConfig | null) {
    const result = await onPatchBuilderNodeProps(selectedBuilderNode.id, {
      experiment: next ?? undefined,
    });
    if (!result.ok && result.error) onMutationError?.(result.error);
  }

  function enable() {
    void commit({
      experimentId: mintExperimentId(selectedBuilderNode.id),
      enabled: true,
      variants: [{ key: "a" }, { key: "b", propOverrides: {} }],
    });
  }

  /** Re-emit the config with a fresh variants array (re-keyed on normalize). */
  function commitVariants(nextVariants: ExperimentVariant[]) {
    if (!config) return;
    void commit({ ...config, variants: nextVariants });
  }

  /** Patch one prop override on challenger arm `armIndex` (0 = arm B). */
  function patchOverride(armIndex: number, key: string, raw: string) {
    if (!config) return;
    const next = variants.map((v) => ({ ...v }));
    const target = next[armIndex + 1]; // +1 → skip the control.
    if (!target) return;
    const overrides: Record<string, ExperimentPropOverride> = {
      ...(target.propOverrides ?? {}),
    };
    if (raw.trim()) overrides[key] = raw;
    else delete overrides[key];
    target.propOverrides = overrides;
    commitVariants(next);
  }

  /** Patch a weight on any arm (`armIndex` is the absolute arm index). */
  function patchWeight(armIndex: number, raw: string) {
    if (!config) return;
    const next = variants.map((v) => ({ ...v }));
    const target = next[armIndex];
    if (!target) return;
    const parsed = Number.parseFloat(raw);
    if (raw.trim() && Number.isFinite(parsed) && parsed > 0) {
      target.weight = parsed;
    } else {
      delete target.weight;
    }
    commitVariants(next);
  }

  function addArm() {
    if (!config || !canAddArm) return;
    const next = [
      ...variants.map((v) => ({ ...v })),
      { key: experimentVariantKeyAt(variants.length), propOverrides: {} },
    ];
    commitVariants(next);
  }

  /** Remove challenger arm `armIndex` (0 = arm B). The control is never removed. */
  function removeArm(armIndex: number) {
    if (!config) return;
    const next = variants
      .map((v) => ({ ...v }))
      .filter((_, i) => i !== armIndex + 1);
    commitVariants(next);
  }

  return (
    <Card state={active ? "active" : "default"}>
      <CardHead
        title="A/B test"
        sub={
          active
            ? variants.length > 2
              ? `${variants.length} variants — visitors split, conversions tracked`
              : "Two variants — visitors split, conversions tracked"
            : "Off — one version for everyone"
        }
        iconAccent={active ? "green" : "blue"}
        action={
          active ? (
            <button
              type="button"
              className={KIT.subtleButton}
              data-builder-experiment-clear
              onClick={() => {
                void commit(null);
              }}
            >
              Clear
            </button>
          ) : null
        }
      />
      <CardBody>
        {active ? (
          <div className="flex flex-col gap-3" data-builder-experiment-config>
            <p className="text-[11px] leading-snug text-stone-500">
              Variant A is the version you see on the canvas. Add one or more
              challengers below — visitors split between them. We record an
              impression and a conversion (
              {kind === "form" ? "form submit" : "click"}) for each.
            </p>

            {/* Control row — shows its computed share + an optional weight. */}
            <div
              className="rounded-lg border border-stone-200 bg-[#faf9f6] px-3 py-2"
              data-builder-experiment-arm="a"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12px] font-semibold text-stone-700">
                  Variant A · Control
                </span>
                <span className="text-[11px] text-stone-500">
                  {shares[0] != null ? formatSharePercent(shares[0]) : ""}
                </span>
              </div>
              {showWeights ? (
                <div className="mt-2">
                  <Field flush>
                    <FieldLabel>Weight</FieldLabel>
                    <input
                      type="number"
                      min={0}
                      step="any"
                      className={KIT.input}
                      value={variants[0]?.weight ?? ""}
                      placeholder="even"
                      aria-label="Variant A weight"
                      data-builder-experiment-weight="a"
                      onChange={(event) => patchWeight(0, event.currentTarget.value)}
                    />
                  </Field>
                </div>
              ) : null}
            </div>

            {/* Challenger arms — B, C, … each with its overrides + weight. */}
            {challengers.map((arm, armIndex) => {
              const overrides = arm.propOverrides ?? {};
              const letter = armLetter(armIndex + 1);
              return (
                <div
                  key={arm.key}
                  className="rounded-lg border border-stone-200 bg-white px-3 py-2"
                  data-builder-experiment-arm={arm.key}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[12px] font-semibold text-stone-700">
                      Variant {letter}
                      {shares[armIndex + 1] != null
                        ? ` · ${formatSharePercent(shares[armIndex + 1])}`
                        : ""}
                    </span>
                    <button
                      type="button"
                      className={KIT.subtleButton}
                      data-builder-experiment-remove-arm={arm.key}
                      aria-label={`Remove variant ${letter}`}
                      onClick={() => removeArm(armIndex)}
                    >
                      Remove
                    </button>
                  </div>
                  <div className="mt-2 flex flex-col gap-3">
                    {fields.map((field) => (
                      <Field flush key={field.key}>
                        <FieldLabel>{field.label}</FieldLabel>
                        <input
                          type="text"
                          className={KIT.input}
                          maxLength={EXPERIMENT_VARIANT_LABEL_MAX}
                          value={
                            typeof overrides[field.key] === "string"
                              ? (overrides[field.key] as string)
                              : ""
                          }
                          placeholder={field.placeholder}
                          aria-label={`Variant ${letter} ${field.label}`}
                          data-builder-experiment-override={`${arm.key}:${field.key}`}
                          onChange={(event) =>
                            patchOverride(armIndex, field.key, event.currentTarget.value)
                          }
                        />
                      </Field>
                    ))}
                    {showWeights ? (
                      <Field flush>
                        <FieldLabel>Weight</FieldLabel>
                        <input
                          type="number"
                          min={0}
                          step="any"
                          className={KIT.input}
                          value={arm.weight ?? ""}
                          placeholder="even"
                          aria-label={`Variant ${letter} weight`}
                          data-builder-experiment-weight={arm.key}
                          onChange={(event) =>
                            patchWeight(armIndex + 1, event.currentTarget.value)
                          }
                        />
                      </Field>
                    ) : null}
                  </div>
                </div>
              );
            })}

            {canAddArm ? (
              <button
                type="button"
                className={KIT.ghostButton}
                data-builder-experiment-add-arm
                onClick={addArm}
              >
                Add a variant
              </button>
            ) : (
              <Helper>Maximum of {EXPERIMENT_MAX_ARMS} variants.</Helper>
            )}

            <Helper>
              Leave a field blank to keep variant A’s value for it. A challenger
              with no overrides is dropped. Weights are relative — leave them
              blank for an even split.
            </Helper>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <button
              type="button"
              className={KIT.subtleButton}
              data-builder-experiment-enable
              onClick={enable}
            >
              Add a B variant
            </button>
            <Helper>
              Test two or more versions of this{" "}
              {kind === "form" ? "form" : "call to action"} and see which
              converts better.
            </Helper>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

// ── #37 — first-row preview for the field-mapper ──────────────────────────────

/**
 * Walk the page tree to the nearest ANCESTOR of `targetId` that is a repeating
 * container, and return its bound collection sourceKey (only collection sources
 * carry per-row field data we can preview). Returns null when the node is not
 * inside a collection-bound repeater.
 */
function findAncestorCollectionSourceKey(
  tree: ReadonlyArray<BuilderNode>,
  targetId: string,
): string | null {
  let found: string | null = null;
  const walk = (
    nodes: ReadonlyArray<BuilderNode>,
    inheritedSourceKey: string | null,
  ): boolean => {
    for (const node of nodes) {
      let sourceForChildren = inheritedSourceKey;
      const binding = getBuilderNodeDataBinding(node);
      if (
        node.kind === "container" &&
        binding?.repeat === true &&
        isCollectionDataSourceKey(binding.sourceKey)
      ) {
        sourceForChildren = binding.sourceKey;
      }
      if (node.id === targetId) {
        found = inheritedSourceKey;
        return true;
      }
      if ("children" in node && Array.isArray(node.children)) {
        if (walk(node.children, sourceForChildren)) return true;
      }
    }
    return false;
  };
  walk(tree, null);
  return found;
}

interface FirstRowState {
  loading: boolean;
  item: BuilderRepeatItem | null;
  collectionLabel: string | null;
  rowCount: number;
}

/**
 * Load the FIRST row of the collection a repeater binds, as a
 * {@link BuilderRepeatItem}. Reuses `getCollectionAction` +
 * `collectionItemsToRecords` (the exact projection the renderer consumes).
 */
function useFirstCollectionRow(sourceKey: string | null): FirstRowState {
  const [state, setState] = useState<FirstRowState>({
    loading: false,
    item: null,
    collectionLabel: null,
    rowCount: 0,
  });

  useEffect(() => {
    const id = sourceKey ? collectionIdFromSourceKey(sourceKey) : null;
    if (!sourceKey || !id) {
      setState({ loading: false, item: null, collectionLabel: null, rowCount: 0 });
      return;
    }
    let cancelled = false;
    setState((prev) => ({ ...prev, loading: true }));
    void getCollectionAction(id).then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setState({ loading: false, item: null, collectionLabel: null, rowCount: 0 });
        return;
      }
      const records = collectionItemsToRecords(result.data.fields, result.data.items);
      setState({
        loading: false,
        item: firstRepeatItemFromRecords(sourceKey, records),
        collectionLabel: result.data.name,
        rowCount: records.length,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [sourceKey]);

  return state;
}

/** The live field→value preview block inside the field-mapper. */
export function FieldMapPreview({
  selectedBuilderNode,
}: {
  selectedBuilderNode: BuilderNode;
}) {
  // WS2 — tree VALUE from the micro-store (builder-tree-bridge).
  const builderTree = useBuilderTree();
  const sourceKey = useMemo(
    () => findAncestorCollectionSourceKey(builderTree, selectedBuilderNode.id),
    [builderTree, selectedBuilderNode.id],
  );
  const { loading, item, collectionLabel, rowCount } = useFirstCollectionRow(sourceKey);
  const preview = useMemo(
    () => buildBuilderFieldMapPreview(selectedBuilderNode, item),
    [selectedBuilderNode, item],
  );

  if (!sourceKey) {
    return (
      <Card state="muted">
        <CardHead title="Live preview" sub="No bound collection" iconAccent="default" />
        <CardBody>
          <p className="text-[12px] leading-5 text-stone-500">
            Put this block inside a container that repeats over one of your
            collections to preview each row’s values here.
          </p>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card state="active">
      <CardHead
        title="Live preview"
        sub={
          loading
            ? "Loading first row…"
            : item
              ? `${collectionLabel ?? "Collection"} · row 1 of ${rowCount}`
              : `${collectionLabel ?? "Collection"} · no rows yet`
        }
        iconAccent="green"
      />
      <CardBody>
        <div className="flex flex-col gap-2" data-builder-field-map-preview>
          {preview.rows.map((row) => (
            <div
              key={row.prop}
              className="rounded-lg border border-stone-200 bg-[#faf9f6] px-3 py-2"
              data-builder-field-map-row={row.prop}
              data-builder-field-map-bound={row.bound ? "true" : "false"}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">
                  {fieldBindingPropLabel(row.prop)}
                </span>
                <span className="text-[10px] text-stone-400">
                  {row.boundField ? `← ${row.boundField}` : "manual"}
                </span>
              </div>
              <p className="mt-1 truncate text-[12px] text-stone-700" title={row.resolvedValue}>
                {row.resolvedValue ? row.resolvedValue : item ? "—" : "(no data)"}
              </p>
            </div>
          ))}
          {preview.rows.length === 0 ? (
            <p className="text-[12px] text-stone-500">
              This block has no mappable fields.
            </p>
          ) : null}
        </div>
      </CardBody>
    </Card>
  );
}
