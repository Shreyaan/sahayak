import { describe, expect, test } from "bun:test";
import { baseAudioType, isAllowedAudioType } from "./audio";

describe("isAllowedAudioType", () => {
  test.each([
    "audio/webm;codecs=opus",
    "audio/ogg; codecs=opus",
    "audio/mp4;codecs=mp4a.40.2",
    "AUDIO/WEBM",
    "video/webm",
    "audio/wav",
  ])("accepts a recording a browser actually produces: %s", (type) => {
    expect(isAllowedAudioType(type)).toBe(true);
  });

  test.each(["text/plain", "application/json", "image/png", "", "audio"])(
    "rejects a non-recording payload: %s",
    (type) => {
      expect(isAllowedAudioType(type)).toBe(false);
    },
  );

  test("strips the codec parameter before forwarding the type", () => {
    expect(baseAudioType("audio/webm;codecs=opus")).toBe("audio/webm");
  });
});
