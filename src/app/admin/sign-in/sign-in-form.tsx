"use client";

import { FormEvent, useState } from "react";
import { authClient } from "@/lib/auth-client";

export function SignInForm({ nextPath }: { nextPath: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(undefined);
    try {
      const data = new FormData(event.currentTarget);
      const result = await authClient.signIn.email({
        email: String(data.get("email") || ""),
        password: String(data.get("password") || ""),
        callbackURL: nextPath,
      });

      if (result.error) {
        setError(result.error.message || "Sign in failed. Check your details and verification email.");
        return;
      }
      window.location.assign(nextPath);
    } catch {
      setError("Sign in could not reach Sahayak. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="grid gap-2 mt-6" onSubmit={submit}>
      <label className="mt-2 text-[.82rem] font-extrabold" htmlFor="sign-in-email">Email</label>
      <input className="w-full min-h-12 px-3.5 py-3 rounded-xl border border-[var(--line)] bg-white text-[var(--ink)]" id="sign-in-email" name="email" type="email" autoComplete="email" required />
      <label className="mt-2 text-[.82rem] font-extrabold" htmlFor="sign-in-password">Password</label>
      <input className="w-full min-h-12 px-3.5 py-3 rounded-xl border border-[var(--line)] bg-white text-[var(--ink)]" id="sign-in-password" name="password" type="password" autoComplete="current-password" minLength={8} required />
      {error ? <p className="m-0 mt-2 font-extrabold text-[#8b2e24]" role="alert">{error}</p> : null}
      <button className="rounded-xl border-0 bg-[var(--marigold)] px-3.5 py-2.5 font-extrabold text-[#2f250f] disabled:cursor-not-allowed disabled:opacity-55 min-h-12 mt-3" type="submit" disabled={pending}>{pending ? "Signing in…" : "Sign in"}</button>
    </form>
  );
}
