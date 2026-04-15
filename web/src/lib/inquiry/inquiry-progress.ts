import type { WorkspaceStatus } from "./inquiry-workspace-types";

export type ProgressStepResult = {
  step: number;
  label: string;
  message: string;
  isTerminal: boolean;
  terminalLabel?: string;
};

export function getProgressStep(status: WorkspaceStatus): ProgressStepResult {
  const terminal: Partial<Record<WorkspaceStatus, { label: string; message: string }>> = {
    rejected: { label: "Declined", message: "This inquiry has been declined" },
    expired: { label: "Expired", message: "This inquiry has expired" },
    closed_lost: { label: "Closed", message: "This inquiry has been closed" },
    archived: { label: "Archived", message: "This inquiry has been archived" },
  };

  if (terminal[status]) {
    const t = terminal[status]!;
    return {
      step: 0,
      label: t.label,
      message: t.message,
      isTerminal: true,
      terminalLabel: t.label,
    };
  }

  if (status === "draft" || status === "submitted") {
    return {
      step: 1,
      label: "Submitted",
      message: "Your request has been received",
      isTerminal: false,
    };
  }
  if (status === "reviewing" || status === "coordination") {
    return {
      step: 2,
      label: "In review",
      message: "We are reviewing your request",
      isTerminal: false,
    };
  }
  if (status === "offer_pending") {
    return {
      step: 3,
      label: "Offer sent",
      message: "Offer sent — awaiting your response",
      isTerminal: false,
    };
  }
  if (status === "approved") {
    return {
      step: 4,
      label: "Approvals",
      message: "Waiting for confirmations",
      isTerminal: false,
    };
  }
  if (status === "booked") {
    return {
      step: 5,
      label: "Booked",
      message: "Your booking is confirmed",
      isTerminal: false,
    };
  }
  return {
    step: 2,
    label: "In review",
    message: "We are reviewing your request",
    isTerminal: false,
  };
}
