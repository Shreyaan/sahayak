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
    <form className="auth-form" onSubmit={submit}>
      <label htmlFor="sign-in-email">Email</label>
      <input id="sign-in-email" name="email" type="email" autoComplete="email" required />
      <label htmlFor="sign-in-password">Password</label>
      <input id="sign-in-password" name="password" type="password" autoComplete="current-password" minLength={8} required />
      {error ? <p className="admin-error" role="alert">{error}</p> : null}
      <button className="primary-action" type="submit" disabled={pending}>{pending ? "Signing in…" : "Sign in"}</button>
    </form>
  );
}
