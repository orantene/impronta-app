"use client";

import {
  useEffect,
  useMemo,
  useState,
  type DragEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";

import { RichEditor } from "@/components/edit-chrome/rich-editor";
import {
  BUILDER_ICON_REGISTRY,
  BUILDER_NODE_COMPOSITION_PRESETS,
  BUILDER_NODE_REGISTRY,
  gateNestedInsertKinds,
  type BuilderIconName,
  type BuilderNode,
  type BuilderNodeCompositionPreset,
  type BuilderNodeCompositionPresetId,
  type BuilderNodeKind,
} from "@/lib/site-admin/builder-node";
import {
  useEditContext,
  type BuilderBlockPreset,
  type BuilderNodePastePreview,
} from "../edit-context";
import { siblingDropGapToMoveIndex } from "@/lib/site-admin/builder-node/sibling-drop-gap";
import { ElementLibraryInsertPicker } from "../element-library-insert-picker";
import { Card, CardBody, CardHead, Field, FieldLabel, Helper, Segmented, Toggle } from "../kit";
import { KIT } from "./kit/tokens";
import { MediaPickerButton } from "./kit";
import { MyBlocksPanel } from "./my-blocks-panel";

interface BuilderNodeContentInspectorProps {
  node: Exclude<BuilderNode, { kind: "section" }>;
  tenantId: string;
}

export function BuilderNodeContentInspector({
  node,
  tenantId,
}: BuilderNodeContentInspectorProps) {
  const {
    copiedBuilderNodeKind,
    builderBlockPresets,
    copyBuilderNode,
    duplicateBuilderNode,
    getCopiedBuilderNodePastePreview,
    insertBuilderNode,
    insertBuilderNodeCompositionPreset,
    moveBuilderNodeToParentIndex,
    moveBuilderNodeWithinParent,
    pasteCopiedBuilderNode,
    pasteBuilderBlockPreset,
    patchBuilderNodeProps,
    removeBuilderNode,
    removeBuilderBlockPreset,
    reportMutationError,
    saveCopiedBuilderNodeAsPreset,
    selectBuilderNode,
    advancedElementLibraryEnabled,
    canInsertRawHtmlElements,
  } = useEditContext();

  async function commitPatch(patch: Record<string, unknown>) {
    const result = await patchBuilderNodeProps(node.id, patch);
    if (!result.ok && result.error) {
      reportMutationError(result.error);
    }
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

  // QA 2026-05-13 — `commit` used to be `() => {}` at every call site,
  // relying on the subsequent `event.currentTarget.blur()` to trigger
  // the field's `onBlur` save handler. That works on desktop browsers
  // but is fragile on mobile virtual keyboards where Enter doesn't
  // always dispatch a synchronous blur, and on iOS where the blur can
  // be skipped if focus is being moved programmatically elsewhere.
  // Callers now pass a `commit(value)` that fires the save directly;
  // the blur still fires as a belt-and-suspenders. Idempotency lives
  // in `commitTextInput` (no-op when value === currentValue).
  const handleCommitKey =
    (commit: (value: string) => void) =>
    (event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (event.key !== "Enter" || event.shiftKey) return;
      event.preventDefault();
      commit(event.currentTarget.value);
      event.currentTarget.blur();
    };

  async function commitInsert(kind: BuilderNodeKind, index?: number) {
    const result = await insertBuilderNode(node.id, kind, index);
    if (!result.ok && result.error) {
      reportMutationError(result.error);
    }
  }

  async function commitInsertCompositionPreset(
    presetId: BuilderNodeCompositionPresetId,
    index?: number,
  ) {
    const result = await insertBuilderNodeCompositionPreset(node.id, presetId, index);
    if (!result.ok && result.error) {
      reportMutationError(result.error);
    }
  }

  async function commitRemove(nodeId: string) {
    const result = await removeBuilderNode(nodeId);
    if (!result.ok && result.error) {
      reportMutationError(result.error);
    }
  }

  async function commitDuplicate(nodeId: string) {
    const result = await duplicateBuilderNode(nodeId);
    if (!result.ok && result.error) {
      reportMutationError(result.error);
    }
  }

  function commitCopy(nodeId: string) {
    const result = copyBuilderNode(nodeId);
    if (!result.ok && result.error) {
      reportMutationError(result.error);
    }
  }

  async function commitPaste(targetNodeId: string) {
    const result = await pasteCopiedBuilderNode(targetNodeId);
    if (!result.ok && result.error) {
      reportMutationError(result.error);
    }
  }

  function commitSavePreset() {
    const defaultName = copiedBuilderNodeKind
      ? `${BUILDER_NODE_REGISTRY[copiedBuilderNodeKind].label} pattern`
      : "Saved block pattern";
    const name =
      typeof window === "undefined"
        ? defaultName
        : window.prompt("Preset name", defaultName);
    if (name === null) return;
    const result = saveCopiedBuilderNodeAsPreset(name);
    if (!result.ok && result.error) {
      reportMutationError(result.error);
    }
  }

  async function commitPastePreset(presetId: string, targetNodeId: string) {
    const result = await pasteBuilderBlockPreset(presetId, targetNodeId);
    if (!result.ok && result.error) {
      reportMutationError(result.error);
    }
  }

  async function commitMove(nodeId: string, direction: "up" | "down") {
    const result = await moveBuilderNodeWithinParent(nodeId, direction);
    if (!result.ok && result.error) {
      reportMutationError(result.error);
    }
  }

  async function commitMoveToIndex(
    nodeId: string,
    parentNodeId: string,
    targetIndex: number,
  ) {
    const result = await moveBuilderNodeToParentIndex(
      nodeId,
      parentNodeId,
      targetIndex,
    );
    if (!result.ok && result.error) {
      reportMutationError(result.error);
    }
  }

  const nestedChildren = childNodes(node);
  const quickAddKinds = useMemo(
    () =>
      gateNestedInsertKinds(
        allowedChildKinds(node),
        advancedElementLibraryEnabled,
        canInsertRawHtmlElements,
      ),
    [node, advancedElementLibraryEnabled, canInsertRawHtmlElements],
  );
  const groupPastePreview = getCopiedBuilderNodePastePreview(node.id);

  if (node.kind === "heading") {
    return (
      <div className="flex flex-col gap-3">
        <Card state="active">
          <CardHead title="Heading node" sub="Canvas selection" iconAccent="blue" />
          <CardBody>
            <div className="flex flex-col gap-3">
              <Field flush>
                <FieldLabel>Text</FieldLabel>
                <BuilderNodeRichTextField
                  key={`${node.id}:text:${node.props.text}`}
                  value={node.props.text}
                  tenantId={tenantId}
                  variant="single"
                  ariaLabel="Heading text"
                  className={KIT.inputLg}
                  onCommit={(next) => commitTextInput("text", node.props.text)(next)}
                />
                <Helper>Use selected text for bold, italic, accent, and links.</Helper>
              </Field>
              <Field flush>
                <FieldLabel>Level</FieldLabel>
                <Segmented
                  fullWidth
                  compact
                  value={String(node.props.level) as "1" | "2" | "3" | "4"}
                  onChange={(next) => {
                    void commitPatch({ level: Number.parseInt(next, 10) });
                  }}
                  options={[
                    { value: "1", label: "H1" },
                    { value: "2", label: "H2" },
                    { value: "3", label: "H3" },
                    { value: "4", label: "H4" },
                  ]}
                />
              </Field>
            </div>
          </CardBody>
        </Card>
      </div>
    );
  }

  if (node.kind === "paragraph") {
    return (
      <div className="flex flex-col gap-3">
        <Card state="active">
          <CardHead title="Paragraph node" sub="Canvas selection" iconAccent="blue" />
          <CardBody>
            <Field flush>
              <FieldLabel>Copy</FieldLabel>
              <BuilderNodeRichTextField
                key={`${node.id}:text:${node.props.text}`}
                value={node.props.text}
                tenantId={tenantId}
                variant="multi"
                ariaLabel="Paragraph copy"
                className={`${KIT.textarea} min-h-[128px] whitespace-pre-wrap break-words`}
                onCommit={(next) => commitTextInput("text", node.props.text)(next)}
              />
              <Helper>Standalone paragraph block with inline text formatting.</Helper>
            </Field>
          </CardBody>
        </Card>
      </div>
    );
  }

  if (node.kind === "code") {
    if (!canInsertRawHtmlElements) {
      return (
        <div className="flex flex-col gap-3">
          <Card state="active">
            <CardHead title="Code / HTML node" sub="Canvas selection" iconAccent="blue" />
            <CardBody>
              <Helper>
                Raw HTML blocks can only be edited by a platform owner. The block
                stays live on the page — ask an owner to change its markup.
              </Helper>
            </CardBody>
          </Card>
        </div>
      );
    }
    return (
      <div className="flex flex-col gap-3">
        <Card state="active">
          <CardHead title="Code / HTML node" sub="Canvas selection" iconAccent="blue" />
          <CardBody>
            <div className="flex flex-col gap-3">
              <Field flush>
                <FieldLabel>HTML</FieldLabel>
                <textarea
                  key={`${node.id}:html`}
                  defaultValue={node.props.html}
                  className={`${KIT.textarea} min-h-[200px] whitespace-pre break-all font-mono text-[12px]`}
                  spellCheck={false}
                  aria-label="Raw HTML"
                  onBlur={(event) => {
                    const next = event.currentTarget.value;
                    if (next !== node.props.html) {
                      void commitPatch({ html: next });
                    }
                  }}
                />
                <Helper>
                  Rendered inside a sandboxed iframe on an isolated origin — it
                  cannot read your site&rsquo;s cookies or DOM. Any scripts run
                  only within the frame.
                </Helper>
              </Field>
              <Field flush>
                <FieldLabel>Min height (px)</FieldLabel>
                <input
                  type="number"
                  min={40}
                  max={5000}
                  key={`${node.id}:minHeight:${node.props.minHeight ?? ""}`}
                  defaultValue={node.props.minHeight ?? 120}
                  className={KIT.input}
                  onBlur={(event) => {
                    const parsed = Number.parseInt(event.currentTarget.value, 10);
                    if (Number.isFinite(parsed)) {
                      void commitPatch({
                        minHeight: Math.min(Math.max(parsed, 40), 5000),
                      });
                    }
                  }}
                />
                <Helper>
                  Floor height shown before the frame reports its measured
                  content height.
                </Helper>
              </Field>
            </div>
          </CardBody>
        </Card>
      </div>
    );
  }

  if (node.kind === "button") {
    return (
      <div className="flex flex-col gap-3">
        <Card state="active">
          <CardHead title="Button node" sub="Canvas selection" iconAccent="blue" />
          <CardBody>
            <div className="flex flex-col gap-3">
              <Field flush>
                <FieldLabel>Label</FieldLabel>
                <input
                  key={`${node.id}:label:${node.props.label}`}
                  defaultValue={node.props.label}
                  className={KIT.input}
                  onBlur={(event) => {
                  void commitTextInput("label", node.props.label)(event.currentTarget.value);
                }}
                onKeyDown={handleCommitKey((value) => {
                  void commitTextInput("label", node.props.label)(value);
                })}
                />
              </Field>
              <Field flush>
                <FieldLabel>Destination</FieldLabel>
                <input
                  key={`${node.id}:href:${node.props.href}`}
                  defaultValue={node.props.href}
                  className={KIT.input}
                  placeholder="/contact or https://..."
                  onBlur={(event) => {
                  void commitTextInput("href", node.props.href)(event.currentTarget.value);
                }}
                onKeyDown={handleCommitKey((value) => {
                  void commitTextInput("href", node.props.href)(value);
                })}
                />
                <Helper>Internal paths, mailto, or full URLs all work here.</Helper>
              </Field>
              <Field flush>
                <FieldLabel>Tone</FieldLabel>
                <Segmented
                  fullWidth
                  compact
                  value={node.props.tone ?? "primary"}
                  onChange={(next) => {
                    void commitPatch({ tone: next });
                  }}
                  options={[
                    { value: "primary", label: "Primary" },
                    { value: "secondary", label: "Secondary" },
                  ]}
                />
              </Field>
            </div>
          </CardBody>
        </Card>
      </div>
    );
  }

  if (node.kind === "image") {
    return (
      <div className="flex flex-col gap-3">
        <Card state="active">
          <CardHead title="Image node" sub="Canvas selection" iconAccent="blue" />
          <CardBody>
            <div className="flex flex-col gap-3">
              <MediaPickerButton
                tenantId={tenantId}
                value={node.props.src}
                onChange={(next) => {
                  if (!next) return;
                  void commitPatch({ src: next, mediaId: undefined });
                }}
                onPickItem={(item) => {
                  void commitPatch({
                    src: item.publicUrl,
                    mediaId: item.id,
                    alt: node.props.alt ?? item.alt ?? undefined,
                  });
                }}
                emptyLabel="Choose image"
                aspect="4/5"
              />
              <Field flush>
                <FieldLabel>Alt text</FieldLabel>
                <input
                  key={`${node.id}:alt:${node.props.alt ?? ""}`}
                  defaultValue={node.props.alt ?? ""}
                  className={KIT.input}
                  placeholder="Describe the image"
                  onBlur={(event) => {
                    void commitTextInput("alt", node.props.alt ?? "", true)(
                      event.currentTarget.value,
                    );
                  }}
                  onKeyDown={handleCommitKey((value) => {
                    void commitTextInput("alt", node.props.alt ?? "", true)(value);
                  })}
                />
                <Helper>Optional, but recommended for accessibility and SEO.</Helper>
              </Field>
            </div>
          </CardBody>
        </Card>
      </div>
    );
  }

  if (node.kind === "icon") {
    return (
      <div className="flex flex-col gap-3">
        <Card state="active">
          <CardHead title="Icon node" sub="Inline SVG" iconAccent="blue" />
          <CardBody>
            <div className="flex flex-col gap-3">
              <Field flush>
                <FieldLabel>Icon</FieldLabel>
                <select
                  className={KIT.input}
                  value={node.props.icon}
                  onChange={(event) => {
                    const icon = event.currentTarget.value as BuilderIconName;
                    const label =
                      BUILDER_ICON_REGISTRY.find((item) => item.name === icon)
                        ?.label ?? "Icon";
                    void commitPatch({
                      icon,
                      label: node.props.decorative ? node.props.label : label,
                    });
                  }}
                >
                  {BUILDER_ICON_REGISTRY.map((icon) => (
                    <option key={icon.name} value={icon.name}>
                      {icon.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field flush>
                <FieldLabel>Size</FieldLabel>
                <Segmented
                  fullWidth
                  compact
                  value={node.props.size ?? "md"}
                  onChange={(next) => {
                    void commitPatch({ size: next });
                  }}
                  options={[
                    { value: "sm", label: "S" },
                    { value: "md", label: "M" },
                    { value: "lg", label: "L" },
                    { value: "xl", label: "XL" },
                  ]}
                />
              </Field>
              <Field flush>
                <FieldLabel>Accessible label</FieldLabel>
                <input
                  key={`${node.id}:label:${node.props.label ?? ""}`}
                  defaultValue={node.props.label ?? ""}
                  className={KIT.input}
                  placeholder="Describe the icon"
                  disabled={node.props.decorative ?? false}
                  onBlur={(event) => {
                    void commitTextInput("label", node.props.label ?? "", true)(
                      event.currentTarget.value,
                    );
                  }}
                  onKeyDown={handleCommitKey((value) => {
                    void commitTextInput("label", node.props.label ?? "", true)(value);
                  })}
                />
                <Helper>Leave decorative on when the icon only supports nearby text.</Helper>
              </Field>
              <div style={{ padding: "4px 0" }}>
                <Toggle
                  on={node.props.decorative ?? false}
                  onChange={(next) => {
                    void commitPatch({ decorative: next });
                  }}
                  label="Decorative"
                  helper="Decorative icons are hidden from screen readers."
                />
              </div>
            </div>
          </CardBody>
        </Card>
      </div>
    );
  }

  if (node.kind === "accordion_item") {
    return (
      <div className="flex flex-col gap-3">
        <Card state="active">
          <CardHead title="Accordion item" sub={`${node.children.length} nested blocks`} iconAccent="blue" />
          <CardBody>
            <Field flush>
              <FieldLabel>Question</FieldLabel>
              <input
                key={`${node.id}:title:${node.props.title}`}
                defaultValue={node.props.title}
                className={KIT.inputLg}
                onBlur={(event) => {
                  void commitTextInput("title", node.props.title)(event.currentTarget.value);
                }}
                onKeyDown={handleCommitKey((value) => {
                  void commitTextInput("title", node.props.title)(value);
                })}
              />
              <Helper>Use Structure to edit the answer blocks nested inside this item.</Helper>
            </Field>
          </CardBody>
        </Card>
        <NestedBlocksCard
          title="Answer blocks"
          parentNodeId={node.id}
          helper="Add and manage the content blocks shown when this accordion item opens."
          nodes={nestedChildren}
          addKinds={quickAddKinds}
          onAdd={commitInsert}
          onAddCompositionPreset={commitInsertCompositionPreset}
          onSelect={selectBuilderNode}
          onMove={commitMove}
          onMoveToIndex={commitMoveToIndex}
          onCopy={commitCopy}
          onDuplicate={commitDuplicate}
          onPaste={commitPaste}
          copiedKind={copiedBuilderNodeKind}
          pastePreview={groupPastePreview}
          presets={builderBlockPresets}
          onSavePreset={commitSavePreset}
          onPastePreset={commitPastePreset}
          onRemovePreset={removeBuilderBlockPreset}
          onRemove={commitRemove}
        />
      </div>
    );
  }

  if (node.kind === "tab_panel") {
    return (
      <div className="flex flex-col gap-3">
        <Card state="active">
          <CardHead title="Tab panel" sub={`${node.children.length} nested blocks`} iconAccent="blue" />
          <CardBody>
            <Field flush>
              <FieldLabel>Tab label</FieldLabel>
              <input
                key={`${node.id}:title:${node.props.title}`}
                defaultValue={node.props.title}
                className={KIT.inputLg}
                onBlur={(event) => {
                  void commitTextInput("title", node.props.title)(event.currentTarget.value);
                }}
                onKeyDown={handleCommitKey((value) => {
                  void commitTextInput("title", node.props.title)(value);
                })}
              />
              <Helper>Use Structure to edit the content blocks inside this tab.</Helper>
            </Field>
          </CardBody>
        </Card>
        <NestedBlocksCard
          title="Tab content"
          parentNodeId={node.id}
          helper="Add and manage the blocks rendered inside this selected tab."
          nodes={nestedChildren}
          addKinds={quickAddKinds}
          onAdd={commitInsert}
          onAddCompositionPreset={commitInsertCompositionPreset}
          onSelect={selectBuilderNode}
          onMove={commitMove}
          onMoveToIndex={commitMoveToIndex}
          onCopy={commitCopy}
          onDuplicate={commitDuplicate}
          onPaste={commitPaste}
          copiedKind={copiedBuilderNodeKind}
          pastePreview={groupPastePreview}
          presets={builderBlockPresets}
          onSavePreset={commitSavePreset}
          onPastePreset={commitPastePreset}
          onRemovePreset={removeBuilderBlockPreset}
          onRemove={commitRemove}
        />
      </div>
    );
  }

  if (node.kind === "accordion") {
    const defaultOpenIds = new Set(node.props.defaultOpenItemIds ?? []);
    return (
      <div className="flex flex-col gap-3">
        <Card state="active">
          <CardHead title="Accordion" sub={`${nestedChildren.length} items`} iconAccent="blue" />
          <CardBody>
            <div className="flex flex-col gap-3">
              <div style={{ padding: "4px 0" }}>
                <Toggle
                  on={node.props.allowMultiple ?? false}
                  onChange={(next) => {
                    void commitPatch({
                      allowMultiple: next,
                      defaultOpenItemIds:
                        next || defaultOpenIds.size <= 1
                          ? Array.from(defaultOpenIds)
                          : Array.from(defaultOpenIds).slice(0, 1),
                    });
                  }}
                  label="Allow multiple items open"
                  helper="When off, setting a default item keeps just one question open at a time."
                />
              </div>
            </div>
          </CardBody>
        </Card>
        <NestedBlocksCard
          title="Accordion items"
          parentNodeId={node.id}
          helper="Select an item to edit its question and nested answer blocks."
          nodes={nestedChildren}
          addKinds={quickAddKinds}
          onAdd={commitInsert}
          onAddCompositionPreset={commitInsertCompositionPreset}
          onSelect={selectBuilderNode}
          onMove={commitMove}
          onMoveToIndex={commitMoveToIndex}
          onCopy={commitCopy}
          onDuplicate={commitDuplicate}
          onPaste={commitPaste}
          copiedKind={copiedBuilderNodeKind}
          pastePreview={groupPastePreview}
          presets={builderBlockPresets}
          onSavePreset={commitSavePreset}
          onPastePreset={commitPastePreset}
          onRemovePreset={removeBuilderBlockPreset}
          onRemove={commitRemove}
          canRemove={(child) => nestedChildren.length > 1 && child.kind === "accordion_item"}
          extraActions={(child) =>
            child.kind === "accordion_item" ? (
              <button
                type="button"
                className={defaultOpenIds.has(child.id) ? KIT.primaryButton : KIT.subtleButton}
                onClick={() => {
                  const next = new Set(defaultOpenIds);
                  if (next.has(child.id)) {
                    next.delete(child.id);
                  } else if (node.props.allowMultiple) {
                    next.add(child.id);
                  } else {
                    next.clear();
                    next.add(child.id);
                  }
                  void commitPatch({
                    defaultOpenItemIds: next.size > 0 ? Array.from(next) : undefined,
                  });
                }}
              >
                {defaultOpenIds.has(child.id) ? "Default open" : "Set default"}
              </button>
            ) : null
          }
        />
      </div>
    );
  }

  if (node.kind === "tabs") {
    return (
      <div className="flex flex-col gap-3">
        <Card state="active">
          <CardHead title="Tabs" sub={`${nestedChildren.length} panels`} iconAccent="blue" />
          <CardBody>
            <p className={KIT.hint}>
              Choose which panel opens first, then select a tab to edit its label and nested content.
            </p>
          </CardBody>
        </Card>
        <NestedBlocksCard
          title="Tab panels"
          parentNodeId={node.id}
          helper="Each panel owns its own label and nested blocks."
          nodes={nestedChildren}
          addKinds={quickAddKinds}
          onAdd={commitInsert}
          onAddCompositionPreset={commitInsertCompositionPreset}
          onSelect={selectBuilderNode}
          onMove={commitMove}
          onMoveToIndex={commitMoveToIndex}
          onCopy={commitCopy}
          onDuplicate={commitDuplicate}
          onPaste={commitPaste}
          copiedKind={copiedBuilderNodeKind}
          pastePreview={groupPastePreview}
          presets={builderBlockPresets}
          onSavePreset={commitSavePreset}
          onPastePreset={commitPastePreset}
          onRemovePreset={removeBuilderBlockPreset}
          onRemove={commitRemove}
          canRemove={(child) => nestedChildren.length > 1 && child.kind === "tab_panel"}
          extraActions={(child) =>
            child.kind === "tab_panel" ? (
              <button
                type="button"
                className={node.props.defaultTabId === child.id ? KIT.primaryButton : KIT.subtleButton}
                onClick={() => {
                  void commitPatch({
                    defaultTabId: node.props.defaultTabId === child.id ? undefined : child.id,
                  });
                }}
              >
                {node.props.defaultTabId === child.id ? "Default tab" : "Make default"}
              </button>
            ) : null
          }
        />
      </div>
    );
  }

  if (
    node.kind === "container" ||
    node.kind === "card" ||
    node.kind === "cta_group" ||
    node.kind === "split" ||
    node.kind === "carousel" ||
    node.kind === "masonry"
  ) {
    return (
      <div className="flex flex-col gap-3">
        {node.kind === "container" && node.props.dataBinding ? (
          <Card state="active">
            <CardHead title="Data source" sub="Live tenant content" iconAccent="blue" />
            <CardBody>
              <div className="flex flex-col gap-3">
                <div
                  data-builder-node-data-source={node.props.dataBinding.sourceKey}
                  className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2"
                >
                  <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-700">
                    Connected
                  </div>
                  <div className="mt-1 text-[12px] font-semibold text-stone-800">
                    {dataSourceLabel(node.props.dataBinding.sourceKey)}
                  </div>
                  <p className="mt-1 text-[11px] leading-snug text-stone-600">
                    {dataSourceHelper(node.props.dataBinding.sourceKey)}
                  </p>
                </div>
                <Field flush>
                  <FieldLabel>Items shown</FieldLabel>
                  <Segmented
                    fullWidth
                    compact
                    value={
                      String(
                        normalizeDataSourceLimit(node.props.dataBinding.maxItems),
                      ) as "4" | "6" | "8" | "12"
                    }
                    onChange={(next) => {
                      void commitPatch({
                        dataBinding: {
                          ...node.props.dataBinding,
                          maxItems: Number.parseInt(next, 10),
                        },
                      });
                    }}
                    options={[
                      { value: "4", label: "4" },
                      { value: "6", label: "6" },
                      { value: "8", label: "8" },
                      { value: "12", label: "12" },
                    ]}
                  />
                  <Helper>
                    Controls the live data limit while keeping the section&apos;s editable copy.
                  </Helper>
                </Field>
              </div>
            </CardBody>
          </Card>
        ) : null}
        <NestedBlocksCard
          title={`${BUILDER_NODE_REGISTRY[node.kind].label} blocks`}
          parentNodeId={node.id}
          helper={contentHint(node)}
          nodes={nestedChildren}
          addKinds={quickAddKinds}
          onAdd={commitInsert}
          onAddCompositionPreset={commitInsertCompositionPreset}
          onSelect={selectBuilderNode}
          onMove={commitMove}
          onMoveToIndex={commitMoveToIndex}
          onCopy={commitCopy}
          onDuplicate={commitDuplicate}
          onPaste={commitPaste}
          copiedKind={copiedBuilderNodeKind}
          pastePreview={groupPastePreview}
          presets={builderBlockPresets}
          onSavePreset={commitSavePreset}
          onPastePreset={commitPastePreset}
          onRemovePreset={removeBuilderBlockPreset}
          onRemove={commitRemove}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <Card>
        <CardHead
          title={BUILDER_NODE_REGISTRY[node.kind].label}
          sub={`${childCount(node)} nested block${childCount(node) === 1 ? "" : "s"}`}
        />
        <CardBody>
          <div className="flex flex-col gap-2">
            <p className={KIT.hint}>{contentHint(node)}</p>
            {childCount(node) > 0 ? (
              <div className="rounded-lg border border-stone-200 bg-[#faf9f6] px-3 py-2">
                <div className={KIT.label}>Contains</div>
                <p className={`${KIT.hint} mt-1`}>{childSummary(node)}</p>
              </div>
            ) : null}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

function NestedBlocksCard({
  title,
  parentNodeId,
  helper,
  nodes,
  addKinds,
  onAdd,
  onAddCompositionPreset,
  onSelect,
  onMove,
  onMoveToIndex,
  onCopy,
  onDuplicate,
  onPaste,
  copiedKind,
  pastePreview,
  presets,
  onSavePreset,
  onPastePreset,
  onRemovePreset,
  onRemove,
  canRemove,
  extraActions,
}: {
  title: string;
  parentNodeId: string;
  helper: string;
  nodes: BuilderNode[];
  addKinds: BuilderNodeKind[];
  onAdd: (kind: BuilderNodeKind, index?: number) => void | Promise<void>;
  onAddCompositionPreset: (
    presetId: BuilderNodeCompositionPresetId,
    index?: number,
  ) => void | Promise<void>;
  onSelect: (nodeId: string) => void;
  onMove: (nodeId: string, direction: "up" | "down") => void | Promise<void>;
  onMoveToIndex: (
    nodeId: string,
    parentNodeId: string,
    targetIndex: number,
  ) => void | Promise<void>;
  onCopy: (nodeId: string) => void | Promise<void>;
  onDuplicate: (nodeId: string) => void | Promise<void>;
  onPaste: (targetNodeId: string) => void | Promise<void>;
  copiedKind: BuilderNodeKind | null;
  pastePreview: BuilderNodePastePreview | null;
  presets: ReadonlyArray<BuilderBlockPreset>;
  onSavePreset: () => void;
  onPastePreset: (
    presetId: string,
    targetNodeId: string,
  ) => void | Promise<void>;
  onRemovePreset: (presetId: string) => void;
  onRemove: (nodeId: string) => void | Promise<void>;
  canRemove?: (node: BuilderNode, index: number) => boolean;
  extraActions?: (node: BuilderNode, index: number) => ReactNode;
}) {
  const [insertAt, setInsertAt] = useState<number | null>(null);
  const [draggingNode, setDraggingNode] = useState<{
    nodeId: string;
    sourceIndex: number;
  } | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const [selectedChildIds, setSelectedChildIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [packQuery, setPackQuery] = useState("");
  const [packCategory, setPackCategory] = useState<
    "all" | BuilderNodeCompositionPreset["category"]
  >("all");
  useEffect(() => {
    const currentIds = new Set(nodes.map((node) => node.id));
    setSelectedChildIds((current) => {
      const next = new Set([...current].filter((id) => currentIds.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [nodes]);
  const selectedChildren = nodes.filter((node) => selectedChildIds.has(node.id));
  const selectedChildCount = selectedChildren.length;
  const compositionPresets = BUILDER_NODE_COMPOSITION_PRESETS.filter((preset) =>
    addKinds.includes(preset.rootKind),
  );
  const packCategories = useMemo(() => {
    const categories = new Set<BuilderNodeCompositionPreset["category"]>();
    for (const preset of compositionPresets) categories.add(preset.category);
    return ["all", ...categories] as const;
  }, [compositionPresets]);
  const visibleCompositionPresets = useMemo(() => {
    const q = packQuery.trim().toLowerCase();
    return compositionPresets.filter((preset) => {
      if (packCategory !== "all" && preset.category !== packCategory) {
        return false;
      }
      if (!q) return true;
      const hay = [
        preset.label,
        preset.description,
        preset.category,
        preset.dataMode,
        preset.rootKind,
        ...preset.keywords,
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [compositionPresets, packCategory, packQuery]);
  const toggleSelectedChild = (nodeId: string) => {
    setSelectedChildIds((current) => {
      const next = new Set(current);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  };
  const selectAllChildren = () => {
    setSelectedChildIds(new Set(nodes.map((node) => node.id)));
  };
  const clearSelectedChildren = () => {
    setSelectedChildIds(new Set());
  };
  // QA 2026-05-13 — these loops used to `await` each mutation
  // serially and abort silently on the first throw, leaving a partial
  // operation (some items applied, the rest skipped, selection still
  // pointing at items that may or may not exist). Each downstream
  // `onDuplicate` / `onRemove` already reports its own errors via the
  // parent's `reportMutationError`, so we just need to stop aborting
  // the loop. `Promise.allSettled` attempts every item; we then clear
  // selection only for ids that succeeded, so failed ones stay
  // highlighted for a retry pass.
  const duplicateSelectedChildren = async () => {
    const targets = [...selectedChildren];
    const results = await Promise.allSettled(
      targets.map((child) => onDuplicate(child.id)),
    );
    const failedIds = new Set(
      results
        .map((r, i) => ({ r, id: targets[i]!.id }))
        .filter((p) => p.r.status === "rejected")
        .map((p) => p.id),
    );
    setSelectedChildIds((current) => {
      const next = new Set<string>();
      for (const id of current) if (failedIds.has(id)) next.add(id);
      return next;
    });
  };
  const removeSelectedChildren = async () => {
    const targets = [...selectedChildren].reverse();
    const results = await Promise.allSettled(
      targets.map((child) => onRemove(child.id)),
    );
    const failedIds = new Set(
      results
        .map((r, i) => ({ r, id: targets[i]!.id }))
        .filter((p) => p.r.status === "rejected")
        .map((p) => p.id),
    );
    setSelectedChildIds((current) => {
      const next = new Set<string>();
      for (const id of current) if (failedIds.has(id)) next.add(id);
      return next;
    });
  };
  const closeInsertPicker = () => setInsertAt(null);
  const clearDragState = () => {
    setDraggingNode(null);
    setDropIndex(null);
  };
  const handleDragStart =
    (nodeId: string, sourceIndex: number) =>
    (event: DragEvent<HTMLDivElement>) => {
      event.stopPropagation();
      setDraggingNode({ nodeId, sourceIndex });
      setDropIndex(null);
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", nodeId);
    };
  const handleDragOver =
    (index: number) => (event: DragEvent<HTMLDivElement>) => {
      if (!draggingNode) return;
      event.preventDefault();
      event.stopPropagation();
      const rect = event.currentTarget.getBoundingClientRect();
      const nextDropIndex =
        event.clientY > rect.top + rect.height / 2 ? index + 1 : index;
      setDropIndex(nextDropIndex);
    };
  const handleDrop = async (event: DragEvent<HTMLElement>) => {
    if (!draggingNode || dropIndex === null) {
      clearDragState();
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const resolved = siblingDropGapToMoveIndex({
      dropGapIndex: dropIndex,
      sourceSiblingIndex: draggingNode.sourceIndex,
      sameParent: true,
    });
    if (resolved.kind === "noop") {
      clearDragState();
      return;
    }
    const nodeId = draggingNode.nodeId;
    clearDragState();
    await onMoveToIndex(nodeId, parentNodeId, resolved.targetSiblingIndex);
  };
  const renderInsertPicker = (index: number) =>
    insertAt === index ? (
      <div
        data-builder-node-insert-picker={index}
        className="rounded-lg border border-indigo-200 bg-indigo-50/50 px-3 py-2"
      >
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-indigo-700">
          Insert block here
        </div>
        <div className="flex flex-col gap-2">
          {compositionPresets.length > 0 ? (
            <div className="grid gap-1.5">
              <div className="text-[10px] font-semibold uppercase tracking-[0.10em] text-indigo-700/80">
                Section packs
              </div>
              {compositionPresets.map((preset) => (
                <button
                  key={`${index}-${preset.id}`}
                  type="button"
                  className="flex items-center justify-between gap-2 border border-indigo-100 bg-white px-2 py-1.5 text-left text-[11px] text-stone-700 shadow-sm transition hover:border-indigo-300 hover:bg-indigo-50"
                  data-builder-node-composition-preset={preset.id}
                  onClick={() => {
                    closeInsertPicker();
                    void onAddCompositionPreset(preset.id, index);
                  }}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{preset.label}</span>
                    <span className="block truncate text-[10px] text-stone-500">
                      {formatPresetLabel(preset.category)} · {preset.sectionCount} blocks
                    </span>
                  </span>
                  <span
                    className={
                      preset.dataMode === "data-ready"
                        ? "shrink-0 border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-emerald-700"
                        : "shrink-0 border border-stone-200 bg-white px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-stone-500"
                    }
                  >
                    {preset.dataMode === "data-ready" ? "Data" : "Starter"}
                  </span>
                </button>
              ))}
            </div>
          ) : null}
          {addKinds.length > 0 ? (
            <ElementLibraryInsertPicker
              variant="inspector"
              allowedKinds={addKinds}
              onPick={(kind) => {
                closeInsertPicker();
                void onAdd(kind, index);
              }}
            />
          ) : null}
          <button type="button" className={KIT.subtleButton} onClick={closeInsertPicker}>
            Cancel
          </button>
        </div>
      </div>
    ) : null;

  return (
    <Card>
      <CardHead
        title={title}
        sub={`${nodes.length} nested block${nodes.length === 1 ? "" : "s"}`}
      />
      <CardBody>
        <div className="flex flex-col gap-3">
          <p className={KIT.hint}>{helper}</p>
          {copiedKind && pastePreview ? (
            <div
              className={
                pastePreview.mode === "blocked"
                  ? "flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2"
                  : "flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50/60 px-3 py-2"
              }
            >
              <span
                className={
                  pastePreview.mode === "blocked"
                    ? "text-[11px] font-medium text-amber-900"
                    : "text-[11px] font-medium text-emerald-800"
                }
              >
                Copied: {BUILDER_NODE_REGISTRY[copiedKind].label}
                <span className="mt-0.5 block font-normal opacity-80">
                  {pastePreview.message}
                </span>
              </span>
              <button
                type="button"
                className={KIT.subtleButton}
                disabled={pastePreview.mode === "blocked"}
                title={
                  pastePreview.mode === "blocked"
                    ? pastePreview.message
                    : "Paste the copied block into this group"
                }
                onClick={() => {
                  void onPaste(parentNodeId);
                }}
              >
                {pastePreview.mode === "blocked"
                  ? "Pasting isn't allowed here"
                  : "Paste in group"}
              </button>
              {pastePreview.mode !== "blocked" ? (
                <button
                  type="button"
                  className={KIT.ghostButton}
                  onClick={onSavePreset}
                >
                  Save pattern
                </button>
              ) : null}
            </div>
          ) : null}
          {compositionPresets.length > 0 ? (
            <details
              data-builder-node-composition-presets=""
              className="rounded-lg border border-stone-200 bg-white px-3 py-2"
              open={nodes.length <= 3}
            >
              <summary className="cursor-pointer text-[11px] font-semibold text-stone-700">
                Section packs ({compositionPresets.length})
              </summary>
              <div className="mt-2 flex flex-col gap-2">
                <div className="flex flex-col gap-2 rounded-md border border-stone-200 bg-[#faf9f6] p-2">
                  <input
                    data-builder-node-composition-search=""
                    type="search"
                    value={packQuery}
                    onChange={(event) => setPackQuery(event.currentTarget.value)}
                    placeholder="Search section packs"
                    className={KIT.input}
                  />
                  <div
                    data-builder-node-composition-category-filter=""
                    className="flex flex-wrap gap-1.5"
                  >
                    {packCategories.map((category) => (
                      <button
                        key={category}
                        type="button"
                        className={
                          packCategory === category
                            ? KIT.primaryButton
                            : KIT.ghostButton
                        }
                        onClick={() =>
                          setPackCategory(
                            category as "all" | BuilderNodeCompositionPreset["category"],
                          )
                        }
                      >
                        {category === "all" ? "All" : category}
                      </button>
                    ))}
                  </div>
                </div>
                {visibleCompositionPresets.map((preset) => (
                  <div
                    key={preset.id}
                    className="rounded-md border border-stone-200 bg-[#faf9f6] px-3 py-2"
                  >
                    <div className="flex items-start gap-3">
                      <CompositionPresetPreview preset={preset} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[11px] font-semibold text-stone-800">
                          {preset.label}
                        </span>
                        <span className="mt-0.5 block text-[10.5px] leading-snug text-stone-500">
                          {preset.description}
                        </span>
                        <span className="mt-1 inline-flex text-[10px] font-semibold uppercase tracking-[0.10em] text-stone-500">
                          {formatPresetLabel(preset.category)} · {preset.sectionCount} blocks
                        </span>
                        <span className="mt-2 flex flex-wrap gap-1">
                          <span
                            data-builder-node-composition-data-mode={preset.dataMode}
                            className={
                              preset.dataMode === "data-ready"
                                ? "border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-[0.08em] text-emerald-700"
                                : "border border-stone-200 bg-white px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-[0.08em] text-stone-500"
                            }
                          >
                            {preset.dataMode === "data-ready" ? "Data ready" : "Starter"}
                          </span>
                          {preset.keywords.slice(0, 3).map((keyword) => (
                            <span
                              key={`${preset.id}-${keyword}`}
                              className="border border-stone-200 bg-white px-1.5 py-0.5 text-[9.5px] font-medium text-stone-500"
                            >
                              {keyword}
                            </span>
                          ))}
                        </span>
                      </span>
                      <button
                        type="button"
                        data-builder-node-composition-preset={preset.id}
                        className={KIT.subtleButton}
                        onClick={() => {
                          void onAddCompositionPreset(preset.id);
                        }}
                      >
                        Insert
                      </button>
                    </div>
                  </div>
                ))}
                {visibleCompositionPresets.length === 0 ? (
                  <div
                    data-builder-node-composition-empty=""
                    className="rounded-md border border-dashed border-stone-300 bg-white px-3 py-3 text-[11.5px] text-stone-500"
                  >
                    No section packs match this search. Try a category, data-ready,
                    roster, map, FAQ, or story.
                  </div>
                ) : null}
              </div>
            </details>
          ) : null}
          <MyBlocksPanel parentNodeId={parentNodeId} />
          {presets.length > 0 ? (
            <details className="rounded-lg border border-stone-200 bg-white px-3 py-2">
              <summary className="cursor-pointer text-[11px] font-semibold text-stone-700">
                Block presets ({presets.length})
              </summary>
              <div className="mt-2 flex flex-col gap-2">
                {presets.slice(0, 6).map((preset) => (
                  <div
                    key={preset.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-stone-200 bg-[#faf9f6] px-2 py-1.5"
                  >
                    <span className="min-w-0 text-[11px] font-medium text-stone-700">
                      <span className="block truncate">{preset.name}</span>
                      <span className="block text-[10px] font-normal text-stone-500">
                        {BUILDER_NODE_REGISTRY[preset.node.kind].label}
                      </span>
                    </span>
                    <span className="inline-flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        className={KIT.subtleButton}
                        onClick={() => {
                          void onPastePreset(preset.id, parentNodeId);
                        }}
                      >
                        Insert
                      </button>
                      <button
                        type="button"
                        className={KIT.ghostButton}
                        onClick={() => onRemovePreset(preset.id)}
                      >
                        Delete
                      </button>
                    </span>
                  </div>
                ))}
              </div>
            </details>
          ) : null}
          {nodes.length > 0 && addKinds.length > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-stone-200 bg-[#faf9f6] px-3 py-2">
              <span className="text-[11px] font-medium text-stone-500">
                Place new blocks exactly where they belong.
              </span>
              <button
                type="button"
                data-builder-node-insert-top
                className={KIT.subtleButton}
                onClick={() => setInsertAt((current) => (current === 0 ? null : 0))}
              >
                Insert at top
              </button>
            </div>
          ) : null}
          {nodes.length > 1 ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-stone-200 bg-white px-3 py-2">
              <span className="text-[11px] font-medium text-stone-600">
                {selectedChildCount > 0
                  ? `${selectedChildCount} block${selectedChildCount === 1 ? "" : "s"} selected`
                  : "Select blocks for bulk actions"}
              </span>
              <span className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  className={KIT.ghostButton}
                  onClick={
                    selectedChildCount === nodes.length
                      ? clearSelectedChildren
                      : selectAllChildren
                  }
                >
                  {selectedChildCount === nodes.length ? "Clear" : "Select all"}
                </button>
                <button
                  type="button"
                  className={KIT.subtleButton}
                  disabled={selectedChildCount === 0}
                  onClick={() => void duplicateSelectedChildren()}
                >
                  Duplicate
                </button>
                <button
                  type="button"
                  className={KIT.subtleButton}
                  disabled={selectedChildCount === 0}
                  onClick={() => void removeSelectedChildren()}
                >
                  Remove
                </button>
              </span>
            </div>
          ) : null}
          {renderInsertPicker(0)}
          {nodes.length > 0 ? (
            <div className="flex flex-col gap-2">
              {nodes.map((child, index) => (
                <div key={child.id} className="flex flex-col gap-2">
                  {draggingNode && dropIndex === index ? (
                    <div
                      aria-hidden
                      className="h-0.5 rounded-full bg-indigo-500 shadow-[0_0_0_3px_rgba(99,102,241,0.14)]"
                    />
                  ) : null}
                  <div
                    draggable={nodes.length > 1}
                    onDragStart={handleDragStart(child.id, index)}
                    onDragOver={handleDragOver(index)}
                    onDrop={(event) => void handleDrop(event)}
                    onDragEnd={clearDragState}
                    className={
                      draggingNode?.nodeId === child.id
                        ? "rounded-lg border border-indigo-200 bg-indigo-50/60 px-3 py-2 opacity-70"
                        : "rounded-lg border border-stone-200 bg-[#faf9f6] px-3 py-2"
                    }
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div
                        aria-hidden
                        className="mt-0.5 inline-flex h-6 w-5 shrink-0 cursor-grab items-center justify-center rounded-md text-[13px] font-semibold text-stone-500 active:cursor-grabbing"
                        title="Drag to reorder"
                      >
                        ⋮⋮
                      </div>
                      <label className="mt-0.5 inline-flex h-6 w-5 shrink-0 cursor-pointer items-center justify-center">
                        <input
                          type="checkbox"
                          className="h-3.5 w-3.5 accent-indigo-600"
                          checked={selectedChildIds.has(child.id)}
                          onChange={() => toggleSelectedChild(child.id)}
                          aria-label={`Select ${childPrimaryLabel(child)}`}
                        />
                      </label>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[12px] font-semibold text-stone-700">
                          {childPrimaryLabel(child)}
                        </div>
                        <div className="mt-0.5 text-[11px] leading-snug text-stone-500">
                          {childSecondaryLabel(child)}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center justify-end gap-1.5">
                        {extraActions ? extraActions(child, index) : null}
                        <button
                          type="button"
                          className={KIT.subtleButton}
                          onClick={() => onSelect(child.id)}
                        >
                          Open
                        </button>
                        <button
                          type="button"
                          className={KIT.subtleButton}
                          onClick={() => {
                            void onCopy(child.id);
                          }}
                        >
                          Copy
                        </button>
                        <button
                          type="button"
                          className={KIT.subtleButton}
                          onClick={() => {
                            void onDuplicate(child.id);
                          }}
                        >
                          Duplicate
                        </button>
                        {copiedKind ? (
                          <button
                            type="button"
                            className={KIT.subtleButton}
                            onClick={() => {
                              void onPaste(child.id);
                            }}
                          >
                            Paste
                          </button>
                        ) : null}
                        {addKinds.length > 0 ? (
                          <button
                            type="button"
                            className={KIT.subtleButton}
                            onClick={() =>
                              setInsertAt((current) =>
                                current === index + 1 ? null : index + 1,
                              )
                            }
                          >
                            + After
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className={KIT.subtleButton}
                          onClick={() => {
                            void onMove(child.id, "up");
                          }}
                          disabled={index === 0}
                          title={
                            index === 0
                              ? "Already first — can't move up"
                              : "Move block up one position"
                          }
                          aria-label="Move block up"
                        >
                          Up
                        </button>
                        <button
                          type="button"
                          className={KIT.subtleButton}
                          onClick={() => {
                            void onMove(child.id, "down");
                          }}
                          disabled={index === nodes.length - 1}
                          title={
                            index === nodes.length - 1
                              ? "Already last — can't move down"
                              : "Move block down one position"
                          }
                          aria-label="Move block down"
                        >
                          Down
                        </button>
                        <button
                          type="button"
                          className={KIT.subtleButton}
                          onClick={() => {
                            void onRemove(child.id);
                          }}
                          disabled={canRemove ? !canRemove(child, index) : false}
                          title={
                            canRemove && !canRemove(child, index)
                              ? "This block can't be removed (required for this section)"
                              : "Remove block"
                          }
                          aria-label="Remove block"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  </div>
                  {renderInsertPicker(index + 1)}
                </div>
              ))}
              {draggingNode ? (
                <div
                  aria-hidden
                  onDragOver={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setDropIndex(nodes.length);
                  }}
                  onDrop={(event) => void handleDrop(event)}
                  className={
                    dropIndex === nodes.length
                      ? "h-2 rounded-full bg-indigo-500/80"
                      : "h-2 rounded-full bg-transparent"
                  }
                />
              ) : null}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-stone-300 bg-[#faf9f6] px-3 py-3 text-[11.5px] text-stone-500">
              No nested blocks yet.
            </div>
          )}
          {addKinds.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {addKinds.map((kind) => (
                <button
                  key={kind}
                  type="button"
                  className={KIT.ghostButton}
                  onClick={() => {
                    void onAdd(kind);
                  }}
                >
                  + {BUILDER_NODE_REGISTRY[kind].label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </CardBody>
    </Card>
  );
}

function CompositionPresetPreview({
  preset,
}: {
  preset: BuilderNodeCompositionPreset;
}) {
  const rows =
    preset.category === "data"
      ? ["wide", "grid", "grid", "grid"]
      : preset.category === "hero"
        ? ["wide", "thin", "wide", "chips"]
        : preset.category === "story"
          ? ["split", "split", "thin"]
          : preset.category === "trust"
            ? ["thin", "chips", "wide"]
            : ["thin", "wide", "wide", "button"];
  return (
    <span
      aria-hidden
      className="grid shrink-0 gap-1 border border-stone-200 bg-white p-1.5"
      style={{ width: 66, minHeight: 48 }}
    >
      {rows.map((row, index) => {
        if (row === "grid") {
          return (
            <span key={`${preset.id}:${index}`} className="grid grid-cols-3 gap-1">
              <span className="h-3 bg-stone-200" />
              <span className="h-3 bg-stone-200" />
              <span className="h-3 bg-stone-200" />
            </span>
          );
        }
        if (row === "split") {
          return (
            <span key={`${preset.id}:${index}`} className="grid grid-cols-2 gap-1">
              <span className="h-4 bg-stone-200" />
              <span className="h-4 bg-stone-100" />
            </span>
          );
        }
        if (row === "chips") {
          return (
            <span key={`${preset.id}:${index}`} className="grid grid-cols-3 gap-1">
              <span className="h-2 bg-stone-100" />
              <span className="h-2 bg-stone-100" />
              <span className="h-2 bg-stone-100" />
            </span>
          );
        }
        return (
          <span
            key={`${preset.id}:${index}`}
            className={row === "button" ? "h-3 bg-stone-800" : "bg-stone-200"}
            style={{ height: row === "thin" ? 4 : 12 }}
          />
        );
      })}
    </span>
  );
}

function formatPresetLabel(value: string): string {
  return value
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function childCount(node: Exclude<BuilderNode, { kind: "section" }>): number {
  return childNodes(node).length;
}

function childNodes(node: Exclude<BuilderNode, { kind: "section" }>): BuilderNode[] {
  return "children" in node && Array.isArray(node.children) ? node.children : [];
}

function allowedChildKinds(
  node: Exclude<BuilderNode, { kind: "section" }>,
): BuilderNodeKind[] {
  const policy = BUILDER_NODE_REGISTRY[node.kind].children;
  return policy.type === "allow_list" ? [...policy.kinds] : [];
}

function childSummary(node: Exclude<BuilderNode, { kind: "section" }>): string {
  const children = childNodes(node);
  if (children.length === 0) {
    return "No nested blocks yet.";
  }
  return children
    .slice(0, 6)
    .map((child) => BUILDER_NODE_REGISTRY[child.kind].label)
    .join(" • ");
}

function contentHint(node: Exclude<BuilderNode, { kind: "section" }>): string {
  switch (node.kind) {
    case "container":
      return "This is a layout wrapper. Add, move, and edit nested blocks in Structure, then use Layout for grid/stack behavior.";
    case "split":
      return "This split owns its child blocks. Edit the copy and media inside the split from Structure; use Layout for ratio and collapse behavior.";
    case "accordion":
      return "Accordion groups do not hold direct copy. Select each accordion item in Structure to rename its question and edit nested content.";
    case "tabs":
      return "Tabs are defined by their panels. Select each tab panel in Structure to rename the tab and edit its nested content.";
    case "carousel":
      return "Carousel content comes from its nested blocks. Add slides or cards in Structure, then tune autoplay and controls in Layout.";
    case "masonry":
      return "Masonry content is managed through its child blocks. Add images or cards in Structure; columns and gap live in Layout.";
    case "card":
      return "Card blocks wrap heading, paragraph, image, and button children — not nested layout shells. Edit blocks in Structure; surface style in Layout.";
    case "cta_group":
      return "CTA groups hold buttons only. Add headline or body copy as sibling blocks outside this group (e.g. in a container). Row vs stack lives in Layout.";
    case "divider":
      return "Divider blocks render a horizontal rule. Use Layout to switch tone and Style for spacing.";
    case "spacer":
      return "Spacer blocks have no direct content. Use Layout to change their size and keep page rhythm tidy.";
    default:
      return BUILDER_NODE_REGISTRY[node.kind].description;
  }
}

function normalizeDataSourceLimit(value: number | undefined): 4 | 6 | 8 | 12 {
  if (value === 6 || value === 8 || value === 12) return value;
  return 4;
}

function dataSourceLabel(sourceKey: string): string {
  switch (sourceKey) {
    case "tenant_directory_search":
      return "Directory search shortcuts";
    case "featured_talent_profiles":
      return "Featured talent profiles";
    case "talent_locations":
      return "Talent locations";
    default:
      return sourceKey;
  }
}

function dataSourceHelper(sourceKey: string): string {
  switch (sourceKey) {
    case "tenant_directory_search":
      return "Uses this tenant's public taxonomy shortcuts to route visitors into the directory.";
    case "featured_talent_profiles":
      return "Uses this tenant's featured public roster cards, with the static cards as fallback.";
    case "talent_locations":
      return "Uses this tenant's public roster locations and talent counts.";
    default:
      return "This section uses a live data binding and keeps editable fallback blocks.";
  }
}

function childPrimaryLabel(node: BuilderNode): string {
  switch (node.kind) {
    case "heading":
      return node.props.text;
    case "paragraph":
      return truncate(node.props.text, 72);
    case "rich_text":
      return truncate(node.props.text, 72);
    case "button":
      return node.props.label;
    case "image":
      return node.props.alt?.trim() || "Image block";
    case "icon":
      return node.props.label || BUILDER_NODE_REGISTRY[node.kind].label;
    case "accordion_item":
    case "tab_panel":
      return node.props.title;
    default:
      return BUILDER_NODE_REGISTRY[node.kind].label;
  }
}

function childSecondaryLabel(node: BuilderNode): string {
  switch (node.kind) {
    case "heading":
      return `Heading · H${node.props.level}`;
    case "paragraph":
      return "Paragraph block";
    case "rich_text":
      return "Rich text block";
    case "button":
      return node.props.href || "Button link";
    case "image":
      return node.props.src;
    case "video":
      return node.props.src;
    case "embed":
      return node.props.src;
    case "icon":
      return node.props.size ? `Icon · ${node.props.size.toUpperCase()}` : "Icon";
    case "pricing_table":
      return `${node.props.tiers.length} pricing tier${node.props.tiers.length === 1 ? "" : "s"}`;
    case "code":
      return "Raw HTML (sandboxed)";
    case "accordion_item":
      return `${node.children.length} nested block${node.children.length === 1 ? "" : "s"}`;
    case "tab_panel":
      return `${node.children.length} nested block${node.children.length === 1 ? "" : "s"}`;
    case "container":
    case "card":
    case "cta_group":
    case "split":
    case "accordion":
    case "tabs":
    case "carousel":
    case "masonry":
      return `${childNodes(node).length} nested block${childNodes(node).length === 1 ? "" : "s"}`;
    case "divider":
      return node.props.tone === "muted" ? "Divider · muted" : "Divider";
    case "spacer":
      return `Spacer · ${node.props.size.toUpperCase()}`;
    case "nav":
      return `Navigation · ${node.props.links.length} link${node.props.links.length === 1 ? "" : "s"}`;
    case "section":
      return BUILDER_NODE_REGISTRY[node.kind].description;
  }
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1).trimEnd()}…`;
}

function BuilderNodeRichTextField({
  value,
  tenantId,
  variant,
  ariaLabel,
  className,
  onCommit,
}: {
  value: string;
  tenantId: string;
  variant: "single" | "multi";
  ariaLabel: string;
  className: string;
  onCommit: (next: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  useEffect(() => {
    const next = draft.trim();
    if (!next || next === value) return;
    const timer = window.setTimeout(() => {
      void onCommit(draft);
    }, 450);
    return () => window.clearTimeout(timer);
  }, [draft, onCommit, value]);

  return (
    <RichEditor
      value={draft}
      onChange={setDraft}
      variant={variant}
      tenantId={tenantId}
      ariaLabel={ariaLabel}
      className={className}
    />
  );
}
