"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ComponentProps } from "react";
import { BookPageClient } from "./BookPageClient";
import { searchWithService } from "./book-availability";

/**
 * TUL-1913: /book keeps the chosen service in `?service=` so a reload or a
 * shared link opens on it. router.replace: no new history entry, no scroll.
 */
export function BookPageUrlSync(props: Omit<ComponentProps<typeof BookPageClient>, "onServicePicked">) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  return (
    <BookPageClient
      {...props}
      onServicePicked={(id) => {
        router.replace(`${pathname}${searchWithService(search.toString(), id)}`, { scroll: false });
      }}
    />
  );
}
