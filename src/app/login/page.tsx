"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setError(null);
    const supabase = createClient();
    const { error: err } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (err) {
      setError(err.message);
      setStatus("error");
    } else {
      setStatus("sent");
    }
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <h1 className="mb-2 text-2xl font-semibold">로그인</h1>
        <p className="mb-6 text-sm text-muted">
          이메일로 매직 링크를 보내드릴게요. 링크를 누르면 바로 로그인됩니다.
        </p>
        <form onSubmit={onSubmit} className="space-y-3">
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
            disabled={status === "sending"}
            className="w-full rounded-xl bg-accent px-4 py-3 text-base font-medium text-white disabled:opacity-50"
          >
            {status === "sending" ? "전송 중..." : "로그인 링크 받기"}
          </button>
        </form>
        {status === "sent" && (
          <p className="mt-4 rounded-xl border border-ok/30 bg-ok/10 p-3 text-sm text-ok">
            메일함을 확인하세요. 받은 링크로 로그인됩니다.
          </p>
        )}
        {status === "error" && error && (
          <p className="mt-4 rounded-xl border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
            {error}
          </p>
        )}
      </div>
    </main>
  );
}
