import { describe, expect, test } from "bun:test";
import { stopMediaStream } from "./media";

describe("stopMediaStream", () => {
  test("stops every track in the active media stream", () => {
    let stoppedTracks = 0;
    const stream = {
      getTracks: () => [
        { stop: () => { stoppedTracks += 1; } },
        { stop: () => { stoppedTracks += 1; } },
      ],
    } as unknown as MediaStream;

    stopMediaStream(stream);

    expect(stoppedTracks).toBe(2);
  });
});
