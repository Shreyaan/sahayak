import { NextResponse } from "next/server";
import { isRateLimited } from "@/lib/rate-limit";

const allowedAudioTypes = new Set(["audio/webm", "audio/mp4", "audio/mpeg", "audio/wav"]);
const maxAudioBytes = 5 * 1024 * 1024;

export async function POST(request: Request) {
  if (isRateLimited(request)) {
    return NextResponse.json({ error: "Too many requests. Please try again shortly." }, { status: 429 });
  }

  const form = await request.formData().catch(() => null);
  const audio = form?.get("audio");

  if (!(audio instanceof File) || audio.size === 0) {
    return NextResponse.json({ error: "Audio is required." }, { status: 400 });
  }

  if (!allowedAudioTypes.has(audio.type) || audio.size > maxAudioBytes) {
    return NextResponse.json({ error: "Audio must be WebM, MP4, MP3, or WAV and no larger than 5 MB." }, { status: 400 });
  }

  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Voice input is not configured." }, { status: 503 });
  }

  let response: Response;
  try {
    response = await fetch(
      "https://api.deepgram.com/v1/listen?model=nova-3&language=multi&smart_format=true",
      {
        method: "POST",
        headers: {
          Authorization: `Token ${apiKey}`,
          "Content-Type": audio.type,
        },
        body: await audio.arrayBuffer(),
        signal: AbortSignal.timeout(15_000),
      },
    );
  } catch {
    return NextResponse.json({ error: "Transcription failed. Please try again." }, { status: 502 });
  }

  if (!response.ok) {
    return NextResponse.json({ error: "Transcription failed." }, { status: 502 });
  }

  const result = await response.json();
  const transcript = result.results?.channels?.[0]?.alternatives?.[0]?.transcript;

  if (!transcript) {
    return NextResponse.json({ error: "No speech was detected." }, { status: 422 });
  }

  return NextResponse.json({ transcript });
}
