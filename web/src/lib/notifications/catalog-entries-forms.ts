import "server-only";

import * as React from "react";
import FormSubmission from "../../../emails/workspace/FormSubmission";
import type { CatalogEntry } from "./types";
import { workspaceAdmins, str } from "./catalog-audiences";
import { pageUrl } from "./catalog-render";

/**
 * Form-submission notification catalog entries.
 *
 * The `cms_form.submitted` domain event is emitted by the
 * `/api/cms/forms/submit` route after a successful insert. It carries:
 *   - tenantId      : the tenant UUID
 *   - payload.formName      : the cms_sections.name
 *   - payload.sectionId     : the section UUID
 *   - payload.submissionId  : the cms_form_submissions.id
 *   - payload.contactName   : name field (nullable)
 *   - payload.contactEmail  : email field (nullable)
 *   - payload.submittedAt   : ISO timestamp of the insert
 *   - payload.payloadFields : Array<{label: string; value: string}> (capped at 8)
 */

/**
 * cms_form.submitted → workspace admins (owner + admin memberships).
 * Category: workspace_activity (operators can opt out if they choose).
 * No in_app bell — the forms inbox itself is the primary triage surface.
 */
export const FORM_SUBMITTED_WORKSPACE: CatalogEntry = {
  id: "cms_form.submitted.workspace",
  category: "workspace_activity",
  defaultChannels: ["email"],
  required: false,
  triggers: ["cms_form.submitted"],
  resolveAudience: workspaceAdmins,
  email: {
    templateId: "workspace.form_submission",
    subject: (event) => {
      const name = str(event.payload.contactName);
      const form = str(event.payload.formName) ?? "form";
      return name
        ? `New form submission from ${name} — ${form}`
        : `New form submission — ${form}`;
    },
    render: ({ event, brand, unsubscribeUrl }) => {
      const payloadFields = Array.isArray(event.payload.payloadFields)
        ? (event.payload.payloadFields as Array<{ label: string; value: string }>).slice(0, 8)
        : [];

      return React.createElement(FormSubmission, {
        formName: str(event.payload.formName) ?? "Contact form",
        agencyName: brand.accountName ?? "your agency",
        contactName: str(event.payload.contactName),
        contactEmail: str(event.payload.contactEmail),
        submittedAt: str(event.payload.submittedAt) ?? new Date().toISOString(),
        inboxUrl: pageUrl(brand, `/${event.payload.tenantSlug ?? "admin"}/admin/website/forms`),
        payloadFields,
        brand,
        unsubscribeUrl,
      });
    },
  },
};

export const FORMS_CATALOG_ENTRIES: CatalogEntry[] = [FORM_SUBMITTED_WORKSPACE];
