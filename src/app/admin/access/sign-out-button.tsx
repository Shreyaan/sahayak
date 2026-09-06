"use client";

import { authClient } from "@/lib/auth-client";

export function SignOutButton() {
  async function signOut() {
    await authClient.signOut();
    window.location.assign("/admin/sign-in");
  }

  return <button className="rounded-xl border-0 bg-[#eee5d8] px-3.5 py-2.5 font-extrabold text-[var(--green)]" type="button" onClick={signOut}>Sign out</button>;
}
