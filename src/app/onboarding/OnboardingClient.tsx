"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function OnboardingClient({
  userId,
  defaultName,
}: {
  userId: string;
  defaultName: string;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [mode, setMode] = useState<"create" | "join">("create");
  const [wsName, setWsName] = useState("우리 프로젝트");
  const [name, setName] = useState(defaultName);
  const [joinId, setJoinId] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function createWorkspace() {
    setBusy(true);
    setErr(null);
    const { error } = await supabase.rpc("create_workspace_with_owner", {
      ws_name: wsName.trim() || "우리 프로젝트",
      member_name: name.trim() || null,
    });
    if (error) {
      setErr(error.message);
      setBusy(false);
      return;
    }
    router.replace("/");
    router.refresh();
  }

  async function joinWorkspace() {
    setBusy(true);
    setErr(null);
    const { error } = await supabase.from("workspace_members").insert({
      workspace_id: joinId.trim(),
      user_id: userId,
      display_name: name.trim() || null,
    });
    setBusy(false);
    if (error) {
      setErr(`참여 실패: ${error.message}`);
      return;
    }
    router.replace("/");
    router.refresh();
  }

  return (
    <main className="mx-auto max-w-md px-5 pt-12">
      <h1 className="mb-2 text-2xl font-semibold">시작하기</h1>
      <p className="mb-6 text-sm text-muted">
        새로 만들거나, 동업자가 알려준 ID로 참여하세요.
      </p>

      <div className="mb-5 flex rounded-xl border border-border bg-surface p-1 text-sm">
        <button
          onClick={() => setMode("create")}
          className={`flex-1 rounded-lg py-2 ${
            mode === "create" ? "bg-accent text-white" : "text-muted"
          }`}
        >
          새로 만들기
        </button>
        <button
          onClick={() => setMode("join")}
          className={`flex-1 rounded-lg py-2 ${
            mode === "join" ? "bg-accent text-white" : "text-muted"
          }`}
        >
          ID로 참여
        </button>
      </div>

      <label className="mb-1 block text-xs text-muted">
        내 표시 이름 (동업자에게 보임)
      </label>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="mb-4 w-full rounded-xl border border-border bg-surface px-3 py-3 text-base outline-none"
      />

      {mode === "create" ? (
        <>
          <label className="mb-1 block text-xs text-muted">
            워크스페이스 이름
          </label>
          <input
            value={wsName}
            onChange={(e) => setWsName(e.target.value)}
            className="mb-4 w-full rounded-xl border border-border bg-surface px-3 py-3 text-base outline-none"
          />
          <button
            onClick={createWorkspace}
            disabled={busy}
            className="w-full rounded-xl bg-accent px-4 py-3 text-base font-medium disabled:opacity-50"
          >
            {busy ? "생성 중..." : "만들기"}
          </button>
          <p className="mt-3 text-xs text-muted">
            만든 후, 설정 화면에서 공유 ID를 동업자에게 보내세요.
          </p>
        </>
      ) : (
        <>
          <label className="mb-1 block text-xs text-muted">
            워크스페이스 ID
          </label>
          <input
            value={joinId}
            onChange={(e) => setJoinId(e.target.value)}
            placeholder="UUID 형식"
            className="mb-4 w-full rounded-xl border border-border bg-surface px-3 py-3 text-base outline-none"
          />
          <button
            onClick={joinWorkspace}
            disabled={busy || !joinId.trim()}
            className="w-full rounded-xl bg-accent px-4 py-3 text-base font-medium disabled:opacity-50"
          >
            {busy ? "참여 중..." : "참여하기"}
          </button>
        </>
      )}

      {err && (
        <p className="mt-4 rounded-xl border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
          {err}
        </p>
      )}
    </main>
  );
}
