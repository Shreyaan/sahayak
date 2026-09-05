import { headers } from "next/headers";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { InviteAcceptance } from "./invite-acceptance";

export default async function InvitePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth.api.getSession({ headers: new Headers(await headers()) });

  return (
    <main className="admin-shell">
      <Link className="brand admin-brand" href="/">Sahayak <span>सहायक</span></Link>
      <section className="auth-card">
        <p className="eyebrow">Sahayak Review Network</p>
        <h1>Join as an expert</h1>
        <p>Review community-submitted government-process guidance in the protected workspace.</p>
        <InviteAcceptance invitationId={id} signedIn={Boolean(session)} />
      </section>
    </main>
  );
}
