import { createClient } from "@/lib/supabase/server";

export type WorkspaceMember = {
  user_id: string;
  display_name: string | null;
};

export type WorkspaceContext = {
  userId: string;
  email: string | null;
  workspaceId: string;
  workspaceName: string;
  members: WorkspaceMember[];
  myDisplayName: string;
};

/**
 * Loads the user's first workspace. Returns null when the user has no workspace
 * yet so the caller can redirect to /onboarding.
 */
export async function getWorkspaceContext(): Promise<WorkspaceContext | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: memberships } = await supabase
    .from("workspace_members")
    .select("workspace_id, display_name, workspaces(name)")
    .eq("user_id", user.id)
    .order("joined_at", { ascending: true })
    .limit(1);

  const first = memberships?.[0];
  if (!first) return null;

  const workspaceId = first.workspace_id as string;
  const workspaceName =
    (first as unknown as { workspaces?: { name: string } })?.workspaces
      ?.name ?? "내 프로젝트";

  const { data: members } = await supabase
    .from("workspace_members")
    .select("user_id, display_name")
    .eq("workspace_id", workspaceId);

  const myMember = members?.find((m) => m.user_id === user.id);

  return {
    userId: user.id,
    email: user.email ?? null,
    workspaceId,
    workspaceName,
    members: (members ?? []) as WorkspaceMember[],
    myDisplayName: myMember?.display_name ?? user.email?.split("@")[0] ?? "나",
  };
}
