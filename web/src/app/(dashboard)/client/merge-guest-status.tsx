"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { mergeGuestActivity } from "@/app/(dashboard)/client/actions";

type MergeState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; mergedSavedCount: number; mergedInquiryCount: number }
  | { status: "error"; message: string };

export function MergeGuestStatus() {
  const ran = useRef(false);
  const router = useRouter();
  const [state, setState] = useState<MergeState>({ status: "idle" });

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    setState({ status: "loading" });
    void mergeGuestActivity().then((result) => {
      if (!result.ok) {
        setState({ status: "error", message: result.error });
        return;
      }
      if (result.mergedSavedCount > 0 || result.mergedInquiryCount > 0) {
        setState({
          status: "success",
          mergedSavedCount: result.mergedSavedCount,
          mergedInquiryCount: result.mergedInquiryCount,
        });
        router.refresh();
        return;
      }
      setState({ status: "idle" });
    });
  }, [router]);

  if (state.status === "idle") return null;
  if (state.status === "loading") {
    return (
      <p className="rounded-xl border border-border/60 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
        Merging any guest saves and inquiries into this client account…
      </p>
    );
  }
  if (state.status === "error") {
    return (
      <p className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
        {state.message}
      </p>
    );
  }
  return (
    <p className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700">
      Guest activity merged into this account: {state.mergedSavedCount} saved talent and{" "}
      {state.mergedInquiryCount} request{state.mergedInquiryCount === 1 ? "" : "s"}.
    </p>
  );
}
