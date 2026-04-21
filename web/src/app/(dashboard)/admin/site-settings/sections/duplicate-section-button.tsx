"use client";

/**
 * Phase 5 / M4.7 — duplicate-section action button.
 *
 * Lives inside the list table and the editor page. Submits a minimal form
 * carrying `sourceId` + `newName`; the server action resolves empty
 * newName to "<source.name> (copy)" and redirects to the new draft's
 * editor on success.
 *
 * We gather the name via `window.prompt` rather than a modal — this
 * surface is admin-internal and the prompt keeps the keyboard flow fast
 * for operators cloning many sections in a row. Cancel aborts; an empty
 * string is treated as "use the default name" and the server handles the
 * suffix.
 */

import { useActionState } from "react";

import { Button } from "@/components/ui/button";

import { duplicateSectionAction, type SectionActionState } from "./actions";

export function DuplicateSectionButton({
  sourceId,
  sourceName,
}: {
  sourceId: string;
  sourceName: string;
}) {
  const [state, action, pending] = useActionState<
    SectionActionState,
    FormData
  >(duplicateSectionAction, undefined);

  return (
    <form
      action={action}
      onSubmit={(e) => {
        const form = e.currentTarget;
        // Re-prompt on every submit (fresh default each click).
        const defaultName = `${sourceName} (copy)`;
        const answer = window.prompt(
          `Name for the duplicated section?\n\nLeave blank to use "${defaultName}".`,
          defaultName,
        );
        if (answer === null) {
          // Operator cancelled — abort the submit.
          e.preventDefault();
          return;
        }
        // Stuff the chosen name onto the hidden input before submit.
        const nameInput = form.elements.namedItem(
          "newName",
        ) as HTMLInputElement | null;
        if (nameInput) {
          nameInput.value = answer === defaultName ? "" : answer;
        }
      }}
      className="inline-flex"
    >
      <input type="hidden" name="sourceId" value={sourceId} />
      <input type="hidden" name="newName" value="" />
      <Button
        type="submit"
        variant="outline"
        size="sm"
        disabled={pending}
        title="Create a new draft section with the same type, schema version, and props."
      >
        {pending ? "Duplicating…" : "Duplicate"}
      </Button>
      {/*
       * Error feedback: duplicate failures usually mean "name already taken"
       * (23505 → VALIDATION_FAILED). Surface a small inline note when the
       * action returned an error state; successes redirect away.
       */}
      {state && state.ok === false && (
        <span className="ml-2 text-xs text-destructive" role="alert">
          {state.error}
        </span>
      )}
    </form>
  );
}
