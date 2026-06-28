/**
 * Whisper STT integration via OpenAI API.
 * Returns null when no API key is configured or on any network/parse error,
 * so callers fall back to manual transcript entry.
 * Defensive by design — not exercised in tests (no network).
 */
import { openaiApiKey } from "@/lib/env";

const WHISPER_ENDPOINT = "https://api.openai.com/v1/audio/transcriptions";

/**
 * Transcribe base64-encoded audio to Korean text using Whisper.
 * Returns null if the API key is absent or any error occurs.
 */
export async function transcribeAudio(
  audioBase64: string,
  mimeType: string,
): Promise<string | null> {
  const key = openaiApiKey();
  if (!key) return null;

  try {
    const buffer = Buffer.from(audioBase64, "base64");
    const blob = new Blob([buffer], { type: mimeType });
    const ext = mimeType.split("/")[1] ?? "webm";
    const file = new File([blob], `audio.${ext}`, { type: mimeType });

    const form = new FormData();
    form.append("file", file);
    form.append("model", "whisper-1");
    form.append("language", "ko");

    const res = await fetch(WHISPER_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: form,
    });

    if (!res.ok) return null;

    const json = (await res.json()) as { text?: string };
    return json.text ?? null;
  } catch {
    return null;
  }
}
