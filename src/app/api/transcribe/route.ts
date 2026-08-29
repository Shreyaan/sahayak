import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const audio = form?.get("audio");

  if (!(audio instanceof File) || audio.size === 0) {
    return NextResponse.json({ error: "Audio is required." }, { status: 400 });
  }

  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Voice input is not configured." }, { status: 503 });
  }

  const response = await fetch(
    "https://api.deepgram.com/v1/listen?model=nova-3&language=multi&smart_format=true",
    {
      method: "POST",
      headers: {
        Authorization: `Token ${apiKey}`,
        "Content-Type": audio.type || "audio/webm",
      },
      body: await audio.arrayBuffer(),
    },
  );

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
