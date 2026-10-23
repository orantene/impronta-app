import { revalidateTag } from "next/cache";
import {
  CACHE_TAG_DIRECTORY,
  CACHE_TAG_TAXONOMY,
} from "@/lib/cache-tags";
import { requestDiscoverIndexRefresh } from "@/lib/directory/request-discover-index-refresh";

/** Call from server actions / webhooks when public talent listings change. */
export function revalidateDirectoryListing() {
  revalidateTag(CACHE_TAG_DIRECTORY, "default");
  // TUL-1940: also refresh the discover matview (coalesced, after-response, best effort).
  requestDiscoverIndexRefresh();
}

/** Call when taxonomy terms are edited in admin. */
export function revalidateTaxonomyCaches() {
  revalidateTag(CACHE_TAG_TAXONOMY, "default");
}
