import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "@/i18n/locale-cookie";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sahayak",
  description: "Sarkari kaam, ek baat-cheet.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();

  return (
    <html lang={locale}>
      <body>
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
