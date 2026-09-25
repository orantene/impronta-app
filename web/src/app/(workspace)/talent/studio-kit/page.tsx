import { notFound } from "next/navigation";
import { StudioKit } from "@/components/talent/studio/StudioKit";

export const dynamic = "force-dynamic";

export default function StudioKitPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <StudioKit />;
}
