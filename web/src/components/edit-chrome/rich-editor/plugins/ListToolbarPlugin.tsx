"use client";

/**
 * Always-visible list controls for the inspector (and canvas overlay when
 * the floating format pill is hidden). Clicking these is the operator
 * door for B4; the floating Bold/Italic toolbar stays selection-only.
 */

import { useEffect, useState } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { COMMAND_PRIORITY_LOW, SELECTION_CHANGE_COMMAND } from "lexical";

import { useEditorLocale } from "../../use-editor-locale";
import {
  $selectionListType,
  TOGGLE_BULLET_LIST_COMMAND,
  TOGGLE_NUMBER_LIST_COMMAND,
} from "./list-commands";

export function ListToolbarPlugin() {
  const [editor] = useLexicalComposerContext();
  const { t } = useEditorLocale();
  const [active, setActive] = useState<"bullet" | "number" | null>(null);

  useEffect(() => {
    function read() {
      editor.getEditorState().read(() => {
        setActive($selectionListType());
      });
    }
    read();
    const unCommand = editor.registerCommand(
      SELECTION_CHANGE_COMMAND,
      () => {
        read();
        return false;
      },
      COMMAND_PRIORITY_LOW,
    );
    const unUpdate = editor.registerUpdateListener(() => read());
    return () => {
      unCommand();
      unUpdate();
    };
  }, [editor]);

  return (
    <div
      data-edit-rich-list-bar=""
      className="mb-1 flex items-center gap-0.5"
      role="toolbar"
      aria-label={t("Lists")}
    >
      <button
        type="button"
        data-rich-list="ul"
        aria-label={t("Bullet list")}
        aria-pressed={active === "bullet"}
        title={t("Bullet list")}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => editor.dispatchCommand(TOGGLE_BULLET_LIST_COMMAND, undefined)}
        className={[
          "inline-flex h-7 min-w-7 items-center justify-center rounded-md border px-1.5 text-[12px] font-semibold",
          active === "bullet"
            ? "border-[#7c3aed]/40 bg-[#7c3aed]/10 text-[#7c3aed]"
            : "border-black/10 bg-white text-[#3f3f46]",
        ].join(" ")}
      >
        •
      </button>
      <button
        type="button"
        data-rich-list="ol"
        aria-label={t("Numbered list")}
        aria-pressed={active === "number"}
        title={t("Numbered list")}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => editor.dispatchCommand(TOGGLE_NUMBER_LIST_COMMAND, undefined)}
        className={[
          "inline-flex h-7 min-w-7 items-center justify-center rounded-md border px-1.5 text-[12px] font-semibold",
          active === "number"
            ? "border-[#7c3aed]/40 bg-[#7c3aed]/10 text-[#7c3aed]"
            : "border-black/10 bg-white text-[#3f3f46]",
        ].join(" ")}
      >
        1.
      </button>
    </div>
  );
}
