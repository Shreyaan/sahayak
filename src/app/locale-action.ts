"use server";

import { revalidatePath } from "next/cache";
import { setLocale } from "@/i18n/locale-cookie";
import type { Locale } from "@/lib/locale";

export async function changeLocale(locale: Locale): Promise<void> {
  await setLocale(locale);
  revalidatePath("/", "layout");
}
