// "Close as lost" confirmation gate (2026-07-23). During live QA a stray
// single click on the Move-to menu's "Close as lost" item immediately set a
// brand-new client inquiry to closed_lost (no dialog, no undo). The menu now
// routes that one item through the shell ConfirmDialog primitive; every other
// transition still fires on first click. These tests pin BOTH behaviors.
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen } from "@testing-library/dom";
import { StageTransitionMenu } from "@/components/admin/shell/internal/messages/admin-1";
import { testRenderWithShell } from "../../../../../helpers/test-render";

const quickPatchInquiryStatus = vi.fn(async () => ({ ok: true }));
const convertInquiryToBookingAction = vi.fn(async () => ({ ok: true }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, prefetch: () => {}, back: () => {}, forward: () => {}, refresh: () => {} }),
  usePathname: () => "/admin/messages",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/server-actions/admin-inquiries", () => ({
  quickPatchInquiryStatus: (fd: FormData) => quickPatchInquiryStatus(fd),
}));
vi.mock("@/app/(workspace)/[tenantSlug]/admin/_pipeline-actions", () => ({
  bulkNudgeInquiries: vi.fn(),
  bulkSetInquiryArchived: vi.fn(),
  bulkReassignInquiriesToMe: vi.fn(),
  convertInquiryToBookingAction: (...a: unknown[]) => convertInquiryToBookingAction(...a),
}));

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("StageTransitionMenu — Close as lost confirmation", () => {
  beforeEach(() => {
    quickPatchInquiryStatus.mockClear();
  });

  it("gates Close as lost behind ConfirmDialog; Cancel commits nothing", async () => {
    testRenderWithShell(<StageTransitionMenu inquiryId="inq-1" stage={"submitted" as never} />);

    fireEvent.click(screen.getByRole("button", { name: /move to/i }));
    fireEvent.click(screen.getByRole("button", { name: /^close as lost$/i }));
    await flush();

    // Dialog is up, mutation has NOT fired.
    expect(screen.getByText("Close this inquiry as lost?")).toBeTruthy();
    expect(quickPatchInquiryStatus).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    await flush();
    expect(screen.queryByText("Close this inquiry as lost?")).toBeNull();
    expect(quickPatchInquiryStatus).not.toHaveBeenCalled();
  });

  it("Confirm commits the closed_lost patch exactly once", async () => {
    testRenderWithShell(<StageTransitionMenu inquiryId="inq-2" stage={"submitted" as never} />);

    fireEvent.click(screen.getByRole("button", { name: /move to/i }));
    fireEvent.click(screen.getByRole("button", { name: /^close as lost$/i }));
    await flush();

    // The dialog's confirm button carries the same label as the menu item;
    // the menu is closed by now so exactly one such button remains.
    fireEvent.click(screen.getByRole("button", { name: /^close as lost$/i }));
    await flush();

    expect(quickPatchInquiryStatus).toHaveBeenCalledTimes(1);
    const fd = quickPatchInquiryStatus.mock.calls[0][0] as FormData;
    expect(fd.get("inquiry_id")).toBe("inq-2");
    expect(fd.get("status")).toBe("closed_lost");
  });

  it("non-destructive transitions still fire on first click (no dialog)", async () => {
    testRenderWithShell(<StageTransitionMenu inquiryId="inq-3" stage={"submitted" as never} />);

    fireEvent.click(screen.getByRole("button", { name: /move to$/i }));
    fireEvent.click(screen.getByRole("button", { name: /move to review/i }));
    await flush();

    expect(screen.queryByText("Close this inquiry as lost?")).toBeNull();
    expect(quickPatchInquiryStatus).toHaveBeenCalledTimes(1);
    const fd = quickPatchInquiryStatus.mock.calls[0][0] as FormData;
    expect(fd.get("status")).toBe("reviewing");
  });
});
