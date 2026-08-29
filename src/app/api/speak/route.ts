import { NextResponse } from "next/server";
import { z } from "zod";

const requestSchema = z.object({ text: z.string().trim().min(1).max(2_000) });

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json({ error: "Text is required." }, { status: 400 });
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = process.env.ELEVENLABS_VOICE_ID;
  if (!apiKey || !voiceId) {
    return NextResponse.json({ error: "Speech output is not configured." }, { status: 503 });
  }

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}/stream?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": apiKey,
      },
      body: JSON.stringify({
        text: parsed.data.text,
        model_id: "eleven_flash_v2_5",
      }),
    },
  );

  if (!response.ok || !response.body) {
    return NextResponse.json({ error: "Speech generation failed." }, { status: 502 });
  }

  return new Response(response.body, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "audio/mpeg",
    },
  });
}
