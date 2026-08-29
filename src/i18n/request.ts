import { getRequestConfig } from "next-intl/server";
import { getLocale } from "./locale-cookie";

/** One file per area, so separate parts of the UI never collide in one blob. */
const namespaces = ["common", "citizen", "pages"] as const;

export default getRequestConfig(async () => {
  const locale = await getLocale();

  const loaded = await Promise.all(
    namespaces.map(async (namespace) => [
      namespace,
      (await import(`../../messages/${locale}/${namespace}.json`)).default,
    ] as const),
  );

  return { locale, messages: Object.fromEntries(loaded) };
});
