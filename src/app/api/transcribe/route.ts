import { NextResponse } from "next/server";
import { baseAudioType, isAllowedAudioType, maxAudioBytes } from "@/lib/audio";
import { defaultLocale, isLocale, speechToTextLanguage } from "@/lib/locale";
import { isRateLimited } from "@/lib/rate-limit";

export async function POST(request: Request) {
  if (isRateLimited(request)) {
    return NextResponse.json({ error: "Too many requests. Please try again shortly." }, { status: 429 });
  }

  const form = await request.formData().catch(() => null);
  const audio = form?.get("audio");

  if (!(audio instanceof File) || audio.size === 0) {
    return NextResponse.json({ error: "Audio is required." }, { status: 400 });
  }

  if (!isAllowedAudioType(audio.type) || audio.size > maxAudioBytes) {
    return NextResponse.json({ error: "Audio must be a WebM, OGG, MP4, MP3, or WAV recording no larger than 5 MB." }, { status: 400 });
  }

  const requested = form?.get("locale");
  const locale = isLocale(requested) ? requested : defaultLocale;

  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Voice input is not configured." }, { status: 503 });
  }

  let response: Response;
  try {
    // Hindi speakers code-switch into English constantly, so Hindi uses the
    // multilingual model while English pins the language for better accuracy.
    const query = new URLSearchParams({
      model: "nova-3",
      language: speechToTextLanguage[locale],
      smart_format: "true",
    });

    response = await fetch(
      `https://api.deepgram.com/v1/listen?${query}`,
      {
        method: "POST",
        headers: {
          Authorization: `Token ${apiKey}`,
          "Content-Type": baseAudioType(audio.type),
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
