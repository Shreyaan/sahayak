import { afterEach, describe, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AdminAccessPanel } from "./admin-access-panel";

afterEach(() => {
  cleanup();
  mock.restore();
});

function renderPanel() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <AdminAccessPanel initialAccess={{
        invitations: [{ id: "invite-1", email: "new@example.com", status: "pending", expiresAt: "2026-09-06T00:00:00.000Z" }],
        members: [
          { id: "member-1", role: "member", createdAt: "2026-09-01T00:00:00.000Z", user: { id: "user-1", name: "Meera", email: "meera@example.com" } },
          { id: "member-2", role: "revoked", createdAt: "2026-09-01T00:00:00.000Z", user: { id: "user-2", name: "Kabir", email: "kabir@example.com" } },
        ],
      }} />
    </QueryClientProvider>,
  );
}

describe("AdminAccessPanel", () => {
  test("shows pending invitations plus active and removed expert access", () => {
    renderPanel();

    expect(screen.getByText("new@example.com")).not.toBeNull();
    expect(screen.getByText("Meera")).not.toBeNull();
    expect(screen.getByText("Kabir")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Remove Meera's access" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Restore Kabir's access" })).not.toBeNull();
  });

  test("sends the reversible remove access action", async () => {
    window.confirm = mock(() => true);
    globalThis.fetch = mock(async (input, init) => {
      const body = init?.method === "PATCH"
        ? { memberId: "member-1", status: "revoked" }
        : { invitations: [], members: [] };
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as unknown as typeof fetch;
    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "Remove Meera's access" }));

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/admin/members/member-1",
      expect.objectContaining({ method: "PATCH", body: JSON.stringify({ action: "remove" }) }),
    ));
  });
});
