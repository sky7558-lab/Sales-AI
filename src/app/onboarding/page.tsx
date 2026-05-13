import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { OnboardingClient } from "./OnboardingClient";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // If user already has a workspace, skip onboarding.
  const { data: existing } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .limit(1);
  if (existing && existing.length > 0) redirect("/");

  return (
    <OnboardingClient
      userId={user.id}
      defaultName={user.email?.split("@")[0] ?? "나"}
    />
  );
}
