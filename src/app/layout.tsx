import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { getLocale } from "@/i18n/locale-cookie";
import { Providers } from "./providers";
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
        <NextIntlClientProvider>
          <NuqsAdapter>
            <Providers>{children}</Providers>
          </NuqsAdapter>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
