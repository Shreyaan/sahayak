"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { usePathname } from "next/navigation";

export function Providers({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  useEffect(() => {
    // Every new page starts at its header, even when Next preserves its layout.
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [pathname]);
  const [queryClient] = useState(() => new QueryClient());
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

