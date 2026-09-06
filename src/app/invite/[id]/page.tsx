import { headers } from "next/headers";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { InviteAcceptance } from "./invite-acceptance";

export default async function InvitePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth.api.getSession({ headers: new Headers(await headers()) });

  return (
    <main className="mx-auto min-h-screen w-full max-w-[620px] px-[18px] pt-[18px] pb-[92px] min-[760px]:pt-[30px]">
      <Link className="text-[1.3rem] font-extrabold inline-block text-[var(--ink)] no-underline" href="/">Sahayak <span className="ml-1.5 text-[.85rem] text-[var(--green)]">सहायक</span></Link>
      <section className="mt-[42px] rounded-[22px] border border-[var(--line)] bg-white/70 p-[clamp(20px,6vw,36px)] shadow-[0_14px_40px_rgba(52,43,27,.07)]">
        <p className="m-0 text-[.72rem] font-extrabold uppercase tracking-[.12em] text-[var(--green)]">Sahayak Review Network</p>
        <h1 className="my-2 text-[clamp(2rem,7vw,3rem)] leading-[1.05] tracking-[-.04em]">Join as an expert</h1>
        <p className="leading-[1.5] text-[#536059]">Review community-submitted government-process guidance in the protected workspace.</p>
        <InviteAcceptance invitationId={id} signedIn={Boolean(session)} />
      </section>
    </main>
  );
}
