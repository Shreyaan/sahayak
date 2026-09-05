import { afterEach, describe, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ResolutionOutcomeForm, StepOutcomeForm } from "./step-outcome-form";

afterEach(() => {
  cleanup();
  mock.restore();
});

describe("StepOutcomeForm", () => {
  test("submits a deviation with optional evidence for the exact case and step", async () => {
    const fetchMock = mock(async () => new Response(JSON.stringify({ outcome: { id: "event-1" } }), {
      status: 201,
      headers: { "content-type": "application/json" },
    }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    render(<StepOutcomeForm
      caseId="11111111-1111-4111-8111-111111111111"
      stepId="check-pfms"
      locale="en"
    />);

    fireEvent.click(screen.getByRole("button", { name: "Something was different" }));
    fireEvent.change(screen.getByLabelText("What was different? (optional)"), {
      target: { value: "The bank requested another document." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save step feedback" }));

    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("Feedback saved"));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/cases/11111111-1111-4111-8111-111111111111/outcomes",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          kind: "different",
          stepId: "check-pfms",
          detail: "The bank requested another document.",
        }),
      }),
    );
  });

  test("records resolution evidence separately from step feedback", async () => {
    const fetchMock = mock(async () => new Response(JSON.stringify({ outcome: { id: "event-2" } }), {
      status: 201,
      headers: { "content-type": "application/json" },
    }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    render(<ResolutionOutcomeForm
      caseId="11111111-1111-4111-8111-111111111111"
      locale="en"
    />);

    fireEvent.change(screen.getByLabelText("Resolution evidence (optional)"), {
      target: { value: "Payment credited; PFMS reference 44." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirm resolved" }));

    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("Resolution recorded"));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/cases/11111111-1111-4111-8111-111111111111/outcomes",
      expect.objectContaining({
        body: JSON.stringify({ kind: "resolved", detail: "Payment credited; PFMS reference 44." }),
      }),
    );
  });
});
