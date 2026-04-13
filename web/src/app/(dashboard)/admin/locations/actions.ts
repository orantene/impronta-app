"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { parseWithSchema, trimmedString } from "@/lib/admin/validation";
import { requireStaff } from "@/lib/server/action-guards";
import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";
import { revalidateTaxonomyCaches } from "@/lib/revalidate-public";

export type LocationActionState = { error?: string; success?: boolean } | undefined;

function normalizeCountryCode(input: string): string {
  return input.trim().toUpperCase();
}

function normalizeCitySlug(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const locationWriteSchema = z.object({
  location_id: z.string(),
  country_code: z.string().min(2, "Country code is required."),
  city_slug: z.string().min(1, "City slug is required."),
  display_name_en: z.string().min(1, "English display name is required."),
  display_name_es: z.string(),
});

const locationIdSchema = z.object({
  location_id: z.string().min(1, "Missing location ID."),
});

export async function createLocation(
  _prev: LocationActionState,
  formData: FormData,
): Promise<LocationActionState> {
  const auth = await requireStaff();
  if (!auth.ok) return { error: auth.error };
  const { supabase } = auth;

  const parsed = parseWithSchema(locationWriteSchema, {
    location_id: "",
    country_code: normalizeCountryCode(trimmedString(formData, "country_code")),
    city_slug: normalizeCitySlug(trimmedString(formData, "city_slug")),
    display_name_en: trimmedString(formData, "display_name_en"),
    display_name_es: trimmedString(formData, "display_name_es"),
  });
  if ("error" in parsed) return { error: parsed.error };

  const { country_code, city_slug, display_name_en, display_name_es } = parsed.data;

  const { error } = await supabase.from("locations").insert({
    country_code,
    city_slug,
    display_name_en,
    display_name_es: display_name_es || null,
    active: true,
  });

  if (error) {
    logServerError("admin/createLocation", error);
    return { error: CLIENT_ERROR.update };
  }

  revalidatePath("/admin/locations");
  revalidatePath("/directory");
  revalidateTaxonomyCaches(); // derived location taxonomy is used in filters
  return { success: true };
}

export async function createLocationForm(formData: FormData): Promise<void> {
  await createLocation(undefined, formData);
}

export async function updateLocation(
  _prev: LocationActionState,
  formData: FormData,
): Promise<LocationActionState> {
  const auth = await requireStaff();
  if (!auth.ok) return { error: auth.error };
  const { supabase } = auth;

  const parsed = parseWithSchema(locationWriteSchema, {
    location_id: trimmedString(formData, "location_id"),
    country_code: normalizeCountryCode(trimmedString(formData, "country_code")),
    city_slug: normalizeCitySlug(trimmedString(formData, "city_slug")),
    display_name_en: trimmedString(formData, "display_name_en"),
    display_name_es: trimmedString(formData, "display_name_es"),
  });
  if ("error" in parsed) return { error: parsed.error };

  const { location_id: id, country_code, city_slug, display_name_en, display_name_es } =
    parsed.data;

  const { error } = await supabase
    .from("locations")
    .update({
      country_code,
      city_slug,
      display_name_en,
      display_name_es: display_name_es || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    logServerError("admin/updateLocation", error);
    return { error: CLIENT_ERROR.update };
  }

  revalidatePath("/admin/locations");
  revalidatePath("/directory");
  revalidateTaxonomyCaches();
  return { success: true };
}

export async function updateLocationForm(formData: FormData): Promise<void> {
  await updateLocation(undefined, formData);
}

export async function archiveLocation(
  _prev: LocationActionState,
  formData: FormData,
): Promise<LocationActionState> {
  const auth = await requireStaff();
  if (!auth.ok) return { error: auth.error };
  const { supabase } = auth;

  const parsed = parseWithSchema(locationIdSchema, {
    location_id: trimmedString(formData, "location_id"),
  });
  if ("error" in parsed) return { error: parsed.error };
  const { location_id: id } = parsed.data;

  const { error } = await supabase
    .from("locations")
    .update({ archived_at: new Date().toISOString(), active: false, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    logServerError("admin/archiveLocation", error);
    return { error: CLIENT_ERROR.update };
  }

  revalidatePath("/admin/locations");
  revalidatePath("/directory");
  revalidateTaxonomyCaches();
  return { success: true };
}

export async function archiveLocationForm(formData: FormData): Promise<void> {
  await archiveLocation(undefined, formData);
}

export async function restoreLocation(
  _prev: LocationActionState,
  formData: FormData,
): Promise<LocationActionState> {
  const auth = await requireStaff();
  if (!auth.ok) return { error: auth.error };
  const { supabase } = auth;

  const parsed = parseWithSchema(locationIdSchema, {
    location_id: trimmedString(formData, "location_id"),
  });
  if ("error" in parsed) return { error: parsed.error };
  const { location_id: id } = parsed.data;

  const { error } = await supabase
    .from("locations")
    .update({ archived_at: null, active: true, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    logServerError("admin/restoreLocation", error);
    return { error: CLIENT_ERROR.update };
  }

  revalidatePath("/admin/locations");
  revalidatePath("/directory");
  revalidateTaxonomyCaches();
  return { success: true };
}

export async function restoreLocationForm(formData: FormData): Promise<void> {
  await restoreLocation(undefined, formData);
}
