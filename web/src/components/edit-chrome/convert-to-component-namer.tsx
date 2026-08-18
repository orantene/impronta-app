"use client";

/**
 * Overlay that names a reusable component. Replaces `window.prompt` on the
 * canvas context-menu "Convert to component" path so selection-layer does not
 * grow another inline dialog.
 */

import { createPortal } from "react-dom";

import { InlineNameInput } from "./inspectors/kit/inline-name-input";
import { CHROME_SHADOWS, Z_INDEX } from "./kit/tokens";
import { useEditorLocale } from "./use-editor-locale";

export function ConvertToComponentNamer({
  suggested,
  onConfirm,
  onCancel,
}: {
  suggested: string;
  onConfirm: (name: string) => void;
  onCancel: () => void;
}) {
  const { t } = useEditorLocale();
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: Z_INDEX.canvasPanels + 2,
        background: "rgba(18, 18, 18, 0.18)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        paddingTop: "18vh",
      }}
    >
      <div
        style={{
          width: 320,
          maxWidth: "calc(100vw - 32px)",
          boxShadow: CHROME_SHADOWS.popover,
        }}
      >
        <InlineNameInput
          mode="text"
          title={t("Name this reusable component")}
          placeholder={t("Component name")}
          defaultValue={suggested}
          confirmLabel={t("Save component")}
          cancelLabel={t("Cancel")}
          onConfirm={(value) => {
            const trimmed = value.trim() || suggested;
            onConfirm(trimmed);
          }}
          onCancel={onCancel}
        />
      </div>
    </div>,
    document.body,
  );
}
