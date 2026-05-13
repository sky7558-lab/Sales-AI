"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { WorkspaceMember } from "@/lib/workspace";

export function SettingsClient({
  workspaceId,
  workspaceName,
  userId,
  email,
  myDisplayName,
  members,
}: {
  workspaceId: string;
  workspaceName: string;
  userId: string;
  email: string | null;
  myDisplayName: string;
  members: WorkspaceMember[];
}) {
  const supabase = createClient();
  const [name, setName] = useState(myDisplayName);
  const [wsName, setWsName] = useState(workspaceName);
  const [joinId, setJoinId] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pw, setPw] = useState("");
  const [pwBusy, setPwBusy] = useState(false);

  async function setPassword() {
    if (pw.length < 6) {
      setMsg("비밀번호는 6자 이상이어야 합니다.");
      return;
    }
    setPwBusy(true);
    setMsg(null);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setPwBusy(false);
    if (error) {
      setMsg(`비밀번호 설정 실패: ${error.message}`);
    } else {
      setPw("");
      setMsg("비밀번호 설정 완료. 다음부터는 매직링크 없이 로그인 가능.");
    }
  }

  async function saveName() {
    setMsg(null);
    const { error } = await supabase
      .from("workspace_members")
      .update({ display_name: name.trim() || null })
      .eq("workspace_id", workspaceId)
      .eq("user_id", userId);
    setMsg(error ? `이름 저장 실패: ${error.message}` : "이름 저장 완료");
  }

  async function saveWorkspaceName() {
    setMsg(null);
    const { error } = await supabase
      .from("workspaces")
      .update({ name: wsName.trim() })
      .eq("id", workspaceId);
    setMsg(error ? `워크스페이스명 저장 실패: ${error.message}` : "워크스페이스명 저장 완료");
  }

  async function copyId() {
    try {
      await navigator.clipboard.writeText(workspaceId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  }

  async function joinWorkspace() {
    setMsg(null);
    const trimmed = joinId.trim();
    if (!trimmed) return;
    const { error } = await supabase.from("workspace_members").insert({
      workspace_id: trimmed,
      user_id: userId,
      display_name: name.trim() || null,
    });
    if (error) {
      setMsg(`참여 실패: ${error.message}`);
    } else {
      setMsg("참여 완료. 새로고침 합니다.");
      setTimeout(() => window.location.reload(), 800);
    }
  }

  return (
    <main className="space-y-3 p-4">
      <section className="rounded-2xl border border-border bg-surface p-4">
        <h3 className="mb-2 text-sm font-semibold">내 정보</h3>
        <p className="mb-2 text-xs text-muted">{email}</p>
        <label className="mb-1 block text-xs text-muted">
          표시 이름 (동업자에게 보임)
        </label>
        <div className="flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="flex-1 rounded-xl border border-border bg-bg px-3 py-2 text-sm outline-none"
          />
          <button
            onClick={saveName}
            className="rounded-xl bg-accent px-3 py-2 text-sm font-medium"
          >
            저장
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-surface p-4">
        <h3 className="mb-2 text-sm font-semibold">워크스페이스</h3>
        <label className="mb-1 block text-xs text-muted">이름</label>
        <div className="mb-3 flex gap-2">
          <input
            value={wsName}
            onChange={(e) => setWsName(e.target.value)}
            className="flex-1 rounded-xl border border-border bg-bg px-3 py-2 text-sm outline-none"
          />
          <button
            onClick={saveWorkspaceName}
            className="rounded-xl bg-accent px-3 py-2 text-sm font-medium"
          >
            저장
          </button>
        </div>
        <label className="mb-1 block text-xs text-muted">
          공유 ID (동업자에게 알려주세요)
        </label>
        <div className="flex gap-2">
          <code className="flex-1 truncate rounded-xl border border-border bg-bg px-3 py-2 text-xs">
            {workspaceId}
          </code>
          <button
            onClick={copyId}
            className="rounded-xl border border-border px-3 py-2 text-sm"
          >
            {copied ? "복사됨" : "복사"}
          </button>
        </div>
        <p className="mt-3 text-xs text-muted">
          멤버 ({members.length}명)
        </p>
        <ul className="mt-1 space-y-1 text-sm">
          {members.map((m) => (
            <li key={m.user_id}>
              · {m.display_name ?? "동료"}
              {m.user_id === userId ? " (나)" : ""}
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-2xl border border-border bg-surface p-4">
        <h3 className="mb-2 text-sm font-semibold">비밀번호 설정</h3>
        <p className="mb-2 text-xs text-muted">
          설정해두면 다른 기기에서도 매직링크 없이 바로 로그인 가능.
        </p>
        <div className="flex gap-2">
          <input
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            placeholder="새 비밀번호 (6자 이상)"
            className="flex-1 rounded-xl border border-border bg-bg px-3 py-2 text-sm outline-none"
          />
          <button
            onClick={setPassword}
            disabled={pwBusy}
            className="rounded-xl bg-accent px-3 py-2 text-sm font-medium disabled:opacity-50"
          >
            {pwBusy ? "..." : "저장"}
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-surface p-4">
        <h3 className="mb-2 text-sm font-semibold">
          기존 워크스페이스에 참여
        </h3>
        <p className="mb-2 text-xs text-muted">
          동업자가 만든 워크스페이스 ID를 받아 입력하세요.
        </p>
        <div className="flex gap-2">
          <input
            value={joinId}
            onChange={(e) => setJoinId(e.target.value)}
            placeholder="워크스페이스 ID"
            className="flex-1 rounded-xl border border-border bg-bg px-3 py-2 text-sm outline-none"
          />
          <button
            onClick={joinWorkspace}
            className="rounded-xl bg-accent px-3 py-2 text-sm font-medium"
          >
            참여
          </button>
        </div>
      </section>

      {msg && (
        <p className="rounded-xl border border-border bg-surface p-3 text-sm text-muted">
          {msg}
        </p>
      )}

      <form action="/auth/signout" method="post">
        <button
          type="submit"
          className="w-full rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm font-medium text-danger"
        >
          로그아웃
        </button>
      </form>
    </main>
  );
}
