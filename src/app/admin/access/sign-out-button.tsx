"use client";

import { authClient } from "@/lib/auth-client";

export function SignOutButton() {
  async function signOut() {
    await authClient.signOut();
    window.location.assign("/admin/sign-in");
  }

  return <button className="secondary-action" type="button" onClick={signOut}>Sign out</button>;
}
