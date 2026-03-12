import type { SocialChannel } from "@/types";
import type { ChannelAdapter, ParsedMessage, SendReplyOptions } from "./index";

/**
 * Email Adapter (Resend Inbound)
 *
 * Parsea payloads del webhook de Resend Inbound y envía respuestas
 * via Resend API manteniendo los headers de threading de email
 * (In-Reply-To, References).
 */

export interface ResendInboundPayload {
  messageId: string;
  from: string;          // "Nombre <email@example.com>"
  to: string[];
  subject: string;
  text?: string;
  html?: string;
  headers?: Record<string, string>;
  // threading
  inReplyTo?: string;
  references?: string;
}

export class EmailAdapter implements ChannelAdapter {
  parseIncoming(body: unknown): ParsedMessage | null {
    try {
      const payload = body as ResendInboundPayload;
      if (!payload?.messageId || !payload?.from) return null;

      // Extraer email del campo "from" (puede ser "Nombre <email>" o "email")
      const fromEmail = extractEmail(payload.from);
      if (!fromEmail) return null;

      const text = payload.text?.trim() || stripHtml(payload.html || "");
      if (!text) return null;

      return {
        senderId: fromEmail,
        message: text,
        metadata: {
          messageId:  payload.messageId,
          subject:    payload.subject,
          fromRaw:    payload.from,
          inReplyTo:  payload.inReplyTo,
          references: payload.references,
          headers:    payload.headers,
        },
      };
    } catch {
      return null;
    }
  }

  async sendReply(
    to: string,
    message: string,
    config: SocialChannel,
    options?: SendReplyOptions
  ): Promise<void> {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.error("[email-adapter] RESEND_API_KEY not set");
      return;
    }

    const cfg = (config.config || {}) as {
      from_address?: string;
      inReplyTo?: string;
      references?: string;
      subject?: string;
    };

    const fromAddress = cfg.from_address || "noreply@social.yd-engineering.cl";
    const subject = cfg.subject ? `Re: ${cfg.subject}` : "Re: Tu consulta";

    const headers: Record<string, string> = {};
    if (cfg.inReplyTo)  headers["In-Reply-To"] = cfg.inReplyTo;
    if (cfg.references) headers["References"]  = cfg.references;

    const body: Record<string, unknown> = {
      from:    fromAddress,
      to:      [to],
      subject,
      text:    message,
      headers,
    };

    if (options?.mediaUrl) {
      body.attachments = [{ path: options.mediaUrl }];
    }

    const res = await fetch("https://api.resend.com/emails", {
      method:  "POST",
      headers: {
        Authorization:  `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("[email-adapter] Resend error:", res.status, err);
    }
  }

  formatMessage(message: string): string {
    return message;
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────

function extractEmail(raw: string): string | null {
  const match = raw.match(/<([^>]+)>/);
  if (match) return match[1].toLowerCase();
  if (raw.includes("@")) return raw.trim().toLowerCase();
  return null;
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
