// admin-talent-languages.types.ts
//
// Types for the language editor. Kept OUT of admin-talent-languages.ts
// because that file is "use server" — Next.js's server-action transform
// requires every export to be an async function, and a client component
// (LanguageSlotPanel) importing a `export type` from it throws at runtime
// (ReferenceError: ... is not defined). Same pattern as
// admin-talent-skills.types.ts / admin-talent-contexts.types.ts.

export type { DrawerLanguageRowInput } from "@/lib/talent/talent-profile-shell-persistence";

export type TalentLanguageInput = {
  language_code: string; // ISO 639-1 e.g. "en", "es"
  language_name: string; // display name e.g. "English"
  speaking_level: "basic" | "conversational" | "professional" | "fluent" | "native";
  is_native?: boolean;
  can_host?: boolean;
  can_sell?: boolean;
  can_translate?: boolean;
  can_teach?: boolean;
  display_order?: number;
};
