/**
 * Transcripción de audio usando Groq Whisper.
 * Soporta URLs y buffers. Usado para mensajes de voz en WhatsApp, Messenger e Instagram.
 */

const GROQ_API_URL = "https://api.groq.com/openai/v1/audio/transcriptions";
const WHISPER_MODEL = "whisper-large-v3-turbo";

/**
 * Obtiene la URL del archivo de audio desde la API de Meta (WhatsApp).
 */
export async function getMetaMediaUrl(
  mediaId: string,
  accessToken: string
): Promise<string | null> {
  const res = await fetch(
    `https://graph.facebook.com/v21.0/${mediaId}?access_token=${encodeURIComponent(accessToken)}`
  );
  if (!res.ok) return null;
  const data = (await res.json()) as { url?: string };
  return data?.url || null;
}

export async function transcribeAudioFromUrl(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Error descargando audio: ${res.status}`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  return transcribeAudioBuffer(buffer);
}

export async function transcribeAudioBuffer(buffer: Buffer): Promise<string> {
  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) {
    console.warn("[Audio] GROQ_API_KEY no configurado, no se puede transcribir");
    return "";
  }

  const formData = new FormData();
  const blob = new Blob([new Uint8Array(buffer)], { type: "audio/ogg" });
  formData.append("file", blob, "audio.ogg");
  formData.append("model", WHISPER_MODEL);
  formData.append("response_format", "text");

  const res = await fetch(GROQ_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${groqKey}`,
    },
    body: formData,
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("[Audio] Error Groq Whisper:", res.status, err);
    return "";
  }

  const text = await res.text();
  return (text || "").trim();
}
