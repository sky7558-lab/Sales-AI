"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fmtDateTime } from "@/lib/dates";
import type { WorkspaceMember } from "@/lib/workspace";

export type Note = {
  id: string;
  author: string;
  title: string | null;
  body: string;
  pinned: boolean;
  created_at: string;
};

export function NotesClient({
  workspaceId,
  userId,
  members,
  initial,
}: {
  workspaceId: string;
  userId: string;
  members: WorkspaceMember[];
  initial: Note[];
}) {
  const supabase = createClient();
  const [notes, setNotes] = useState(initial);
  const [showAdd, setShowAdd] = useState(false);

  function nameOf(uid: string) {
    return (
      members.find((m) => m.user_id === uid)?.display_name ??
      (uid === userId ? "나" : "동료")
    );
  }

  async function addNote(payload: { title: string | null; body: string }) {
    const { data, error } = await supabase
      .from("notes")
      .insert({
        workspace_id: workspaceId,
        author: userId,
        ...payload,
      })
      .select("id, author, title, body, pinned, created_at")
      .single();
    if (error || !data) return;
    setNotes((ns) => [data as Note, ...ns]);
    setShowAdd(false);
  }

  async function togglePin(n: Note) {
    const prev = notes;
    setNotes((ns) =>
      ns.map((x) => (x.id === n.id ? { ...x, pinned: !n.pinned } : x)),
    );
    const { error } = await supabase
      .from("notes")
      .update({ pinned: !n.pinned })
      .eq("id", n.id);
    if (error) setNotes(prev);
  }

  async function remove(n: Note) {
    if (!confirm("이 메모를 지울까요?")) return;
    const prev = notes;
    setNotes((ns) => ns.filter((x) => x.id !== n.id));
    const { error } = await supabase.from("notes").delete().eq("id", n.id);
    if (error) setNotes(prev);
  }

  return (
    <main className="space-y-3 p-4">
      <div className="flex justify-end">
        <button
          onClick={() => setShowAdd(true)}
          className="rounded-xl bg-accent px-3 py-2 text-sm font-medium"
        >
          + 새 메모
        </button>
      </div>

      {notes.length === 0 ? (
        <p className="rounded-2xl border border-border bg-surface p-6 text-center text-sm text-muted">
          첫 메모를 남겨보세요.
        </p>
      ) : (
        <ul className="space-y-2">
          {notes.map((n) => (
            <li
              key={n.id}
              className={`rounded-2xl border p-3 ${
                n.pinned
                  ? "border-accent/40 bg-accent/5"
                  : "border-border bg-surface"
              }`}
            >
              <div className="mb-1 flex items-start justify-between gap-2">
                <h3 className="text-sm font-semibold">
                  {n.title ?? "(제목 없음)"}
                </h3>
                <div className="flex shrink-0 gap-2 text-[11px]">
                  <button
                    onClick={() => togglePin(n)}
                    className={n.pinned ? "text-accent" : "text-muted"}
                  >
                    {n.pinned ? "📌" : "고정"}
                  </button>
                  {n.author === userId && (
                    <button
                      onClick={() => remove(n)}
                      className="text-danger"
                    >
                      삭제
                    </button>
                  )}
                </div>
              </div>
              <p className="whitespace-pre-wrap text-sm leading-snug text-white/90">
                {n.body}
              </p>
              <p className="mt-2 text-[11px] text-muted">
                {nameOf(n.author)} · {fmtDateTime(n.created_at)}
              </p>
            </li>
          ))}
        </ul>
      )}

      {showAdd && (
        <AddNoteSheet
          onCancel={() => setShowAdd(false)}
          onSubmit={addNote}
        />
      )}
    </main>
  );
}

function AddNoteSheet({
  onCancel,
  onSubmit,
}: {
  onCancel: () => void;
  onSubmit: (p: { title: string | null; body: string }) => void;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/60">
      <div className="pb-safe w-full max-w-2xl rounded-t-2xl border-t border-border bg-surface p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-semibold">새 메모</h3>
          <button onClick={onCancel} className="text-sm text-muted">
            취소
          </button>
        </div>
        <input
          autoFocus
          placeholder="제목 (선택)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="mb-2 w-full rounded-xl border border-border bg-bg px-3 py-3 text-base outline-none placeholder:text-muted"
        />
        <textarea
          placeholder="내용을 적어주세요"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={6}
          className="mb-3 w-full resize-none rounded-xl border border-border bg-bg px-3 py-2 text-sm outline-none placeholder:text-muted"
        />
        <button
          disabled={!body.trim()}
          onClick={() =>
            onSubmit({
              title: title.trim() || null,
              body: body.trim(),
            })
          }
          className="w-full rounded-xl bg-accent px-4 py-3 text-base font-medium disabled:opacity-50"
        >
          저장하기
        </button>
      </div>
    </div>
  );
}
