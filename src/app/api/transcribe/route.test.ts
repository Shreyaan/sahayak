import { describe, expect, test } from "bun:test";
import { POST } from "./route";

describe("POST /api/transcribe", () => {
  test("rejects requests without audio", async () => {
    const response = await POST(
      new Request("http://localhost/api/transcribe", {
        method: "POST",
        body: new FormData(),
      }),
    );

    expect(response.status).toBe(400);
  });
});
