import { TopBar } from "@/components/TopBar";
import { TasksClient, type Task } from "./TasksClient";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/lib/workspace";

export const dynamic = "force-dynamic";

export default async function TasksPage() {
  const ctx = (await getWorkspaceContext())!;
  const supabase = createClient();
  const { data } = await supabase
    .from("tasks")
    .select("id, title, detail, status, assignee, due_date, created_at")
    .eq("workspace_id", ctx.workspaceId)
    .order("status", { ascending: true })
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });

  return (
    <>
      <TopBar title="할일" subtitle="둘이 함께 처리하는 일들" />
      <TasksClient
        workspaceId={ctx.workspaceId}
        userId={ctx.userId}
        members={ctx.members}
        initial={(data ?? []) as Task[]}
      />
    </>
  );
}
