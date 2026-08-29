import { describe, expect, test } from "bun:test";
import { POST } from "./route";

describe("POST /api/speak", () => {
  test("rejects requests without text", async () => {
    const response = await POST(
      new Request("http://localhost/api/speak", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      }),
    );

    expect(response.status).toBe(400);
  });
});
