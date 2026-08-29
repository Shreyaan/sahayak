/**
 * Types a browser MediaRecorder actually produces. Chrome reports
 * `audio/webm;codecs=opus`, Firefox `audio/ogg;codecs=opus`, and an audio-only
 * recording is often labelled with its container (`video/webm`), so the codec
 * parameter is stripped and both container spellings are accepted.
 */
const allowedAudioTypes = new Set([
  "audio/webm",
  "audio/ogg",
  "audio/mp4",
  "audio/mpeg",
  "audio/wav",
  "audio/x-wav",
  "video/webm",
  "video/mp4",
]);

export const maxAudioBytes = 5 * 1024 * 1024;

/** The type without its codec parameter, lowercased. */
export function baseAudioType(rawType: string): string {
  return rawType.split(";")[0].trim().toLowerCase();
}

export function isAllowedAudioType(rawType: string): boolean {
  return allowedAudioTypes.has(baseAudioType(rawType));
}
