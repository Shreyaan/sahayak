import Link from "next/link";
import { SignInForm } from "./sign-in-form";

export default async function AdminSignInPage({ searchParams }: {
  searchParams: Promise<{ next?: string }>;
}) {
  const requested = (await searchParams).next;
  const nextPath = requested?.startsWith("/") && !requested.startsWith("//") ? requested : "/admin/access";

  return (
    <main className="admin-shell">
      <Link className="brand admin-brand" href="/">Sahayak <span>सहायक</span></Link>
      <section className="auth-card">
        <p className="eyebrow">Invited reviewers only</p>
        <h1>Sign in to Sahayak</h1>
        <p>Use your verified expert or administrator account.</p>
        <SignInForm nextPath={nextPath} />
      </section>
    </main>
  );
}
