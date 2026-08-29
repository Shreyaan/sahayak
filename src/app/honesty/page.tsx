import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { t as translate, type Locale } from "@/lib/locale";
import { sharedStepTypes, workflowIds, workflows } from "@/lib/workflow";
import { LanguageSwitcher } from "../language-switcher";
import styles from "./honesty.module.css";

/** Message keys under `honesty.<group>.items`, in the order they are shown. */
const realKeys = [
  "conversation",
  "engine",
  "speechToText",
  "textToSpeech",
  "artifacts",
  "contributions",
] as const;

const simulatedKeys = [
  "desks",
  "bankEpfo",
  "payments",
  "submission",
  "rejection",
  "sla",
  "data",
] as const;

const limitKeys = [
  "integration",
  "credentials",
  "payments",
  "personalData",
  "escalation",
  "rti",
] as const;

type Item = { key: string; label: string; detail: string; code?: string };

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("pages");
  return { title: t("honesty.metaTitle") };
}

function ItemList({ items }: { items: Item[] }) {
  return (
    <ul className={styles.list}>
      {items.map((item) => (
        <li key={item.key}>
          <strong>{item.label}</strong>
          <span>{item.detail}</span>
          {item.code && <code className={styles.code}>{item.code}</code>}
        </li>
      ))}
    </ul>
  );
}

export default async function HonestyPage() {
  const t = await getTranslations("pages");
  const common = await getTranslations("common");
  const locale = (await getLocale()) as Locale;

  /** Reads one labelled list out of the `pages` messages. */
  const list = (group: string, keys: readonly string[]): Item[] =>
    keys.map((key) => ({
      key,
      label: t(`honesty.${group}.items.${key}.label`),
      detail: t(`honesty.${group}.items.${key}.detail`),
    }));

  const shared: Item[] = sharedStepTypes().map((type) => ({
    key: type,
    label: t(`honesty.stepTypes.${type}.label`),
    detail: t(`honesty.stepTypes.${type}.detail`),
    code: type,
  }));

  const journeys = workflowIds
    .map((id) => `${translate(workflows[id].title, locale)} (${translate(workflows[id].subtitle, locale)})`)
    .join(" · ");

  return (
    <main className={styles.page}>
      <div className={styles.topBar}>
        <p className={styles.eyebrow}>{t("honesty.eyebrow")}</p>
        <LanguageSwitcher />
      </div>
      <h1 className={styles.title}>{t("honesty.title")}</h1>
      <p className={styles.lede}>{t("honesty.lede")}</p>

      <section className={`${styles.panel} ${styles.realPanel}`}>
        <h2>
          {t("honesty.real.title")}
          <span>{t("honesty.real.subtitle")}</span>
        </h2>
        <ItemList items={list("real", realKeys)} />
      </section>

      <section className={`${styles.panel} ${styles.simulatedPanel}`}>
        <h2>
          {t("honesty.simulated.title")}
          <span>{t("honesty.simulated.subtitle")}</span>
        </h2>
        <ItemList items={list("simulated", simulatedKeys)} />
        <p className={styles.warning}>{t("honesty.simulated.warning")}</p>
      </section>

      <section className={styles.panel}>
        <h2>
          {t("honesty.limits.title")}
          <span>{t("honesty.limits.subtitle")}</span>
        </h2>
        <ItemList items={list("limits", limitKeys)} />
      </section>

      <section className={styles.panel}>
        <h2>
          {t("honesty.composition.title")}
          <span>{t("honesty.composition.subtitle")}</span>
        </h2>
        <p className={styles.journeys}>{journeys}</p>
        <ItemList items={shared} />
        <p className={styles.note}>{t("honesty.composition.note")}</p>
      </section>

      <nav className={styles.links}>
        <a href="/">{t("honesty.links.home")}</a>
        <a href="/case-card?workflow=bereavement">{t("honesty.links.caseCard")}</a>
      </nav>

      <footer className={styles.footer}>
        <p>{t("synthetic")}</p>
        <p>{common("disclaimer")}</p>
      </footer>
    </main>
  );
}
