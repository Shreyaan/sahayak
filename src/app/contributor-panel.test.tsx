import { afterEach, describe, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import messages from "../../messages/en/citizen.json";

mock.module("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: () => (key: string) => key.split(".").reduce<unknown>((value, part) => (value as Record<string, unknown>)[part], messages.contributor) as string,
}));

const { ContributorPanel } = await import("./contributor-panel");

afterEach(() => { cleanup(); mock.restore(); });

describe("ContributorPanel", () => {
  test("confirmation renders the exact protected review-case link", async () => {
    globalThis.fetch = mock((url: string) => Promise.resolve(url === "/api/contribute"
      ? new Response(JSON.stringify({ title: { hi: "मसौदा", en: "Draft" }, summary: { hi: "सार", en: "Summary" }, steps: [{ hi: "कदम", en: "Step" }], matches: [], additions: [], conflicts: [], sourceType: "lived experience", previewToken: "preview-token" }), { status: 200 })
      : new Response(JSON.stringify({ reviewCaseId: "11111111-1111-4111-8111-111111111111", reviewUrl: "/admin/reviews/11111111-1111-4111-8111-111111111111" }), { status: 201 }))) as unknown as typeof fetch;
    render(<ContributorPanel />);
    fireEvent.change(screen.getByRole("textbox", { name: "What happened?" }), { target: { value: "My scholarship did not arrive." } });
    fireEvent.click(screen.getByRole("button", { name: "Preview draft" }));
    const confirm = await screen.findByRole("button", { name: "Confirm and submit for expert review" });
    fireEvent.click(confirm);
    const link = await screen.findByRole("link", { name: "Open this protected review case" });
    expect(link.getAttribute("href")).toBe("/admin/reviews/11111111-1111-4111-8111-111111111111");
  });

  test("editing input clears a stale preview before it can be confirmed", async () => {
    globalThis.fetch = mock(() => Promise.resolve(new Response(JSON.stringify({ title: { hi: "मसौदा", en: "Draft" }, summary: { hi: "सार", en: "Summary" }, steps: [{ hi: "कदम", en: "Step" }], matches: [], additions: [], conflicts: [], sourceType: "lived experience", previewToken: "preview-token" }), { status: 200 }))) as unknown as typeof fetch;
    render(<ContributorPanel />);
    const input = screen.getByRole("textbox", { name: "What happened?" });
    fireEvent.change(input, { target: { value: "First experience" } });
    fireEvent.click(screen.getByRole("button", { name: "Preview draft" }));
    await screen.findByRole("button", { name: "Confirm and submit for expert review" });
    fireEvent.change(input, { target: { value: "Changed experience" } });
    expect(screen.queryByRole("button", { name: "Confirm and submit for expert review" })).toBeNull();
  });
});
