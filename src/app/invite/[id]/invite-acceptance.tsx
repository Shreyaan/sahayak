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

  if (message) return <p className="invite-success" role="status">{message}</p>;

  if (verificationEmail) return (
    <div className="invite-actions">
      {error ? <p className="admin-error" role="alert">{error}</p> : null}
      <button className="secondary-action" type="button" onClick={retryVerification} disabled={pending}>
        {pending ? "Sending…" : "Send verification email again"}
      </button>
    </div>
  );

  return signedIn ? (
    <div className="invite-actions">
      <button className="primary-action" type="button" onClick={accept} disabled={pending}>
        {pending ? "Accepting…" : "Accept expert invitation"}
      </button>
      {error ? <p className="admin-error" role="alert">{error}</p> : null}
    </div>
  ) : (
    <>
      <form className="auth-form" onSubmit={createAccount}>
        <label htmlFor="invite-name">Name</label>
        <input id="invite-name" name="name" autoComplete="name" required />
        <label htmlFor="invite-email">Invited email</label>
        <input id="invite-email" name="email" type="email" autoComplete="email" required />
        <label htmlFor="invite-password">Create password</label>
        <input id="invite-password" name="password" type="password" autoComplete="new-password" minLength={8} required />
        {error ? <p className="admin-error" role="alert">{error}</p> : null}
        <button className="primary-action" type="submit" disabled={pending}>{pending ? "Creating…" : "Create expert account"}</button>
      </form>
      <p className="auth-alternate">Already have an account? <Link href={`/admin/sign-in?next=/invite/${encodeURIComponent(invitationId)}`}>Sign in</Link></p>
    </>
  );
}
