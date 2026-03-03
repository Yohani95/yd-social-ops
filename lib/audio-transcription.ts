/**
 * Transcripcion de audio usando Groq Whisper.
 * Soporta URLs y buffers. Usado para mensajes de voz en WhatsApp, Messenger e Instagram.
 */

const GROQ_API_URL = "https://api.groq.com/openai/v1/audio/transcriptions";
const WHISPER_MODEL = "whisper-large-v3-turbo";

/**
 * Obtiene la URL del archivo de audio desde la API de Meta.
 * Meta recomienda usar Authorization: Bearer para media endpoints.
 */
export async function getMetaMediaUrl(
  mediaId: string,
  accessToken: string
): Promise<string | null> {
  const endpoint = `https://graph.facebook.com/v21.0/${mediaId}`;

  let res = await fetch(endpoint, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  // Fallback defensivo por compatibilidad
  if (!res.ok) {
    res = await fetch(`${endpoint}?access_token=${encodeURIComponent(accessToken)}`);
  }

  if (!res.ok) return null;

  const data = (await res.json()) as { url?: string };
  return data?.url || null;
}

function extensionFromContentType(contentType: string | null): string {
  const value = (contentType || "").toLowerCase();
  if (value.includes("ogg")) return "ogg";
  if (value.includes("mpeg") || value.includes("mp3")) return "mp3";
  if (value.includes("wav")) return "wav";
  if (value.includes("m4a") || value.includes("mp4")) return "m4a";
  if (value.includes("webm")) return "webm";
  if (value.includes("aac")) return "aac";
  return "ogg";
}

export async function transcribeAudioFromUrl(
  url: string,
  accessToken?: string
): Promise<string> {
  let res: Response;

  if (accessToken) {
    res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!res.ok) {
      res = await fetch(url);
    }
  } else {
    res = await fetch(url);
  }

  if (!res.ok) {
    throw new Error(`Error descargando audio: ${res.status}`);
  }

  const contentType = res.headers.get("content-type");
  const extension = extensionFromContentType(contentType);
  const buffer = Buffer.from(await res.arrayBuffer());

  return transcribeAudioBuffer(buffer, {
    contentType: contentType || `audio/${extension}`,
    fileName: `audio.${extension}`,
  });
}

export async function transcribeAudioBuffer(
  buffer: Buffer,
  options?: { contentType?: string; fileName?: string }
): Promise<string> {
  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) {
    console.warn("[Audio] GROQ_API_KEY no configurado, no se puede transcribir");
    return "";
  }

  const contentType = options?.contentType || "audio/ogg";
  const fileName = options?.fileName || "audio.ogg";

  const formData = new FormData();
  const blob = new Blob([new Uint8Array(buffer)], { type: contentType });
  formData.append("file", blob, fileName);
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
