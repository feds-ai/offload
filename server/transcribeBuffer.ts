/**
 * Transcribes an audio buffer directly via the Whisper API,
 * bypassing the storage upload step that causes "failed to fetch audio file" errors
 * when the storage URL is relative and cannot be resolved server-side.
 */
import { ENV } from "./_core/env";

export async function transcribeBuffer(
  buffer: Buffer,
  mimeType: string,
  language = "en"
): Promise<string> {
  const ext = mimeType.split("/")[1]?.split(";")[0] ?? "webm";
  const filename = `audio.${ext}`;

  const formData = new FormData();
  const blob = new Blob([new Uint8Array(buffer)], { type: mimeType });
  formData.append("file", blob, filename);
  formData.append("model", "whisper-1");
  formData.append("response_format", "json");
  formData.append("language", language);
  formData.append("prompt", "Transcribe this family household voice note accurately.");

  const baseUrl = ENV.forgeApiUrl.endsWith("/") ? ENV.forgeApiUrl : `${ENV.forgeApiUrl}/`;
  const url = new URL("v1/audio/transcriptions", baseUrl).toString();

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ENV.forgeApiKey}`,
      "Accept-Encoding": "identity",
    },
    body: formData,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Whisper API error ${response.status}: ${text}`);
  }

  const json = (await response.json()) as { text?: string };
  if (!json.text) throw new Error("Whisper returned empty transcript");
  return json.text;
}
