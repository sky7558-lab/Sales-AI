import { TopBar } from "@/components/TopBar";
import { NotesClient, type Note } from "./NotesClient";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/lib/workspace";

export const dynamic = "force-dynamic";

export default async function NotesPage() {
  const ctx = (await getWorkspaceContext())!;
  const supabase = createClient();
  const { data } = await supabase
    .from("notes")
    .select("id, author, title, body, pinned, created_at")
    .eq("workspace_id", ctx.workspaceId)
    .order("pinned", { ascending: false })
    .order("created_at", { ascending: false });

  return (
    <>
      <TopBar title="메모" subtitle="결정·아이디어·논의" />
      <NotesClient
        workspaceId={ctx.workspaceId}
        userId={ctx.userId}
        members={ctx.members}
        initial={(data ?? []) as Note[]}
      />
    </>
  );
}
