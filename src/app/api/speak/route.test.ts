import { afterEach, describe, expect, mock, test } from "bun:test";
import { REQUEST_LIMIT } from "@/lib/rate-limit";
import { POST } from "./route";

const originalKey = process.env.ELEVENLABS_API_KEY;
const originalVoiceId = process.env.ELEVENLABS_VOICE_ID;
const originalFetch = globalThis.fetch;

afterEach(() => {
  process.env.ELEVENLABS_API_KEY = originalKey;
  process.env.ELEVENLABS_VOICE_ID = originalVoiceId;
  globalThis.fetch = originalFetch;
  mock.restore();
});

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

  test("rate limits the request after the configured burst from one IP", async () => {
    const makeRequest = () => new Request("http://localhost/api/speak", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.20" },
      body: JSON.stringify({ text: "hello" }),
    });

    for (let attempt = 0; attempt < REQUEST_LIMIT; attempt += 1) {
      await POST(makeRequest());
    }

    const response = await POST(makeRequest());

    expect(response.status).toBe(429);
  });

  test("bounds the speech provider request with an abort timeout", async () => {
    process.env.ELEVENLABS_API_KEY = "test-key";
    process.env.ELEVENLABS_VOICE_ID = "test-voice";
    globalThis.fetch = mock(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      return new Response("audio", {
        headers: { "content-type": "audio/mpeg" },
      });
    }) as unknown as typeof fetch;

    const response = await POST(new Request("http://localhost/api/speak", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": crypto.randomUUID() },
      body: JSON.stringify({ text: "hello" }),
    }));

    expect(response.status).toBe(200);
  });
});
