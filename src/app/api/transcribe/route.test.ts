import { afterEach, describe, expect, mock, test } from "bun:test";
import { POST } from "./route";

const originalKey = process.env.DEEPGRAM_API_KEY;
const originalFetch = globalThis.fetch;

afterEach(() => {
  process.env.DEEPGRAM_API_KEY = originalKey;
  globalThis.fetch = originalFetch;
  mock.restore();
});

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

  test("rejects unsupported audio types", async () => {
    const form = new FormData();
    form.append("audio", new File(["not audio"], "notes.txt", { type: "text/plain" }));

    const response = await POST(new Request("http://localhost/api/transcribe", {
      method: "POST",
      headers: { "x-forwarded-for": crypto.randomUUID() },
      body: form,
    }));

    expect(response.status).toBe(400);
  });

  test("rejects audio larger than 5 MB", async () => {
    const form = new FormData();
    form.append("audio", new File([new Uint8Array(5 * 1024 * 1024 + 1)], "voice.webm", {
      type: "audio/webm",
    }));

    const response = await POST(new Request("http://localhost/api/transcribe", {
      method: "POST",
      headers: { "x-forwarded-for": crypto.randomUUID() },
      body: form,
    }));

    expect(response.status).toBe(400);
  });

  test("bounds the transcription provider request with an abort timeout", async () => {
    process.env.DEEPGRAM_API_KEY = "test-key";
    globalThis.fetch = mock(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      return Response.json({
        results: { channels: [{ alternatives: [{ transcript: "हाँ" }] }] },
      });
    }) as unknown as typeof fetch;
    const form = new FormData();
    form.append("audio", new File(["voice"], "voice.mp3", { type: "audio/mpeg" }));

    const response = await POST(new Request("http://localhost/api/transcribe", {
      method: "POST",
      headers: { "x-forwarded-for": crypto.randomUUID() },
      body: form,
    }));

    expect(response.status).toBe(200);
  });

  test.each([
    ["hi", "multi"],
    ["en", "en"],
  ])("asks Deepgram for the right language for %s", async (locale, expected) => {
    process.env.DEEPGRAM_API_KEY = "test-key";
    let requestedUrl = "";
    globalThis.fetch = mock(async (input: RequestInfo | URL) => {
      requestedUrl = String(input);
      return Response.json({
        results: { channels: [{ alternatives: [{ transcript: "ok" }] }] },
      });
    }) as unknown as typeof fetch;

    const form = new FormData();
    form.append("audio", new File(["voice"], "voice.webm", { type: "audio/webm" }));
    form.append("locale", locale);

    const response = await POST(new Request("http://localhost/api/transcribe", {
      method: "POST",
      headers: { "x-forwarded-for": crypto.randomUUID() },
      body: form,
    }));

    expect(response.status).toBe(200);
    expect(new URL(requestedUrl).searchParams.get("language")).toBe(expected);
  });
});
