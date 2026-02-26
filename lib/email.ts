import nodemailer from "nodemailer";
import { getTenantEmailRuntime } from "@/lib/tenant-integrations";

interface SendEmailResult {
  ok: boolean;
  id?: string;
  reason?: string;
}

interface SendEmailParams {
  tenantId?: string;
  to: string;
  subject: string;
  html: string;
}

interface PaymentConfirmationParams {
  tenantId?: string;
  to: string;
  businessName: string;
  productName: string;
  quantity: number;
  amount: number;
  paymentId: string;
  currency?: string;
}

interface ReservationReminderParams {
  tenantId?: string;
  to: string;
  guestName: string;
  cabinName: string;
  checkIn: string;
  checkOut?: string | null;
}

interface WeeklyReportParams {
  tenantId?: string;
  to: string;
  businessName: string;
  totalMessages: number;
  purchaseIntents: number;
  paymentLinks: number;
  contacts: number;
}

interface LeadFollowUpParams {
  tenantId?: string;
  to: string;
  contactName?: string | null;
  businessName: string;
}

interface OwnerNewMessageAlertParams {
  tenantId?: string;
  to: string;
  businessName: string;
  channel: string;
  senderId: string;
  message: string;
  dashboardUrl?: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ── Shared layout ─────────────────────────────────────

function baseLayout(content: string, footer = "YD Social Ops"): string {
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#f4f4f7">
    <tr><td align="center" style="padding:24px 16px">
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:580px;background:#ffffff;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,0.06)">
        <tr><td style="padding:32px 28px">${content}</td></tr>
      </table>
      <p style="font-size:11px;color:#999;margin-top:16px;text-align:center">${footer} · Enviado automáticamente</p>
    </td></tr>
  </table>
</body></html>`;
}

function heading(text: string, color = "#3b82f6"): string {
  return `<h1 style="margin:0 0 12px;font-size:22px;color:${color};font-weight:700">${text}</h1>`;
}
function p(text: string): string {
  return `<p style="font-size:15px;color:#333;line-height:1.6;margin:0 0 12px">${text}</p>`;
}
function hr(): string {
  return `<hr style="border:none;border-top:1px solid #eee;margin:20px 0">`;
}
function cta(text: string, url: string, color = "#3b82f6"): string {
  return `<table cellpadding="0" cellspacing="0" role="presentation" style="margin:16px 0">
    <tr><td style="background:${color};border-radius:8px;padding:12px 24px">
      <a href="${url}" style="color:#fff;text-decoration:none;font-size:14px;font-weight:600">${text}</a>
    </td></tr></table>`;
}
function infoRow(label: string, value: string): string {
  return `<tr>
    <td style="padding:6px 0;font-size:13px;color:#888;width:130px">${label}</td>
    <td style="padding:6px 0;font-size:14px;color:#333;font-weight:500">${value}</td>
  </tr>`;
}
function infoTable(rows: [string, string][]): string {
  return `<table cellpadding="0" cellspacing="0" role="presentation" style="width:100%;border:1px solid #eee;border-radius:8px;padding:12px;margin:12px 0">
    ${rows.map(([l, v]) => infoRow(l, v)).join("")}</table>`;
}

// ── Templates ─────────────────────────────────────────

function paymentConfirmationTemplate(params: PaymentConfirmationParams): string {
  const amountText = new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: params.currency || "CLP",
    minimumFractionDigits: 0,
  }).format(params.amount || 0);

  return baseLayout(
    heading("✅ Pago confirmado", "#16a34a") +
    p("Tu pago fue aprobado correctamente.") +
    infoTable([
      ["Negocio", escapeHtml(params.businessName)],
      ["Producto", escapeHtml(params.productName)],
      ["Cantidad", String(params.quantity)],
      ["Total", amountText],
      ["ID de pago", escapeHtml(params.paymentId)],
    ]) +
    hr() +
    p("Si tienes alguna duda, no dudes en escribirnos."),
    params.businessName
  );
}

function reservationReminderTemplate(params: ReservationReminderParams): string {
  const rows: [string, string][] = [
    ["Reserva", escapeHtml(params.cabinName)],
    ["Check-in", escapeHtml(params.checkIn)],
  ];
  if (params.checkOut) rows.push(["Check-out", escapeHtml(params.checkOut)]);

  return baseLayout(
    heading("⏰ Recordatorio de reserva", "#f59e0b") +
    p(`Hola ${escapeHtml(params.guestName || "cliente")}, tu reserva es <strong>mañana</strong>. ¡Te esperamos!`) +
    infoTable(rows) +
    `<ul style="font-size:13px;color:#555;line-height:1.8;margin:12px 0;padding-left:20px">
      <li>Confirma tu horario de llegada</li>
      <li>Ten tu documento de identidad a mano</li>
      <li>Si necesitas cambios, responde este correo</li>
    </ul>` +
    hr() +
    p("¡Que disfrutes tu experiencia! 😊")
  );
}

function weeklyReportTemplate(params: WeeklyReportParams): string {
  const dashUrl = `${process.env.APP_URL || "https://social.yd-engineering.cl"}/dashboard`;

  return baseLayout(
    heading("📊 Resumen semanal") +
    p(`Aquí está tu resumen de la semana para <strong>${escapeHtml(params.businessName)}</strong>.`) +
    infoTable([
      ["Mensajes totales", String(params.totalMessages)],
      ["Intenciones de compra", String(params.purchaseIntents)],
      ["Links de pago generados", String(params.paymentLinks)],
      ["Contactos activos", String(params.contacts)],
    ]) +
    cta("Ver Dashboard completo", dashUrl) +
    hr() +
    p("Este reporte se envía automáticamente cada lunes."),
    params.businessName
  );
}

function leadFollowUpTemplate(params: LeadFollowUpParams): string {
  return baseLayout(
    heading("👋 Seguimos en contacto") +
    p(`Hola ${escapeHtml(params.contactName || "cliente")},`) +
    p(`Queríamos saber si deseas continuar con tu consulta en <strong>${escapeHtml(params.businessName)}</strong>.`) +
    p("Si quieres, responde este correo y te ayudamos a cerrar tu reserva o compra.") +
    hr() +
    p("¡Estamos aquí para ayudarte!"),
    params.businessName
  );
}

function ownerNewMessageAlertTemplate(params: OwnerNewMessageAlertParams): string {
  const channelLabel: Record<string, string> = {
    web: "🌐 Web", whatsapp: "📱 WhatsApp", messenger: "💬 Messenger",
    instagram: "📸 Instagram", tiktok: "🎵 TikTok",
  };
  const dashUrl = params.dashboardUrl || `${process.env.APP_URL || "https://social.yd-engineering.cl"}/dashboard/chat-logs`;

  return baseLayout(
    heading("🔔 Nuevo mensaje de cliente") +
    p(`Un cliente acaba de escribir en tu bot de <strong>${escapeHtml(params.businessName)}</strong>.`) +
    infoTable([
      ["Canal", channelLabel[params.channel] || escapeHtml(params.channel)],
      ["Remitente", escapeHtml(params.senderId)],
    ]) +
    `<div style="background:#f8f9fa;border-radius:8px;padding:14px;margin:12px 0;border-left:3px solid #3b82f6">
      <p style="font-size:13px;color:#666;margin:0 0 4px">Mensaje:</p>
      <p style="font-size:14px;color:#333;margin:0;font-style:italic">"${escapeHtml(params.message).slice(0, 300)}"</p>
    </div>` +
    cta("Ver en Chat Logs", dashUrl) +
    hr() +
    p("El bot ya respondió automáticamente. Revisa si necesitas intervenir."),
    params.businessName
  );
}

async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
  const runtime = await getTenantEmailRuntime(params.tenantId);
  const from =
    runtime.provider === "smtp" || runtime.provider === "resend" || runtime.provider === "gmail_oauth"
      ? runtime.fromEmail
      : "noreply@yd-social-ops.local";

  if (!runtime.provider) return { ok: false, reason: "email_not_configured" };
  if (!params.to?.trim()) return { ok: false, reason: "missing_to" };

  try {
    if (runtime.provider === "smtp") {
      const transporter = nodemailer.createTransport({
        host: runtime.host,
        port: runtime.port,
        secure: runtime.secure,
        auth: {
          user: runtime.user,
          pass: runtime.password,
        },
      });

      const info = await transporter.sendMail({
        from,
        to: params.to.trim(),
        subject: params.subject,
        html: params.html,
      });

      return { ok: true, id: info.messageId };
    }

    if (runtime.provider === "gmail_oauth") {
      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
          type: "OAuth2",
          user: runtime.userEmail,
          clientId: runtime.clientId,
          clientSecret: runtime.clientSecret,
          refreshToken: runtime.refreshToken,
        },
      });

      const info = await transporter.sendMail({
        from,
        to: params.to.trim(),
        subject: params.subject,
        html: params.html,
      });

      return { ok: true, id: info.messageId };
    }

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${runtime.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [params.to.trim()],
        subject: params.subject,
        html: params.html,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      console.warn("[Email] Resend error:", response.status, body);
      return { ok: false, reason: `resend_${response.status}` };
    }

    const data = (await response.json()) as { id?: string };
    return { ok: true, id: data.id };
  } catch (error) {
    console.warn("[Email] sendEmail exception:", error);
    return { ok: false, reason: "exception" };
  }
}

export async function sendWelcomeEmail(
  to: string,
  businessName: string
): Promise<SendEmailResult> {
  const dashUrl = `${process.env.APP_URL || "https://social.yd-engineering.cl"}/dashboard`;

  return sendEmail({
    to,
    subject: `¡Bienvenido a ${businessName}!`,
    html: baseLayout(
      heading(`¡Bienvenido, ${escapeHtml(businessName)}!`) +
      p("Tu asistente inteligente está listo para atender a tus clientes 24/7.") +
      p("Ahora puedes:") +
      `<ul style="font-size:14px;color:#333;line-height:1.8;margin:12px 0;padding-left:20px">
        <li>Configurar tu catálogo de productos o servicios</li>
        <li>Conectar WhatsApp, Messenger o Instagram</li>
        <li>Personalizar el tono y la personalidad del bot</li>
      </ul>` +
      cta("Ir al Dashboard", dashUrl) +
      hr() +
      p("¡Mucho éxito con tu negocio! 🎉"),
      businessName
    ),
  });
}

export async function sendPaymentConfirmationEmail(
  params: PaymentConfirmationParams
): Promise<SendEmailResult> {
  return sendEmail({
    tenantId: params.tenantId,
    to: params.to,
    subject: `Pago confirmado - ${params.productName}`,
    html: paymentConfirmationTemplate(params),
  });
}

export async function sendReservationReminderEmail(
  params: ReservationReminderParams
): Promise<SendEmailResult> {
  return sendEmail({
    tenantId: params.tenantId,
    to: params.to,
    subject: `Recordatorio de reserva - ${params.cabinName}`,
    html: reservationReminderTemplate(params),
  });
}

export async function sendWeeklyReportEmail(
  params: WeeklyReportParams
): Promise<SendEmailResult> {
  return sendEmail({
    tenantId: params.tenantId,
    to: params.to,
    subject: `Reporte semanal - ${params.businessName}`,
    html: weeklyReportTemplate(params),
  });
}

export async function sendLeadFollowUpEmail(
  params: LeadFollowUpParams
): Promise<SendEmailResult> {
  return sendEmail({
    tenantId: params.tenantId,
    to: params.to,
    subject: `Seguimiento - ${params.businessName}`,
    html: leadFollowUpTemplate(params),
  });
}

export async function sendOwnerNewMessageAlertEmail(
  params: OwnerNewMessageAlertParams
): Promise<SendEmailResult> {
  return sendEmail({
    tenantId: params.tenantId,
    to: params.to,
    subject: `Nuevo mensaje (${params.channel}) - ${params.businessName}`,
    html: ownerNewMessageAlertTemplate(params),
  });
}

export async function sendCustomTenantEmail(params: {
  tenantId: string;
  to: string;
  subject: string;
  message: string;
}): Promise<SendEmailResult> {
  const safeSubject = params.subject.trim().slice(0, 160);
  const safeMessage = params.message.trim().slice(0, 3000);
  const safeHtml = `
  <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827;">
    <p>${escapeHtml(safeMessage).replace(/\n/g, "<br/>")}</p>
  </div>
  `;

  return sendEmail({
    tenantId: params.tenantId,
    to: params.to,
    subject: safeSubject || "Mensaje",
    html: safeHtml,
  });
}
