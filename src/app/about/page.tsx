import type { Metadata } from "next";
import Link from "next/link";
import { getLocale } from "@/i18n/locale-cookie";
import { LanguageSwitcher } from "../language-switcher";
import { aboutContent } from "./content";

export const metadata: Metadata = {
  title: "About Sahayak — Know your next step",
  description: "How Sahayak helps you prepare, recover from setbacks and keep evidence when public-service work gets stuck.",
};

const label = "text-xs font-bold uppercase tracking-[.16em] text-[var(--green)]";
const action = "inline-flex min-h-12 items-center justify-center rounded-xl bg-[var(--green)] px-5 py-3 font-bold text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--green)]";

export default async function AboutPage() {
  const text = aboutContent[await getLocale()];
  return (
    <div className="mx-auto max-w-5xl px-5 sm:px-8">
      <header className="flex items-center justify-between gap-3 border-b border-[var(--line)] py-5">
        <Link href="/" className="text-2xl font-bold tracking-tight text-[var(--ink)]">Sahayak</Link>
        <LanguageSwitcher />
      </header>
      <main id="about" className="py-12 sm:py-20">
        <section aria-labelledby="about-title" className="max-w-3xl">
          <p className={label}>{text.label}</p>
          <h1 id="about-title" className="mt-5 whitespace-pre-line text-4xl font-bold leading-[1.12] tracking-tight text-[var(--ink)] sm:text-6xl">{text.title}</h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-[#536059]">{text.intro}</p>
          <aside className="mt-5 max-w-2xl border-l-2 border-[var(--green)] pl-4">
            <p className="font-semibold text-[var(--green)]">{text.hostingTitle}</p>
            <p className="mt-1 text-sm leading-relaxed text-[#536059]">{text.hostingBody}</p>
          </aside>
          <Link href="/" className={`${action} mt-7`}>{text.try} <span aria-hidden="true" className="ml-3">→</span></Link>
        </section>

        <section className="my-14 grid gap-5 border-y border-[var(--line)] py-8 sm:my-20 sm:grid-cols-[1fr_1.4fr] sm:gap-12">
          <h2 className="text-2xl font-semibold leading-snug">{text.problem}</h2>
          <div className="space-y-4 text-base leading-relaxed text-[#536059]">
            <p>{text.problemBody}</p>
            <p className="font-semibold text-[var(--green)]">{text.principle}</p>
          </div>
        </section>

        <section aria-labelledby="example-title" className="grid gap-8 md:grid-cols-[.9fr_1.1fr] md:gap-14">
          <div>
            <p className={label}>{text.example}</p>
            <h2 id="example-title" className="mt-4 text-3xl font-semibold leading-snug tracking-tight">{text.exampleTitle}</h2>
          </div>
          <ol className="border-l border-[var(--line)] pl-6">
            {text.steps.map((step, index) => <li key={step.title} className="relative pb-7 last:pb-0">
              <span aria-hidden="true" className="absolute -left-[39px] flex size-7 items-center justify-center rounded-full bg-[var(--green)] text-xs font-bold text-white">{index + 1}</span>
              <h3 className="text-lg font-semibold leading-snug">{step.title}</h3>
              <p className="mt-2 text-base leading-relaxed text-[#536059]">{step.body}</p>
            </li>)}
          </ol>
        </section>

        <section className="mt-14 border-t border-[var(--line)] pt-10 sm:mt-20">
          <p className={label}>{text.trustLabel}</p>
          <h2 className="mt-4 max-w-2xl text-3xl font-semibold leading-tight tracking-tight">{text.trustTitle}</h2>
          <div className="mt-8 grid gap-7 md:grid-cols-3">
            {text.trustItems.map(item => <div key={item.title}>
              <h3 className="text-lg font-semibold">{item.title}</h3>
              <p className="mt-2 text-base leading-relaxed text-[#536059]">{item.body}</p>
            </div>)}
          </div>
        </section>

        <section className="mt-14 rounded-2xl border border-[var(--line)] bg-white/60 p-6 sm:mt-20 sm:p-8">
          <h2 className="text-2xl font-semibold">{text.reality}</h2>
          <div className="mt-6 grid gap-7 md:grid-cols-2 md:gap-12">
            {[{title: text.available, items: text.works}, {title: text.limits, items: text.boundaries}].map(group => <div key={group.title}>
              <h3 className="font-bold text-[var(--green)]">{group.title}</h3>
              <ul className="mt-3 list-disc space-y-3 pl-5 text-base leading-relaxed text-[#536059]">{group.items.map(item => <li key={item}>{item}</li>)}</ul>
            </div>)}
          </div>
          <p className="mt-7 border-t border-[var(--line)] pt-5 text-sm leading-relaxed text-[#536059]">{text.demo}</p>
        </section>

        <section className="mt-14 sm:mt-20">
          <h2 className="text-3xl font-semibold tracking-tight">{text.ending}</h2>
          <p className="mt-3 text-base leading-relaxed text-[#536059]">{text.endingBody}</p>
          <Link href="/" className={`${action} mt-6`}>{text.try} <span aria-hidden="true" className="ml-3">→</span></Link>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-[#536059]">{text.tryNote}</p>
        </section>
      </main>
      <footer className="flex flex-wrap items-center justify-between gap-4 border-t border-[var(--line)] py-6 text-sm text-[#536059]">
        <p>{text.footer}</p>
        <Link href="/" className="inline-flex min-h-11 items-center font-semibold text-[var(--green)] underline underline-offset-4">{text.back}</Link>
      </footer>
    </div>
  );
}
