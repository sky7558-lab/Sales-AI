import Link from "next/link";
import { TopBar } from "@/components/TopBar";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/lib/workspace";
import { fmtDate, todayISO } from "@/lib/dates";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const ctx = (await getWorkspaceContext())!;
  const supabase = createClient();

  const today = todayISO();

  const [{ data: tasks }, { data: todayChecks }] = await Promise.all([
    supabase
      .from("tasks")
      .select("id, title, status, assignee, due_date")
      .eq("workspace_id", ctx.workspaceId)
      .neq("status", "done")
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(50),
    supabase
      .from("daily_checks")
      .select("user_id, done, next, blockers, mood")
      .eq("workspace_id", ctx.workspaceId)
      .eq("check_date", today),
  ]);

  const all = tasks ?? [];
  const done = await supabase
    .from("tasks")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", ctx.workspaceId)
    .eq("status", "done");

  const totalCount = (all.length ?? 0) + (done.count ?? 0);
  const doneCount = done.count ?? 0;
  const pct = totalCount === 0 ? 0 : Math.round((doneCount / totalCount) * 100);

  const overdue = all.filter(
    (t) => t.due_date && t.due_date < today,
  );
  const dueToday = all.filter((t) => t.due_date === today);

  const nameOf = (uid: string | null) =>
    ctx.members.find((m) => m.user_id === uid)?.display_name ??
    (uid === ctx.userId ? "나" : "동료");

  return (
    <>
      <TopBar
        title={ctx.workspaceName}
        subtitle={`${ctx.myDisplayName} 님, 오늘도 화이팅`}
      />
      <main className="space-y-4 p-4">
        <section className="rounded-2xl border border-border bg-surface p-4">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm text-muted">전체 진행률</h2>
            <span className="text-2xl font-semibold">{pct}%</span>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-bg">
            <div
              className="h-full bg-accent transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
            <Stat label="할일" value={all.length} />
            <Stat label="오늘 마감" value={dueToday.length} tone="warn" />
            <Stat label="지난 마감" value={overdue.length} tone="danger" />
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-surface p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">오늘의 체크인</h2>
            <Link href="/checkin" className="text-xs text-accent">
              작성/보기
            </Link>
          </div>
          <div className="space-y-2">
            {ctx.members.map((m) => {
              const c = todayChecks?.find((x) => x.user_id === m.user_id);
              const me = m.user_id === ctx.userId;
              return (
                <div
                  key={m.user_id}
                  className={`rounded-xl border p-3 ${
                    c
                      ? "border-ok/30 bg-ok/5"
                      : "border-border bg-bg"
                  }`}
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium">
                      {m.display_name ?? "동료"}
                      {me ? " (나)" : ""}
                    </span>
                    <span className={c ? "text-ok" : "text-muted"}>
                      {c ? "체크 완료" : "아직 미작성"}
                    </span>
                  </div>
                  {c?.done && (
                    <p className="mt-2 text-sm leading-snug text-white/90">
                      <span className="text-muted">한 일 · </span>
                      {c.done}
                    </p>
                  )}
                  {c?.next && (
                    <p className="mt-1 text-sm leading-snug text-white/90">
                      <span className="text-muted">내일 · </span>
                      {c.next}
                    </p>
                  )}
                  {c?.blockers && (
                    <p className="mt-1 text-sm leading-snug text-warn">
                      ⚠ {c.blockers}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-surface p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">지금 처리해야 할 일</h2>
            <Link href="/tasks" className="text-xs text-accent">
              전체 보기
            </Link>
          </div>
          {all.slice(0, 6).length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">
              할일이 없네요. 깔끔!
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {all.slice(0, 6).map((t) => (
                <li
                  key={t.id}
                  className="flex items-center justify-between gap-3 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{t.title}</p>
                    <p className="text-xs text-muted">
                      {nameOf(t.assignee)}
                      {t.due_date ? ` · ${fmtDate(t.due_date)}` : ""}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] ${
                      t.status === "doing"
                        ? "bg-accent/20 text-accent"
                        : "bg-border text-muted"
                    }`}
                  >
                    {t.status === "doing" ? "진행중" : "대기"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "warn" | "danger";
}) {
  const color =
    tone === "danger"
      ? "text-danger"
      : tone === "warn"
        ? "text-warn"
        : "text-white";
  return (
    <div className="rounded-xl bg-bg py-2">
      <div className={`text-lg font-semibold ${color}`}>{value}</div>
      <div className="text-[11px] text-muted">{label}</div>
    </div>
  );
}
