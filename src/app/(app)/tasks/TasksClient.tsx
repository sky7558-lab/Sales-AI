"use client";

import { useMemo, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { fmtDate } from "@/lib/dates";
import type { WorkspaceMember } from "@/lib/workspace";

export type Task = {
  id: string;
  title: string;
  detail: string | null;
  status: "todo" | "doing" | "done";
  assignee: string | null;
  due_date: string | null;
  created_at: string;
};

type Filter = "all" | "mine" | "open" | "done";

export function TasksClient({
  workspaceId,
  userId,
  members,
  initial,
}: {
  workspaceId: string;
  userId: string;
  members: WorkspaceMember[];
  initial: Task[];
}) {
  const supabase = createClient();
  const [tasks, setTasks] = useState(initial);
  const [filter, setFilter] = useState<Filter>("open");
  const [, startTransition] = useTransition();
  const [showAdd, setShowAdd] = useState(false);

  const filtered = useMemo(() => {
    return tasks.filter((t) => {
      if (filter === "mine") return t.assignee === userId && t.status !== "done";
      if (filter === "open") return t.status !== "done";
      if (filter === "done") return t.status === "done";
      return true;
    });
  }, [tasks, filter, userId]);

  function nameOf(uid: string | null) {
    if (!uid) return "미지정";
    return members.find((m) => m.user_id === uid)?.display_name ?? "동료";
  }

  async function setStatus(id: string, status: Task["status"]) {
    const prev = tasks;
    setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, status } : t)));
    const { error } = await supabase
      .from("tasks")
      .update({ status })
      .eq("id", id);
    if (error) setTasks(prev);
  }

  async function setAssignee(id: string, assignee: string | null) {
    const prev = tasks;
    setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, assignee } : t)));
    const { error } = await supabase
      .from("tasks")
      .update({ assignee })
      .eq("id", id);
    if (error) setTasks(prev);
  }

  async function setDue(id: string, due_date: string | null) {
    const prev = tasks;
    setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, due_date } : t)));
    const { error } = await supabase
      .from("tasks")
      .update({ due_date })
      .eq("id", id);
    if (error) setTasks(prev);
  }

  async function remove(id: string) {
    if (!confirm("이 할일을 지울까요?")) return;
    const prev = tasks;
    setTasks((ts) => ts.filter((t) => t.id !== id));
    const { error } = await supabase.from("tasks").delete().eq("id", id);
    if (error) setTasks(prev);
  }

  async function addTask(payload: {
    title: string;
    detail: string | null;
    assignee: string | null;
    due_date: string | null;
  }) {
    const { data, error } = await supabase
      .from("tasks")
      .insert({
        workspace_id: workspaceId,
        created_by: userId,
        ...payload,
      })
      .select("id, title, detail, status, assignee, due_date, created_at")
      .single();
    if (error || !data) return;
    setTasks((ts) => [data as Task, ...ts]);
    startTransition(() => setShowAdd(false));
  }

  return (
    <main className="space-y-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <FilterTabs value={filter} onChange={setFilter} />
        <button
          onClick={() => setShowAdd(true)}
          className="rounded-xl bg-accent px-3 py-2 text-sm font-medium"
        >
          + 새 할일
        </button>
      </div>

      <ul className="space-y-2">
        {filtered.length === 0 && (
          <li className="rounded-2xl border border-border bg-surface p-6 text-center text-sm text-muted">
            해당하는 할일이 없습니다.
          </li>
        )}
        {filtered.map((t) => (
          <li
            key={t.id}
            className="rounded-2xl border border-border bg-surface p-3"
          >
            <div className="flex items-start gap-3">
              <button
                onClick={() =>
                  setStatus(t.id, t.status === "done" ? "todo" : "done")
                }
                className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md border ${
                  t.status === "done"
                    ? "border-ok bg-ok text-white"
                    : "border-border"
                }`}
                aria-label="완료 토글"
              >
                {t.status === "done" ? "✓" : ""}
              </button>
              <div className="min-w-0 flex-1">
                <p
                  className={`text-base ${
                    t.status === "done"
                      ? "text-muted line-through"
                      : "text-white"
                  }`}
                >
                  {t.title}
                </p>
                {t.detail && (
                  <p className="mt-0.5 text-xs text-muted">{t.detail}</p>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
                  <select
                    value={t.assignee ?? ""}
                    onChange={(e) =>
                      setAssignee(t.id, e.target.value || null)
                    }
                    className="rounded-full border border-border bg-bg px-2 py-1 text-muted"
                  >
                    <option value="">담당 미정</option>
                    {members.map((m) => (
                      <option key={m.user_id} value={m.user_id}>
                        {m.display_name ?? "동료"}
                      </option>
                    ))}
                  </select>
                  <input
                    type="date"
                    value={t.due_date ?? ""}
                    onChange={(e) => setDue(t.id, e.target.value || null)}
                    className="rounded-full border border-border bg-bg px-2 py-1 text-muted"
                  />
                  <select
                    value={t.status}
                    onChange={(e) =>
                      setStatus(t.id, e.target.value as Task["status"])
                    }
                    className="rounded-full border border-border bg-bg px-2 py-1 text-muted"
                  >
                    <option value="todo">대기</option>
                    <option value="doing">진행중</option>
                    <option value="done">완료</option>
                  </select>
                  <button
                    onClick={() => remove(t.id)}
                    className="ml-auto text-danger"
                  >
                    삭제
                  </button>
                </div>
                {t.due_date && (
                  <p className="mt-1 text-[11px] text-muted">
                    마감 {fmtDate(t.due_date)} · 담당 {nameOf(t.assignee)}
                  </p>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>

      {showAdd && (
        <AddTaskSheet
          members={members}
          onCancel={() => setShowAdd(false)}
          onSubmit={addTask}
        />
      )}
    </main>
  );
}

function FilterTabs({
  value,
  onChange,
}: {
  value: Filter;
  onChange: (f: Filter) => void;
}) {
  const items: { key: Filter; label: string }[] = [
    { key: "open", label: "남은 일" },
    { key: "mine", label: "내 일" },
    { key: "done", label: "완료" },
    { key: "all", label: "전체" },
  ];
  return (
    <div className="flex rounded-xl border border-border bg-surface p-1 text-xs">
      {items.map((it) => (
        <button
          key={it.key}
          onClick={() => onChange(it.key)}
          className={`px-3 py-1.5 rounded-lg ${
            value === it.key ? "bg-accent text-white" : "text-muted"
          }`}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}

function AddTaskSheet({
  members,
  onCancel,
  onSubmit,
}: {
  members: WorkspaceMember[];
  onCancel: () => void;
  onSubmit: (p: {
    title: string;
    detail: string | null;
    assignee: string | null;
    due_date: string | null;
  }) => void;
}) {
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [assignee, setAssignee] = useState<string | "">("");
  const [due, setDue] = useState("");

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/60">
      <div className="pb-safe w-full max-w-2xl rounded-t-2xl border-t border-border bg-surface p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-semibold">새 할일</h3>
          <button onClick={onCancel} className="text-sm text-muted">
            취소
          </button>
        </div>
        <input
          autoFocus
          placeholder="무엇을 해야 하나요?"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="mb-2 w-full rounded-xl border border-border bg-bg px-3 py-3 text-base outline-none placeholder:text-muted"
        />
        <textarea
          placeholder="추가 메모 (선택)"
          value={detail}
          onChange={(e) => setDetail(e.target.value)}
          rows={3}
          className="mb-2 w-full resize-none rounded-xl border border-border bg-bg px-3 py-2 text-sm outline-none placeholder:text-muted"
        />
        <div className="mb-3 grid grid-cols-2 gap-2">
          <select
            value={assignee}
            onChange={(e) => setAssignee(e.target.value)}
            className="rounded-xl border border-border bg-bg px-3 py-2 text-sm"
          >
            <option value="">담당 미정</option>
            {members.map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {m.display_name ?? "동료"}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={due}
            onChange={(e) => setDue(e.target.value)}
            className="rounded-xl border border-border bg-bg px-3 py-2 text-sm"
          />
        </div>
        <button
          disabled={!title.trim()}
          onClick={() =>
            onSubmit({
              title: title.trim(),
              detail: detail.trim() || null,
              assignee: assignee || null,
              due_date: due || null,
            })
          }
          className="w-full rounded-xl bg-accent px-4 py-3 text-base font-medium disabled:opacity-50"
        >
          추가하기
        </button>
      </div>
    </div>
  );
}
