"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { REVIEW_ORG_ID } from "@/lib/auth/config";

export function InviteAcceptance({ invitationId, signedIn }: { invitationId: string; signedIn: boolean }) {
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  const [verificationEmail, setVerificationEmail] = useState<string>();

  async function sendVerification(email: string) {
    const result = await authClient.sendVerificationEmail({
      email,
      callbackURL: `/invite/${encodeURIComponent(invitationId)}`,
    });
    if (result.error) throw new Error(result.error.message || "Verification email could not be sent.");
    setMessage("Check your email to verify your account, then return to this invitation.");
  }

  async function accept() {
    setPending(true);
    setError(undefined);
    try {
      const result = await authClient.organization.acceptInvitation({ invitationId });
      if (result.error) {
        setError(result.error.message || "This invitation could not be accepted.");
        return;
      }
      const active = await authClient.organization.setActive({ organizationId: REVIEW_ORG_ID });
      if (active.error) throw new Error(active.error.message);
      setMessage("Invitation accepted. Your expert access is active.");
    } catch {
      setError("This invitation could not be accepted. Please try again.");
    } finally {
      setPending(false);
    }
  }

  async function createAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(undefined);
    const data = new FormData(event.currentTarget);
    const email = String(data.get("email") || "");
    let accountCreated = false;
    try {
      const result = await authClient.signUp.email({
        name: String(data.get("name") || ""),
        email,
        password: String(data.get("password") || ""),
        callbackURL: `/invite/${encodeURIComponent(invitationId)}`,
      });
      if (result.error) {
        setError(result.error.message || "Account creation failed.");
        return;
      }
      accountCreated = true;
      setVerificationEmail(email);
      await sendVerification(email);
    } catch {
      setError(accountCreated
        ? "Your account was created, but the verification email could not be sent. Try again below."
        : "Account creation could not reach Sahayak. Please try again.");
    } finally {
      setPending(false);
    }
  }

  async function retryVerification() {
    if (!verificationEmail) return;
    setPending(true);
    setError(undefined);
    try {
      await sendVerification(verificationEmail);
    } catch {
      setError("Verification email could not be sent. Please try again.");
    } finally {
      setPending(false);
    }
  }

  if (message) return <p className="mt-6 p-3.5 rounded-xl bg-[#e8f4ee] text-[var(--green)] font-extrabold" role="status">{message}</p>;

  if (verificationEmail) return (
    <div className="grid gap-3 mt-6">
      {error ? <p className="m-0 mt-2 font-extrabold text-[#8b2e24]" role="alert">{error}</p> : null}
      <button className="rounded-xl border-0 bg-[#eee5d8] px-3.5 py-2.5 font-extrabold text-[var(--green)] min-h-12" type="button" onClick={retryVerification} disabled={pending}>
        {pending ? "Sending…" : "Send verification email again"}
      </button>
    </div>
  );

  return signedIn ? (
    <div className="grid gap-3 mt-6">
      <button className="rounded-xl border-0 bg-[var(--marigold)] px-3.5 py-2.5 font-extrabold text-[#2f250f] disabled:cursor-not-allowed disabled:opacity-55 min-h-12" type="button" onClick={accept} disabled={pending}>
        {pending ? "Accepting…" : "Accept expert invitation"}
      </button>
      {error ? <p className="m-0 mt-2 font-extrabold text-[#8b2e24]" role="alert">{error}</p> : null}
    </div>
  ) : (
    <>
      <form className="grid gap-2 mt-6" onSubmit={createAccount}>
        <label className="mt-2 text-[.82rem] font-extrabold" htmlFor="invite-name">Name</label>
        <input className="w-full min-h-12 px-3.5 py-3 rounded-xl border border-[var(--line)] bg-white text-[var(--ink)]" id="invite-name" name="name" autoComplete="name" required />
        <label className="mt-2 text-[.82rem] font-extrabold" htmlFor="invite-email">Invited email</label>
        <input className="w-full min-h-12 px-3.5 py-3 rounded-xl border border-[var(--line)] bg-white text-[var(--ink)]" id="invite-email" name="email" type="email" autoComplete="email" required />
        <label className="mt-2 text-[.82rem] font-extrabold" htmlFor="invite-password">Create password</label>
        <input className="w-full min-h-12 px-3.5 py-3 rounded-xl border border-[var(--line)] bg-white text-[var(--ink)]" id="invite-password" name="password" type="password" autoComplete="new-password" minLength={8} required />
        {error ? <p className="m-0 mt-2 font-extrabold text-[#8b2e24]" role="alert">{error}</p> : null}
        <button className="rounded-xl border-0 bg-[var(--marigold)] px-3.5 py-2.5 font-extrabold text-[#2f250f] disabled:cursor-not-allowed disabled:opacity-55 min-h-12 mt-3" type="submit" disabled={pending}>{pending ? "Creating…" : "Create expert account"}</button>
      </form>
      <p className="mt-5 text-[.85rem]">Already have an account? <Link className="text-[var(--green)] font-extrabold" href={`/admin/sign-in?next=/invite/${encodeURIComponent(invitationId)}`}>Sign in</Link></p>
    </>
  );
}
