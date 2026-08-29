import { describe, expect, test } from "bun:test";
import { isRateLimited } from "./rate-limit";

describe("isRateLimited", () => {
  test("allows 20 requests per IP in 60 seconds and rejects the next", () => {
    const request = new Request("http://localhost", {
      headers: { "x-forwarded-for": "198.51.100.10" },
    });

    for (let attempt = 0; attempt < 20; attempt += 1) {
      expect(isRateLimited(request, 1_000)).toBe(false);
    }

    expect(isRateLimited(request, 1_000)).toBe(true);
  });

  test("starts a fresh allowance after 60 seconds", () => {
    const request = new Request("http://localhost", {
      headers: { "x-forwarded-for": "198.51.100.11" },
    });

    for (let attempt = 0; attempt < 20; attempt += 1) {
      isRateLimited(request, 1_000);
    }

    expect(isRateLimited(request, 61_000)).toBe(false);
  });
});
