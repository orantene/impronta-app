"use client";

import { useEffect, useMemo, useState, type ChangeEvent } from "react";

import {
  BUILDER_DATA_SOURCE_REGISTRY,
  builderDataSourceAllowedForPlan,
  builderNodeSupportsDataBinding,
  getBuilderDataBindingFindings,
  getBuilderDataSourceDefinition,
  getDefaultBuilderDataBinding,
  normalizeBuilderDataBinding,
  type BuilderDataBinding,
  type BuilderDataBindingMode,
  type BuilderDataSourceKey,
  type BuilderNode,
} from "@/lib/site-admin/builder-node";
import { useEditContext } from "../edit-context";
import { Card, CardBody, CardHead, Field, FieldLabel, Helper, Segmented } from "../kit";
import { KIT } from "./kit/tokens";

interface DataPanelProps {
  selectedBuilderNode: BuilderNode | null;
  onPatchBuilderNodeProps: (
    nodeId: string,
    patch: Record<string, unknown>,
  ) => Promise<{ ok: boolean; error?: string }>;
  onMutationError?: (message: string) => void;
}

export function DataPanel({
  selectedBuilderNode,
  onPatchBuilderNodeProps,
  onMutationError,
}: DataPanelProps) {
  const { workspacePlan } = useEditContext();
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
    return <UnsupportedDataNodeCard kind={selectedBuilderNode.kind} />;
  }

  const binding = pendingBinding ?? persistedBinding;
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
          sub={binding ? source?.label ?? binding.sourceKey : "Manual by default"}
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
