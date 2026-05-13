import { TopBar } from "@/components/TopBar";
import { CheckinClient } from "./CheckinClient";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/lib/workspace";
import { todayISO, weekStartISO } from "@/lib/dates";

export const dynamic = "force-dynamic";

export default async function CheckinPage() {
  const ctx = (await getWorkspaceContext())!;
  const supabase = createClient();
  const today = todayISO();
  const weekStart = weekStartISO();

  // last 7 days of daily check-ins
  const since = new Date();
  since.setDate(since.getDate() - 6);
  const sinceISO = since.toISOString().slice(0, 10);

  const [{ data: daily }, { data: weekly }] = await Promise.all([
    supabase
      .from("daily_checks")
      .select("id, user_id, check_date, done, next, blockers, mood")
      .eq("workspace_id", ctx.workspaceId)
      .gte("check_date", sinceISO)
      .order("check_date", { ascending: false }),
    supabase
      .from("weekly_checks")
      .select("id, user_id, week_start, wins, losses, next_week")
      .eq("workspace_id", ctx.workspaceId)
      .order("week_start", { ascending: false })
      .limit(8),
  ]);

  return (
    <>
      <TopBar title="체크인" subtitle="매일·매주 짧게 공유" />
      <CheckinClient
        workspaceId={ctx.workspaceId}
        userId={ctx.userId}
        members={ctx.members}
        today={today}
        weekStart={weekStart}
        initialDaily={daily ?? []}
        initialWeekly={weekly ?? []}
      />
    </>
  );
}
