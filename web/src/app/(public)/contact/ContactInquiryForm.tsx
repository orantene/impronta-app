"use client";

/**
 * ContactInquiryForm — the client form behind the public /contact page.
 *
 * Submits through `submitContactInquiry`, which reuses the canonical guest
 * inquiry path (`submitInquiry` engine). On success it swaps to an inline
 * confirmation panel; on error it shows an inline message and keeps the
 * field values so the visitor can retry. Required fields are validated
 * client-side (native `required`) and the submit button disables while the
 * server action is pending.
 */

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { submitContactInquiry, type ContactInquiryState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type ContactFormCopy = {
  nameLabel: string;
  emailLabel: string;
  phoneLabel: string;
  messageLabel: string;
  messagePlaceholder: string;
  submit: string;
  submitting: string;
  privacy: string;
  successTitle: string;
  successBody: string;
  successBodyWithEmail: string;
  sendAnother: string;
};

function SubmitButton({ copy }: { copy: ContactFormCopy }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full sm:w-auto">
      {pending ? copy.submitting : copy.submit}
    </Button>
  );
}

export function ContactInquiryForm({ copy }: { copy: ContactFormCopy }) {
  const [state, formAction] = useActionState<ContactInquiryState, FormData>(
    submitContactInquiry,
    { status: "idle" },
  );

  if (state.status === "success") {
    return (
      <div className="mt-10 rounded-lg border border-border/70 bg-muted/30 px-6 py-8">
        <h2 className="font-display text-xl font-normal tracking-wide text-foreground">
          {copy.successTitle}
        </h2>
        <p className="mt-3 text-muted-foreground">
          {state.email
            ? copy.successBodyWithEmail.replace("{email}", state.email)
            : copy.successBody}
        </p>
        <Button
          variant="ghost"
          className="mt-6 px-0 text-muted-foreground hover:text-foreground"
          onClick={() => window.location.reload()}
        >
          {copy.sendAnother}
        </Button>
      </div>
    );
  }

  return (
    <form action={formAction} className="mt-10 flex flex-col gap-5">
      {/* Honeypot — visually hidden, off the tab order. Bots fill it; humans don't. */}
      <div aria-hidden className="hidden">
        <label>
          Website
          <input type="text" name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="contact_name">{copy.nameLabel}</Label>
          <Input id="contact_name" name="contact_name" required autoComplete="name" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="contact_email">{copy.emailLabel}</Label>
          <Input
            id="contact_email"
            name="contact_email"
            type="email"
            required
            autoComplete="email"
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="contact_phone">{copy.phoneLabel}</Label>
        <Input
          id="contact_phone"
          name="contact_phone"
          type="tel"
          autoComplete="tel"
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="message">{copy.messageLabel}</Label>
        <Textarea
          id="message"
          name="message"
          required
          rows={6}
          placeholder={copy.messagePlaceholder}
        />
      </div>

      {state.status === "error" ? (
        <p className="text-m text-destructive" role="alert">
          {state.error}
        </p>
      ) : null}

      <div className="flex flex-col gap-3">
        <SubmitButton copy={copy} />
        <p className="text-sm text-muted-foreground">{copy.privacy}</p>
      </div>
    </form>
  );
}
