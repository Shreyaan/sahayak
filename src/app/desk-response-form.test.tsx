import { afterEach, expect, test, mock } from "bun:test";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DeskResponseForm } from "./desk-response-form";
import { workflows } from "@/lib/workflow";

afterEach(cleanup);

test("shows complete response choices and preserves evidence after a failed save", async () => {
  const save = mock(async () => false);
  render(<DeskResponseForm node={workflows.scholarship.nodes.find(n => n.id === "pfms-trace")!} locale="en" busy={false} onSubmit={save} />);
  const choice = screen.getByRole("radio", { name: /NPCI/ });
  fireEvent.click(choice);
  fireEvent.change(screen.getByRole("textbox", { name: "What did they tell you?" }), { target: { value: "SYNTHETIC mapping issue" } });
  fireEvent.click(screen.getByRole("button", { name: "Save response and continue" }));
  await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
  expect((screen.getByRole("textbox", { name: "What did they tell you?" }) as HTMLTextAreaElement).value).toBe("SYNTHETIC mapping issue");
  expect((choice as HTMLInputElement).checked).toBe(true);
});
