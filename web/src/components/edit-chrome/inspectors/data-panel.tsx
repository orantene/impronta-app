"use client";

import { useEffect, useMemo, useState, type ChangeEvent } from "react";

import {
  BUILDER_DATA_SOURCE_REGISTRY,
  BUILDER_FIELD_BINDING_OPTIONS,
  builderDataSourceAllowedForPlan,
  builderNodeSupportsFieldBindings,
  builderNodeSupportsDataBinding,
  getBuilderDataBindingFindings,
  getBuilderDataSourceDefinition,
  getBuilderNodeFieldBindingProps,
  getCollectionFieldBindingOptions,
  getDefaultBuilderDataBinding,
  isCollectionDataSourceKey,
  normalizeBuilderFieldBindings,
  normalizeBuilderDataBinding,
  type BuilderCollectionDataSource,
  type BuilderDataBinding,
  type BuilderDataBindingMode,
  type BuilderDataSourceFieldDefinition,
  type BuilderDataSourceKey,
  type BuilderFieldBindingProp,
  type BuilderNode,
} from "@/lib/site-admin/builder-node";
import {
  listCollectionsAction,
} from "@/lib/site-admin/collections/actions";
import { collectionSourceKey } from "@/lib/site-admin/collections/types";
import { useEditContext } from "../edit-context";
import { Card, CardBody, CardHead, Field, FieldLabel, Helper, Segmented, Toggle } from "../kit";
import { KIT } from "./kit/tokens";

interface DataPanelProps {
  selectedBuilderNode: BuilderNode | null;
  onPatchBuilderNodeProps: (
    nodeId: string,
    patch: Record<string, unknown>,
  ) => Promise<{ ok: boolean; error?: string }>;
  onMutationError?: (message: string) => void;
}

/**
 * Wave 5A — load the workspace's content collections once (per editor session)
 * so the data inspector can offer them as bindable sources + their fields. A
 * module-level promise cache means every inspector instance shares one fetch;
 * the editor's "Collections" drawer bumps {@link bumpCollectionsCache} after a
 * mutation so the picker refreshes. Failures resolve to an empty list — the
 * built-in sources always remain available.
 */
let collectionsCachePromise: Promise<BuilderCollectionDataSource[]> | null = null;
// Bumped on every collection mutation so mounted pickers re-read the fresh list.
const collectionsCacheListeners = new Set<() => void>();

export function bumpCollectionsCache(): void {
  collectionsCachePromise = null;
  for (const notify of collectionsCacheListeners) notify();
}

function loadWorkspaceCollections(): Promise<BuilderCollectionDataSource[]> {
  if (!collectionsCachePromise) {
    collectionsCachePromise = listCollectionsAction()
      .then((result) =>
        result.ok
          ? result.data.map<BuilderCollectionDataSource>((collection) => ({
              sourceKey: collectionSourceKey(collection.id),
              label: collection.name,
              itemCount: collection.itemCount,
              fields: collection.fields.map<BuilderDataSourceFieldDefinition>(
                (field) => ({
                  key: field.key,
                  label: field.label,
                  kind:
                    field.type === "image"
                      ? "image"
                      : field.type === "url"
                        ? "href"
                        : "text",
                }),
              ),
            }))
          : [],
      )
      .catch(() => []);
  }
  return collectionsCachePromise;
}

function useWorkspaceCollections(): BuilderCollectionDataSource[] {
  const [collections, setCollections] = useState<BuilderCollectionDataSource[]>([]);
  useEffect(() => {
    let cancelled = false;
    const subscribe = () => {
      void loadWorkspaceCollections().then((list) => {
        if (!cancelled) setCollections(list);
      });
    };
    subscribe();
    collectionsCacheListeners.add(subscribe);
    return () => {
      cancelled = true;
      collectionsCacheListeners.delete(subscribe);
    };
  }, []);
  return collections;
}

export function DataPanel({
  selectedBuilderNode,
  onPatchBuilderNodeProps,
  onMutationError,
}: DataPanelProps) {
  const { workspacePlan } = useEditContext();
  const collections = useWorkspaceCollections();
  const persistedBinding = useMemo(
    () =>
      selectedBuilderNode
        ? normalizeBuilderDataBinding(
            (selectedBuilderNode.props as Record<string, unknown>).dataBinding,
          )
        : null,
    [selectedBuilderNode],
  );
  const [pendingBinding, setPendingBinding] = useState<BuilderDataBinding | null>(null);
  const persistedBindingSignature = persistedBinding ? JSON.stringify(persistedBinding) : "";

  useEffect(() => {
    setPendingBinding(null);
  }, [selectedBuilderNode?.id]);

  useEffect(() => {
    if (!pendingBinding) return;
    if (persistedBindingSignature === JSON.stringify(pendingBinding)) {
      setPendingBinding(null);
    }
  }, [pendingBinding, persistedBindingSignature]);

  if (!selectedBuilderNode) {
    return <SectionDataHintCard />;
  }
  if (!builderNodeSupportsDataBinding(selectedBuilderNode.kind)) {
    if (builderNodeSupportsFieldBindings(selectedBuilderNode.kind)) {
      return (
        <FieldBindingsPanel
          selectedBuilderNode={selectedBuilderNode}
          onPatchBuilderNodeProps={onPatchBuilderNodeProps}
          onMutationError={onMutationError}
        />
      );
    }
    return <UnsupportedDataNodeCard kind={selectedBuilderNode.kind} />;
  }

  const binding = pendingBinding ?? persistedBinding;
  const boundCollection = binding
    ? collections.find((entry) => entry.sourceKey === binding.sourceKey) ?? null
    : null;
  const source =
    getBuilderDataSourceDefinition(binding?.sourceKey) ??
    getBuilderDataSourceDefinition("featured_talent_profiles");
  const hasSourcePlanAccess = source
    ? builderDataSourceAllowedForPlan(source.key, workspacePlan)
    : true;
  const findings = getBuilderDataBindingFindings({
    ...selectedBuilderNode,
    props: {
      ...(selectedBuilderNode.props as Record<string, unknown>),
      dataBinding: binding ?? undefined,
    },
  } as BuilderNode, { workspacePlan });

  async function commitBinding(next: BuilderDataBinding | null) {
    if (!selectedBuilderNode) return;
    setPendingBinding(next);
    const result = await onPatchBuilderNodeProps(selectedBuilderNode.id, {
      dataBinding: next ?? undefined,
    });
    if (!result.ok && result.error) {
      setPendingBinding(null);
      onMutationError?.(result.error);
    }
  }

  function patchBinding(patch: Partial<BuilderDataBinding>) {
    const next = cleanBinding({
      ...(binding ??
        getDefaultBuilderDataBinding(
          (source?.key ?? "featured_talent_profiles") as BuilderDataSourceKey,
        )),
      ...patch,
    });
    void commitBinding(next);
  }

  return (
    <div
      className="flex flex-col gap-3"
      data-builder-data-panel="node"
      data-builder-data-target-kind={selectedBuilderNode.kind}
      data-builder-data-target-id={selectedBuilderNode.id}
    >
      <Card state={binding ? "active" : "default"}>
        <CardHead
          title="Data binding"
          sub={
            binding
              ? boundCollection?.label ?? source?.label ?? binding.sourceKey
              : "Manual by default"
          }
          iconAccent={binding ? "green" : "blue"}
          action={
            binding ? (
              <button
                type="button"
                className={KIT.subtleButton}
                onClick={() => {
                  void commitBinding(null);
                }}
              >
                Clear
              </button>
            ) : null
          }
        />
        <CardBody>
          <div className="flex flex-col gap-3">
            <Field flush>
              <FieldLabel>Source</FieldLabel>
              <select
                className={KIT.select}
                value={binding?.sourceKey ?? ""}
                onChange={(event: ChangeEvent<HTMLSelectElement>) => {
                  const nextSource = event.currentTarget.value;
                  if (!nextSource) {
                    void commitBinding(null);
                    return;
                  }
                  // A user collection (`collection:<id>`) binds directly and
                  // repeats by default — it only makes sense on a container, so
                  // for a collection source we seed `repeat` when applicable.
                  if (isCollectionDataSourceKey(nextSource)) {
                    void commitBinding({
                      sourceKey: nextSource,
                      ...(selectedBuilderNode?.kind === "container"
                        ? { repeat: true }
                        : {}),
                    });
                    return;
                  }
                  const sourceDef = getBuilderDataSourceDefinition(nextSource);
                  if (!sourceDef) return;
                  if (!builderDataSourceAllowedForPlan(sourceDef.key, workspacePlan)) {
                    return;
                  }
                  void commitBinding(getDefaultBuilderDataBinding(sourceDef.key));
                }}
                aria-label="Choose builder data source"
              >
                <option value="">Manual content</option>
                {BUILDER_DATA_SOURCE_REGISTRY.map((entry) => (
                  <option
                    key={entry.key}
                    value={entry.key}
                    disabled={!builderDataSourceAllowedForPlan(entry.key, workspacePlan)}
                  >
                    {entry.label}
                    {!builderDataSourceAllowedForPlan(entry.key, workspacePlan)
                      ? ` (${requiredPlanLabel(entry.requiredPlan)})`
                      : ""}
                  </option>
                ))}
                {collections.length > 0 ? (
                  <optgroup label="Your collections">
                    {collections.map((entry) => (
                      <option key={entry.sourceKey} value={entry.sourceKey}>
                        {entry.label}
                        {typeof entry.itemCount === "number"
                          ? ` (${entry.itemCount})`
                          : ""}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
              </select>
              <Helper>
                {binding && source
                  ? source.description
                  : "Keep this node manually edited, or connect it to workspace data."}
              </Helper>
            </Field>

            {binding && source?.supportsManualSelection ? (
              <Field flush>
                <FieldLabel>Selection mode</FieldLabel>
                <Segmented
                  fullWidth
                  compact
                  value={(binding.mode ?? "bound") as BuilderDataBindingMode}
                  onChange={(next) =>
                    patchBinding({ mode: next as BuilderDataBindingMode })
                  }
                  options={[
                    { value: "bound", label: "Bound" },
                    { value: "manual", label: "Manual" },
                    { value: "hybrid", label: "Hybrid" },
                  ]}
                />
                <Helper>
                  Bound stays synced to live data. Manual is fully curated. Hybrid mixes live data with operator curation.
                </Helper>
              </Field>
            ) : null}

            {binding && selectedBuilderNode.kind === "container" ? (
              <div style={{ padding: "4px 0" }}>
                <Toggle
                  on={binding.repeat === true}
                  onChange={(next) => patchBinding({ repeat: next || undefined })}
                  label={`Repeat over ${source?.label ?? "source"}`}
                  helper="The first nested block is the per-item template; empty data renders it once as fallback."
                />
              </div>
            ) : null}

            {binding && source && !hasSourcePlanAccess ? (
              <div
                className="rounded-lg border px-3 py-2 text-[11px] leading-snug text-amber-800"
                style={{
                  borderColor: "rgba(217, 119, 6, 0.35)",
                  background: "rgba(251, 191, 36, 0.12)",
                }}
                data-builder-data-plan-warning=""
              >
                This source requires {requiredPlanLabel(source.requiredPlan)}. Switch to
                a compatible source or upgrade this workspace plan.
              </div>
            ) : null}

            {binding && source?.recommendedMaxItems ? (
              <Field flush>
                <FieldLabel>Visible limit</FieldLabel>
                <input
                  type="number"
                  min={1}
                  max={100}
                  className={KIT.input}
                  aria-label="Visible limit"
                  data-builder-data-visible-limit
                  value={binding.maxItems ?? ""}
                  onChange={(event) => {
                    const raw = Number.parseInt(event.currentTarget.value, 10);
                    patchBinding({
                      maxItems: Number.isFinite(raw)
                        ? Math.max(1, Math.min(100, raw))
                        : undefined,
                    });
                  }}
                />
                <Helper>
                  Recommended: {source.recommendedMaxItems}. Free roster blocks should stay at 5.
                </Helper>
              </Field>
            ) : null}

            {binding && source?.supportsFiltering ? (
              <Field flush>
                <FieldLabel>Filter note</FieldLabel>
                <textarea
                  className={KIT.textarea}
                  rows={3}
                  value={binding.filterQuery ?? ""}
                  placeholder="Example: featured=true, location=Cancun, category=models"
                  onChange={(event) => patchBinding({ filterQuery: event.currentTarget.value })}
                />
                <Helper>
                  Wireframe for the future query builder. Today it stores operator intent.
                </Helper>
              </Field>
            ) : null}
          </div>
        </CardBody>
      </Card>

      <Card state={findings.some((finding) => finding.severity === "error") ? "warn" : "default"}>
        <CardHead title="Binding health" sub={`${findings.length} checks`} iconAccent="amber" />
        <CardBody>
          <div className="flex flex-col gap-2">
            {findings.map((finding) => (
              <div
                key={finding.id}
                className="rounded-lg border border-stone-200 bg-[#faf9f6] px-3 py-2"
                data-builder-data-finding={finding.id}
              >
                <p className="text-[12px] font-semibold text-stone-700">
                  {finding.message}
                </p>
                {finding.fix ? (
                  <button
                    type="button"
                    className={`${KIT.ghostButton} mt-2`}
                    data-builder-data-fix={finding.id}
                    onClick={() => patchBinding(finding.fix ?? {})}
                  >
                    Apply fix
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

function FieldBindingsPanel({
  selectedBuilderNode,
  onPatchBuilderNodeProps,
  onMutationError,
}: {
  selectedBuilderNode: BuilderNode;
  onPatchBuilderNodeProps: DataPanelProps["onPatchBuilderNodeProps"];
  onMutationError?: DataPanelProps["onMutationError"];
}) {
  const collections = useWorkspaceCollections();
  const propKeys = getBuilderNodeFieldBindingProps(selectedBuilderNode.kind);
  const persisted = normalizeBuilderFieldBindings(
    (selectedBuilderNode.props as Record<string, unknown>).fieldBindings,
    propKeys,
  );
  // Offer the built-in source fields PLUS every workspace-collection field
  // (deduped by key), so a node inside a collection-bound repeater can map its
  // text/image/link to a collection field. Tokens resolve by key at render, so
  // it works regardless of which collection the parent repeats.
  const bindingOptions: ReadonlyArray<BuilderDataSourceFieldDefinition> =
    dedupeFieldOptions([
      ...BUILDER_FIELD_BINDING_OPTIONS,
      ...collections.flatMap((collection) =>
        getCollectionFieldBindingOptions(collection),
      ),
    ]);
  async function patchFieldBinding(
    prop: BuilderFieldBindingProp,
    fieldKey: string,
  ) {
    const next = { ...(persisted ?? {}) };
    if (fieldKey) {
      next[prop] = fieldKey;
    } else {
      delete next[prop];
    }
    const result = await onPatchBuilderNodeProps(selectedBuilderNode.id, {
      fieldBindings: Object.keys(next).length > 0 ? next : undefined,
    });
    if (!result.ok && result.error) onMutationError?.(result.error);
  }

  return (
    <div
      className="flex flex-col gap-3"
      data-builder-data-panel="field-bindings"
      data-builder-data-target-kind={selectedBuilderNode.kind}
      data-builder-data-target-id={selectedBuilderNode.id}
    >
      <Card state={persisted ? "active" : "default"}>
        <CardHead title="Field bindings" sub="Repeat item props" iconAccent="green" />
        <CardBody>
          <div className="flex flex-col gap-3">
            {propKeys.map((prop) => (
              <Field key={prop} flush>
                <FieldLabel>{fieldBindingPropLabel(prop)}</FieldLabel>
                <select
                  className={KIT.select}
                  value={persisted?.[prop] ?? ""}
                  onChange={(event) => {
                    void patchFieldBinding(prop, event.currentTarget.value);
                  }}
                  aria-label={`${fieldBindingPropLabel(prop)} field binding`}
                >
                  <option value="">Manual fallback</option>
                  {bindingOptions.map((field) => (
                    <option key={`${prop}:${field.key}`} value={field.key}>
                      {field.label} ({field.key})
                    </option>
                  ))}
                </select>
              </Field>
            ))}
            <Helper>
              These fields resolve inside a repeating container; the saved manual
              value remains the fallback.
            </Helper>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

function SectionDataHintCard() {
  return (
    <Card state="muted">
      <CardHead title="Data tab" sub="Select a data-ready node" iconAccent="blue" />
      <CardBody>
        <p className="text-[12px] leading-5 text-stone-500">
          Select a container or data-ready block inside the canvas to connect it
          to roster, taxonomy, location, inquiry, CMS, asset, or custom-field data.
        </p>
      </CardBody>
    </Card>
  );
}

function dedupeFieldOptions(
  fields: ReadonlyArray<BuilderDataSourceFieldDefinition>,
): BuilderDataSourceFieldDefinition[] {
  const seen = new Map<string, BuilderDataSourceFieldDefinition>();
  for (const field of fields) {
    if (!seen.has(field.key)) seen.set(field.key, field);
  }
  return [...seen.values()];
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

function UnsupportedDataNodeCard({ kind }: { kind: string }) {
  return (
    <Card state="muted">
      <CardHead title="Manual node" sub={kind} iconAccent="default" />
      <CardBody>
        <p className="text-[12px] leading-5 text-stone-500">
          This node is edited directly. Bind the parent container when the whole
          group should repeat from live workspace data.
        </p>
      </CardBody>
    </Card>
  );
}

function cleanBinding(binding: BuilderDataBinding): BuilderDataBinding {
  const next: BuilderDataBinding = { sourceKey: binding.sourceKey };
  if (binding.mode) next.mode = binding.mode;
  if (binding.filterQuery?.trim()) next.filterQuery = binding.filterQuery.trim();
  if (binding.maxItems) next.maxItems = Math.max(1, Math.min(100, binding.maxItems));
  if (binding.repeat) next.repeat = true;
  return next;
}

function requiredPlanLabel(plan: string): string {
  switch (plan) {
    case "studio":
      return "Studio+";
    case "agency":
      return "Agency+";
    case "network":
      return "Network";
    default:
      return "Free+";
  }
}
