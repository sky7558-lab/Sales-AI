"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Mode = "password" | "magic";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    const supabase = createClient();
    const { error: err } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    router.replace("/");
    router.refresh();
  }

  async function signUp() {
    if (!email || password.length < 6) {
      setError("이메일과 6자 이상 비밀번호를 입력하세요.");
      return;
    }
    setBusy(true);
    setError(null);
    setInfo(null);
    const supabase = createClient();
    const { data, error: err } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    if (data.session) {
      router.replace("/");
      router.refresh();
      return;
    }
    setInfo("가입했습니다. 메일함의 확인 링크를 누르면 로그인됩니다.");
  }

  async function sendMagic(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    const supabase = createClient();
    const { error: err } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    setInfo("메일함을 확인하세요. 받은 링크로 로그인됩니다.");
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <h1 className="mb-2 text-2xl font-semibold">로그인</h1>
        <p className="mb-5 text-sm text-muted">
          이메일과 비밀번호로 로그인하세요. 처음이면 가입부터.
        </p>

        <div className="mb-5 flex rounded-xl border border-border bg-surface p-1 text-sm">
          <button
            type="button"
            onClick={() => {
              setMode("password");
              setInfo(null);
              setError(null);
            }}
            className={`flex-1 rounded-lg py-2 ${
              mode === "password" ? "bg-accent text-white" : "text-muted"
            }`}
          >
            비밀번호
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("magic");
              setInfo(null);
              setError(null);
            }}
            className={`flex-1 rounded-lg py-2 ${
              mode === "magic" ? "bg-accent text-white" : "text-muted"
            }`}
          >
            매직 링크
          </button>
        </div>

        {mode === "password" ? (
          <form onSubmit={signIn} className="space-y-3">
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              required
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-base outline-none placeholder:text-muted focus:border-accent"
            />
            <input
              type="password"
              autoComplete="current-password"
              required
              minLength={6}
              placeholder="비밀번호 (6자 이상)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-base outline-none placeholder:text-muted focus:border-accent"
            />
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-xl bg-accent px-4 py-3 text-base font-medium text-white disabled:opacity-50"
            >
              {busy ? "로그인 중..." : "로그인"}
            </button>
            <button
              type="button"
              onClick={signUp}
              disabled={busy}
              className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-base font-medium disabled:opacity-50"
            >
              처음이면 가입
            </button>
          </form>
        ) : (
          <form onSubmit={sendMagic} className="space-y-3">
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              required
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-base outline-none placeholder:text-muted focus:border-accent"
            />
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-xl bg-accent px-4 py-3 text-base font-medium text-white disabled:opacity-50"
            >
              {busy ? "전송 중..." : "로그인 링크 받기"}
            </button>
            <p className="text-xs text-muted">
              무료 플랜은 시간당 메일 발송 한도가 있어요. 평소엔 비밀번호 쪽이
              빠릅니다.
            </p>
          </form>
        )}

        {info && (
          <p className="mt-4 rounded-xl border border-ok/30 bg-ok/10 p-3 text-sm text-ok">
            {info}
          </p>
        )}
        {error && (
          <p className="mt-4 rounded-xl border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
            {error}
          </p>
        )}
      </div>
    </main>
  );
}
