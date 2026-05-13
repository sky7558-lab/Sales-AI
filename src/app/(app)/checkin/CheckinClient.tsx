"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fmtDate } from "@/lib/dates";
import type { WorkspaceMember } from "@/lib/workspace";

type Daily = {
  id: string;
  user_id: string;
  check_date: string;
  done: string | null;
  next: string | null;
  blockers: string | null;
  mood: number | null;
};
type Weekly = {
  id: string;
  user_id: string;
  week_start: string;
  wins: string | null;
  losses: string | null;
  next_week: string | null;
};

export function CheckinClient({
  workspaceId,
  userId,
  members,
  today,
  weekStart,
  initialDaily,
  initialWeekly,
}: {
  workspaceId: string;
  userId: string;
  members: WorkspaceMember[];
  today: string;
  weekStart: string;
  initialDaily: Daily[];
  initialWeekly: Weekly[];
}) {
  const [tab, setTab] = useState<"daily" | "weekly">("daily");
  const [daily, setDaily] = useState(initialDaily);
  const [weekly, setWeekly] = useState(initialWeekly);

  return (
    <main className="space-y-3 p-4">
      <div className="flex rounded-xl border border-border bg-surface p-1 text-xs">
        {(
          [
            { k: "daily", label: "데일리" },
            { k: "weekly", label: "위클리" },
          ] as const
        ).map((t) => (
          <button
            key={t.k}
            onClick={() => setTab(t.k)}
            className={`flex-1 rounded-lg py-2 ${
              tab === t.k ? "bg-accent text-white" : "text-muted"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "daily" ? (
        <DailyView
          workspaceId={workspaceId}
          userId={userId}
          members={members}
          today={today}
          rows={daily}
          setRows={setDaily}
        />
      ) : (
        <WeeklyView
          workspaceId={workspaceId}
          userId={userId}
          members={members}
          weekStart={weekStart}
          rows={weekly}
          setRows={setWeekly}
        />
      )}
    </main>
  );
}

function DailyView({
  workspaceId,
  userId,
  members,
  today,
  rows,
  setRows,
}: {
  workspaceId: string;
  userId: string;
  members: WorkspaceMember[];
  today: string;
  rows: Daily[];
  setRows: (f: (r: Daily[]) => Daily[]) => void;
}) {
  const supabase = createClient();
  const mine = rows.find((r) => r.user_id === userId && r.check_date === today);

  const [done, setDone] = useState(mine?.done ?? "");
  const [next, setNext] = useState(mine?.next ?? "");
  const [blockers, setBlockers] = useState(mine?.blockers ?? "");
  const [mood, setMood] = useState<number>(mine?.mood ?? 3);
  const [saving, setSaving] = useState(false);

  const grouped = useMemo(() => {
    const m = new Map<string, Daily[]>();
    rows.forEach((r) => {
      if (!m.has(r.check_date)) m.set(r.check_date, []);
      m.get(r.check_date)!.push(r);
    });
    return [...m.entries()].sort(([a], [b]) => (a < b ? 1 : -1));
  }, [rows]);

  async function save() {
    setSaving(true);
    const payload = {
      workspace_id: workspaceId,
      user_id: userId,
      check_date: today,
      done: done.trim() || null,
      next: next.trim() || null,
      blockers: blockers.trim() || null,
      mood,
    };
    const { data, error } = await supabase
      .from("daily_checks")
      .upsert(payload, { onConflict: "workspace_id,user_id,check_date" })
      .select()
      .single();
    setSaving(false);
    if (error || !data) return;
    setRows((rs) => {
      const others = rs.filter(
        (r) => !(r.user_id === userId && r.check_date === today),
      );
      return [data as Daily, ...others];
    });
  }

  function nameOf(uid: string) {
    return members.find((m) => m.user_id === uid)?.display_name ?? "동료";
  }

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-border bg-surface p-4">
        <h3 className="mb-3 text-sm font-semibold">
          오늘 {fmtDate(today)} 내 체크인
        </h3>
        <Field
          label="오늘 한 일"
          value={done}
          onChange={setDone}
          placeholder="짧게 적어도 좋아요"
        />
        <Field
          label="내일 할 일"
          value={next}
          onChange={setNext}
          placeholder="우선순위 1~3개"
        />
        <Field
          label="막힌 부분 / 도움 필요"
          value={blockers}
          onChange={setBlockers}
          placeholder="없으면 비워두기"
        />
        <div className="mb-3">
          <label className="mb-1 block text-xs text-muted">컨디션</label>
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                onClick={() => setMood(n)}
                className={`h-9 w-9 rounded-full border ${
                  mood === n
                    ? "border-accent bg-accent/20 text-accent"
                    : "border-border text-muted"
                }`}
              >
                {["😴", "😕", "😐", "🙂", "🔥"][n - 1]}
              </button>
            ))}
          </div>
        </div>
        <button
          onClick={save}
          disabled={saving}
          className="w-full rounded-xl bg-accent px-4 py-3 text-base font-medium disabled:opacity-50"
        >
          {saving ? "저장 중..." : mine ? "업데이트" : "저장"}
        </button>
      </section>

      <section className="space-y-2">
        <h3 className="px-1 text-sm font-semibold">최근 7일</h3>
        {grouped.length === 0 && (
          <p className="rounded-2xl border border-border bg-surface p-6 text-center text-sm text-muted">
            아직 기록이 없어요.
          </p>
        )}
        {grouped.map(([date, items]) => (
          <div
            key={date}
            className="rounded-2xl border border-border bg-surface p-3"
          >
            <p className="mb-2 text-xs text-muted">{fmtDate(date)}</p>
            <div className="space-y-2">
              {members.map((m) => {
                const r = items.find((x) => x.user_id === m.user_id);
                return (
                  <div
                    key={m.user_id}
                    className="rounded-xl border border-border bg-bg p-2.5"
                  >
                    <p className="text-xs font-medium">
                      {m.display_name ?? "동료"}
                      {m.user_id === userId ? " (나)" : ""}
                      {!r && (
                        <span className="ml-2 text-muted">미작성</span>
                      )}
                    </p>
                    {r?.done && (
                      <p className="mt-1 text-sm">
                        <span className="text-muted">한 일 · </span>
                        {r.done}
                      </p>
                    )}
                    {r?.next && (
                      <p className="mt-1 text-sm">
                        <span className="text-muted">내일 · </span>
                        {r.next}
                      </p>
                    )}
                    {r?.blockers && (
                      <p className="mt-1 text-sm text-warn">
                        ⚠ {r.blockers}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}

function WeeklyView({
  workspaceId,
  userId,
  members,
  weekStart,
  rows,
  setRows,
}: {
  workspaceId: string;
  userId: string;
  members: WorkspaceMember[];
  weekStart: string;
  rows: Weekly[];
  setRows: (f: (r: Weekly[]) => Weekly[]) => void;
}) {
  const supabase = createClient();
  const mine = rows.find(
    (r) => r.user_id === userId && r.week_start === weekStart,
  );

  const [wins, setWins] = useState(mine?.wins ?? "");
  const [losses, setLosses] = useState(mine?.losses ?? "");
  const [nextWeek, setNextWeek] = useState(mine?.next_week ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const { data, error } = await supabase
      .from("weekly_checks")
      .upsert(
        {
          workspace_id: workspaceId,
          user_id: userId,
          week_start: weekStart,
          wins: wins.trim() || null,
          losses: losses.trim() || null,
          next_week: nextWeek.trim() || null,
        },
        { onConflict: "workspace_id,user_id,week_start" },
      )
      .select()
      .single();
    setSaving(false);
    if (error || !data) return;
    setRows((rs) => {
      const others = rs.filter(
        (r) => !(r.user_id === userId && r.week_start === weekStart),
      );
      return [data as Weekly, ...others];
    });
  }

  const grouped = useMemo(() => {
    const m = new Map<string, Weekly[]>();
    rows.forEach((r) => {
      if (!m.has(r.week_start)) m.set(r.week_start, []);
      m.get(r.week_start)!.push(r);
    });
    return [...m.entries()].sort(([a], [b]) => (a < b ? 1 : -1));
  }, [rows]);

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-border bg-surface p-4">
        <h3 className="mb-3 text-sm font-semibold">
          이번 주 ({fmtDate(weekStart)} ~) 회고
        </h3>
        <Field
          label="잘한 점 / 성과"
          value={wins}
          onChange={setWins}
          placeholder="작은 진전도 적자"
        />
        <Field
          label="아쉬운 점 / 막힌 점"
          value={losses}
          onChange={setLosses}
          placeholder="패턴이 보이는지"
        />
        <Field
          label="다음 주 핵심 목표"
          value={nextWeek}
          onChange={setNextWeek}
          placeholder="2~3개"
        />
        <button
          onClick={save}
          disabled={saving}
          className="w-full rounded-xl bg-accent px-4 py-3 text-base font-medium disabled:opacity-50"
        >
          {saving ? "저장 중..." : mine ? "업데이트" : "저장"}
        </button>
      </section>

      <section className="space-y-2">
        <h3 className="px-1 text-sm font-semibold">지난 주차</h3>
        {grouped.length === 0 && (
          <p className="rounded-2xl border border-border bg-surface p-6 text-center text-sm text-muted">
            아직 기록이 없어요.
          </p>
        )}
        {grouped.map(([wk, items]) => (
          <div
            key={wk}
            className="rounded-2xl border border-border bg-surface p-3"
          >
            <p className="mb-2 text-xs text-muted">
              {fmtDate(wk)} 시작 주차
            </p>
            <div className="space-y-2">
              {members.map((m) => {
                const r = items.find((x) => x.user_id === m.user_id);
                if (!r) return null;
                return (
                  <div
                    key={m.user_id}
                    className="rounded-xl border border-border bg-bg p-2.5"
                  >
                    <p className="text-xs font-medium">
                      {m.display_name ?? "동료"}
                      {m.user_id === userId ? " (나)" : ""}
                    </p>
                    {r.wins && (
                      <p className="mt-1 text-sm">
                        <span className="text-muted">잘한 · </span>
                        {r.wins}
                      </p>
                    )}
                    {r.losses && (
                      <p className="mt-1 text-sm">
                        <span className="text-muted">아쉬운 · </span>
                        {r.losses}
                      </p>
                    )}
                    {r.next_week && (
                      <p className="mt-1 text-sm">
                        <span className="text-muted">다음 · </span>
                        {r.next_week}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="mb-3">
      <label className="mb-1 block text-xs text-muted">{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={2}
        placeholder={placeholder}
        className="w-full resize-none rounded-xl border border-border bg-bg px-3 py-2 text-sm outline-none placeholder:text-muted"
      />
    </div>
  );
}
