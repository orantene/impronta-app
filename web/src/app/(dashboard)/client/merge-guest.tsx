"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { mergeGuestActivity } from "@/app/(dashboard)/client/actions";

export function MergeGuestFavorites() {
  const ran = useRef(false);
  const router = useRouter();

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    void mergeGuestActivity().then(() => {
      router.refresh();
    });
  }, [router]);
  return null;
}
