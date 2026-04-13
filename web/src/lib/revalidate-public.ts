import { revalidateTag } from "next/cache";
import {
  CACHE_TAG_DIRECTORY,
  CACHE_TAG_TAXONOMY,
} from "@/lib/cache-tags";

/** Call from server actions / webhooks when public talent listings change. */
export function revalidateDirectoryListing() {
  revalidateTag(CACHE_TAG_DIRECTORY, "default");
}

/** Call when taxonomy terms are edited in admin. */
export function revalidateTaxonomyCaches() {
  revalidateTag(CACHE_TAG_TAXONOMY, "default");
}
