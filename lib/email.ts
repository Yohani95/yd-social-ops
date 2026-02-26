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

function paymentConfirmationTemplate(params: PaymentConfirmationParams): string {
  const amountText = new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: params.currency || "CLP",
    minimumFractionDigits: 0,
  }).format(params.amount || 0);

  return `
  <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827;">
    <h2 style="margin-bottom:8px;">Pago confirmado</h2>
    <p>Hola, tu pago fue aprobado correctamente.</p>
    <p><strong>Negocio:</strong> ${escapeHtml(params.businessName)}</p>
    <p><strong>Item:</strong> ${escapeHtml(params.productName)}</p>
    <p><strong>Cantidad:</strong> ${params.quantity}</p>
    <p><strong>Total:</strong> ${amountText}</p>
    <p><strong>ID de pago:</strong> ${escapeHtml(params.paymentId)}</p>
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0;" />
    <p style="font-size:12px;color:#6b7280;">Este correo fue enviado automaticamente por YD Social Ops.</p>
  </div>
  `;
}

function reservationReminderTemplate(params: ReservationReminderParams): string {
  return `
  <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827;">
    <h2 style="margin-bottom:8px;">Recordatorio de reserva</h2>
    <p>Hola ${escapeHtml(params.guestName || "cliente")}, te recordamos tu reserva.</p>
    <p><strong>Cabaña:</strong> ${escapeHtml(params.cabinName)}</p>
    <p><strong>Check-in:</strong> ${escapeHtml(params.checkIn)}</p>
    ${params.checkOut ? `<p><strong>Check-out:</strong> ${escapeHtml(params.checkOut)}</p>` : ""}
    <p><strong>Recomendaciones:</strong></p>
    <ul>
      <li>Confirma tu horario de llegada.</li>
      <li>Ten tu documento de identidad a mano.</li>
      <li>Si necesitas cambios, responde este correo con anticipacion.</li>
    </ul>
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0;" />
    <p style="font-size:12px;color:#6b7280;">Correo automatico enviado por YD Social Ops.</p>
  </div>
  `;
}

function weeklyReportTemplate(params: WeeklyReportParams): string {
  return `
  <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827;">
    <h2 style="margin-bottom:8px;">Reporte semanal</h2>
    <p><strong>Negocio:</strong> ${escapeHtml(params.businessName)}</p>
    <p><strong>Mensajes:</strong> ${params.totalMessages}</p>
    <p><strong>Intenciones de compra:</strong> ${params.purchaseIntents}</p>
    <p><strong>Links de pago:</strong> ${params.paymentLinks}</p>
    <p><strong>Contactos nuevos/activos:</strong> ${params.contacts}</p>
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0;" />
    <p style="font-size:12px;color:#6b7280;">Correo automatico enviado por YD Social Ops.</p>
  </div>
  `;
}

function leadFollowUpTemplate(params: LeadFollowUpParams): string {
  return `
  <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827;">
    <h2 style="margin-bottom:8px;">Seguimos en contacto</h2>
    <p>Hola ${escapeHtml(params.contactName || "cliente")},</p>
    <p>
      Queríamos saber si deseas continuar con tu consulta en
      <strong> ${escapeHtml(params.businessName)}</strong>.
    </p>
    <p>Si quieres, responde este correo y te ayudamos a cerrar tu reserva o compra.</p>
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0;" />
    <p style="font-size:12px;color:#6b7280;">Correo automatico enviado por YD Social Ops.</p>
  </div>
  `;
}

function ownerNewMessageAlertTemplate(params: OwnerNewMessageAlertParams): string {
  return `
  <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827;">
    <h2 style="margin-bottom:8px;">Nuevo mensaje en canal externo</h2>
    <p><strong>Negocio:</strong> ${escapeHtml(params.businessName)}</p>
    <p><strong>Canal:</strong> ${escapeHtml(params.channel)}</p>
    <p><strong>Remitente:</strong> ${escapeHtml(params.senderId)}</p>
    <p><strong>Mensaje:</strong><br/>${escapeHtml(params.message).replace(/\n/g, "<br/>")}</p>
    ${params.dashboardUrl ? `<p><a href="${escapeHtml(params.dashboardUrl)}">Abrir dashboard</a></p>` : ""}
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0;" />
    <p style="font-size:12px;color:#6b7280;">Correo automatico enviado por YD Social Ops.</p>
  </div>
  `;
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
