import Link from "next/link";
import { SignInForm } from "./sign-in-form";

export default async function AdminSignInPage({ searchParams }: {
  searchParams: Promise<{ next?: string }>;
}) {
  const requested = (await searchParams).next;
  const nextPath = requested?.startsWith("/") && !requested.startsWith("//") ? requested : "/admin/access";

  return (
    <main className="mx-auto min-h-screen w-full max-w-[620px] px-[18px] pt-[18px] pb-[92px] min-[760px]:pt-[30px]">
      <Link className="text-[1.3rem] font-extrabold inline-block text-[var(--ink)] no-underline" href="/">Sahayak <span className="ml-1.5 text-[.85rem] text-[var(--green)]">सहायक</span></Link>
      <section className="mt-[42px] rounded-[22px] border border-[var(--line)] bg-white/70 p-[clamp(20px,6vw,36px)] shadow-[0_14px_40px_rgba(52,43,27,.07)]">
        <p className="m-0 text-[.72rem] font-extrabold uppercase tracking-[.12em] text-[var(--green)]">Invited reviewers only</p>
        <h1 className="my-2 text-[clamp(2rem,7vw,3rem)] leading-[1.05] tracking-[-.04em]">Sign in to Sahayak</h1>
        <p className="leading-[1.5] text-[#536059]">Use your verified expert or administrator account.</p>
        <SignInForm nextPath={nextPath} />
      </section>
    </main>
  );
}
