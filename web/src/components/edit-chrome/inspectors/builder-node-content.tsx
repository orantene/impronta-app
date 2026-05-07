"use client";

import {
  useEffect,
  useState,
  type DragEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";

import {
  BUILDER_NODE_REGISTRY,
  type BuilderNode,
  type BuilderNodeKind,
} from "@/lib/site-admin/builder-node";
import {
  useEditContext,
  type BuilderBlockPreset,
  type BuilderNodePastePreview,
} from "../edit-context";
import { Card, CardBody, CardHead, Field, FieldLabel, Helper, Segmented, Toggle } from "../kit";
import { KIT } from "./kit/tokens";
import { MediaPickerButton } from "./kit";

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

  const handleCommitKey =
    (commit: () => void) => (event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (event.key !== "Enter" || event.shiftKey) return;
      event.preventDefault();
      commit();
      event.currentTarget.blur();
    };

  async function commitInsert(kind: BuilderNodeKind, index?: number) {
    const result = await insertBuilderNode(node.id, kind, index);
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
  const quickAddKinds = allowedChildKinds(node);
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
                <input
                  key={`${node.id}:text:${node.props.text}`}
                  defaultValue={node.props.text}
                  className={KIT.inputLg}
                  onBlur={(event) => {
                    void commitTextInput("text", node.props.text)(event.currentTarget.value);
                  }}
                  onKeyDown={handleCommitKey(() => {})}
                />
                <Helper>Single heading line for this selected node.</Helper>
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
              <textarea
                key={`${node.id}:text:${node.props.text}`}
                defaultValue={node.props.text}
                rows={6}
                className={KIT.textarea}
                onBlur={(event) => {
                  void commitTextInput("text", node.props.text)(event.currentTarget.value);
                }}
              />
              <Helper>Standalone paragraph block inside the selected layout node.</Helper>
            </Field>
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
                  onKeyDown={handleCommitKey(() => {})}
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
                  onKeyDown={handleCommitKey(() => {})}
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
                  void commitPatch({ src: next });
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
                  onKeyDown={handleCommitKey(() => {})}
                />
                <Helper>Optional, but recommended for accessibility and SEO.</Helper>
              </Field>
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
                onKeyDown={handleCommitKey(() => {})}
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
                onKeyDown={handleCommitKey(() => {})}
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
    node.kind === "split" ||
    node.kind === "carousel" ||
    node.kind === "masonry"
  ) {
    return (
      <div className="flex flex-col gap-3">
        <NestedBlocksCard
          title={`${BUILDER_NODE_REGISTRY[node.kind].label} blocks`}
          parentNodeId={node.id}
          helper={contentHint(node)}
          nodes={nestedChildren}
          addKinds={quickAddKinds}
          onAdd={commitInsert}
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
  useEffect(() => {
    const currentIds = new Set(nodes.map((node) => node.id));
    setSelectedChildIds((current) => {
      const next = new Set([...current].filter((id) => currentIds.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [nodes]);
  const selectedChildren = nodes.filter((node) => selectedChildIds.has(node.id));
  const selectedChildCount = selectedChildren.length;
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
  const duplicateSelectedChildren = async () => {
    for (const child of selectedChildren) {
      await onDuplicate(child.id);
    }
    clearSelectedChildren();
  };
  const removeSelectedChildren = async () => {
    for (const child of [...selectedChildren].reverse()) {
      await onRemove(child.id);
    }
    clearSelectedChildren();
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
    const finalIndex =
      dropIndex > draggingNode.sourceIndex ? dropIndex - 1 : dropIndex;
    if (finalIndex === draggingNode.sourceIndex) {
      clearDragState();
      return;
    }
    const nodeId = draggingNode.nodeId;
    clearDragState();
    await onMoveToIndex(nodeId, parentNodeId, finalIndex);
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
        <div className="flex flex-wrap gap-1.5">
          {addKinds.map((kind) => (
            <button
              key={`${index}-${kind}`}
              type="button"
              className={KIT.ghostButton}
              onClick={() => {
                closeInsertPicker();
                void onAdd(kind, index);
              }}
            >
              + {BUILDER_NODE_REGISTRY[kind].label}
            </button>
          ))}
          <button
            type="button"
            className={KIT.subtleButton}
            onClick={closeInsertPicker}
          >
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
                onClick={() => {
                  void onPaste(parentNodeId);
                }}
              >
                {pastePreview.mode === "blocked" ? "Cannot paste here" : "Paste in group"}
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
                        className="mt-0.5 inline-flex h-6 w-5 shrink-0 cursor-grab items-center justify-center rounded-md text-[13px] font-semibold text-stone-400 active:cursor-grabbing"
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
    case "spacer":
      return "Spacer blocks have no direct content. Use Layout to change their size and keep page rhythm tidy.";
    default:
      return BUILDER_NODE_REGISTRY[node.kind].description;
  }
}

function childPrimaryLabel(node: BuilderNode): string {
  switch (node.kind) {
    case "heading":
      return node.props.text;
    case "paragraph":
      return truncate(node.props.text, 72);
    case "button":
      return node.props.label;
    case "image":
      return node.props.alt?.trim() || "Image block";
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
    case "button":
      return node.props.href || "Button link";
    case "image":
      return node.props.src;
    case "accordion_item":
      return `${node.children.length} nested block${node.children.length === 1 ? "" : "s"}`;
    case "tab_panel":
      return `${node.children.length} nested block${node.children.length === 1 ? "" : "s"}`;
    case "container":
    case "split":
    case "accordion":
    case "tabs":
    case "carousel":
    case "masonry":
      return `${childNodes(node).length} nested block${childNodes(node).length === 1 ? "" : "s"}`;
    case "spacer":
      return `Spacer · ${node.props.size.toUpperCase()}`;
    case "section":
      return BUILDER_NODE_REGISTRY[node.kind].description;
  }
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1).trimEnd()}…`;
}
