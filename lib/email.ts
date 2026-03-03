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

interface SaasSubscriptionStatusEmailParams {
  tenantId?: string;
  to: string;
  businessName: string;
  planTier: string;
  status: string;
  preapprovalId: string;
  nextBillingDate?: string | null;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeText(value: unknown, fallback = "-"): string {
  if (typeof value !== "string") return fallback;
  const text = value.trim();
  return text || fallback;
}

function formatMoney(amount: number, currency = "CLP"): string {
  const normalizedCurrency = (currency || "CLP").toUpperCase();
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: normalizedCurrency,
    minimumFractionDigits: 0,
  }).format(Number.isFinite(amount) ? amount : 0);
}

function formatPlanLabel(planTier: string): string {
  const value = (planTier || "").trim().toLowerCase();
  if (value === "enterprise_plus") return "Enterprise+";
  if (!value) return "Plan";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function button(text: string, url: string, accent = "#2563eb"): string {
  return `
    <table role="presentation" cellspacing="0" cellpadding="0" style="margin:16px 0 8px 0;">
      <tr>
        <td align="center" bgcolor="${accent}" style="border-radius:10px;">
          <a href="${url}" target="_blank" style="display:inline-block;padding:12px 20px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;">
            ${escapeHtml(text)}
          </a>
        </td>
      </tr>
    </table>
  `;
}

function infoTable(rows: Array<[string, string]>): string {
  return `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #e5e7eb;border-radius:10px;padding:10px 14px;background:#fafafa;">
      ${rows
        .map(
          ([label, value]) => `
            <tr>
              <td style="padding:7px 0;font-size:13px;color:#6b7280;width:34%;">${escapeHtml(label)}</td>
              <td style="padding:7px 0;font-size:14px;color:#111827;font-weight:600;">${escapeHtml(value)}</td>
            </tr>
          `
        )
        .join("")}
    </table>
  `;
}

function statsGrid(items: Array<{ label: string; value: string }>): string {
  return `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:8px 0 6px 0;">
      <tr>
        ${items
          .map(
            (item) => `
              <td style="padding:6px;">
                <div style="border:1px solid #e5e7eb;border-radius:10px;padding:12px;background:#ffffff;">
                  <div style="font-size:12px;color:#6b7280;">${escapeHtml(item.label)}</div>
                  <div style="margin-top:4px;font-size:20px;font-weight:700;color:#111827;">${escapeHtml(item.value)}</div>
                </div>
              </td>
            `
          )
          .join("")}
      </tr>
    </table>
  `;
}

function emailShell(params: {
  businessName: string;
  title: string;
  subtitle?: string;
  accent?: string;
  body: string;
}): string {
  const accent = params.accent || "#2563eb";
  const appName = "YD Social Ops";

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${escapeHtml(params.title)}</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111827;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f4f6;">
    <tr>
      <td align="center" style="padding:26px 14px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;">
          <tr>
            <td style="padding:0 0 12px 0;">
              <div style="font-size:13px;color:#6b7280;">${escapeHtml(appName)}</div>
            </td>
          </tr>
          <tr>
            <td style="background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;overflow:hidden;">
              <div style="padding:22px 24px;background:${accent};color:#ffffff;">
                <div style="font-size:12px;opacity:0.95;letter-spacing:0.4px;text-transform:uppercase;">Notificacion</div>
                <div style="margin-top:6px;font-size:24px;font-weight:700;line-height:1.25;">${escapeHtml(params.title)}</div>
                ${
                  params.subtitle
                    ? `<div style="margin-top:6px;font-size:14px;line-height:1.5;opacity:0.96;">${escapeHtml(params.subtitle)}</div>`
                    : ""
                }
              </div>
              <div style="padding:22px 24px;background:#ffffff;">
                ${params.body}
              </div>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:12px 8px 0 8px;">
              <div style="font-size:11px;color:#9ca3af;">
                ${escapeHtml(params.businessName)} · Enviado automaticamente por ${escapeHtml(appName)}
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function welcomeTemplate(businessName: string): string {
  const dashUrl = `${process.env.APP_URL || "https://social.yd-engineering.cl"}/dashboard`;
  return emailShell({
    businessName,
    title: "Bienvenido a tu panel",
    subtitle: "Tu asistente ya esta listo para operar",
    accent: "#0f766e",
    body:
      `<p style="margin:0 0 12px 0;font-size:15px;line-height:1.65;color:#374151;">
        Activaste correctamente tu cuenta. Desde ahora puedes atender clientes, generar cobros y controlar tus conversaciones desde un solo lugar.
      </p>` +
      statsGrid([
        { label: "Canales", value: "Web + Social" },
        { label: "Pagos", value: "Mercado Pago" },
        { label: "Modo", value: "Automatizado" },
      ]) +
      button("Ir al dashboard", dashUrl, "#0f766e"),
  });
}

function paymentConfirmationTemplate(params: PaymentConfirmationParams): string {
  return emailShell({
    businessName: params.businessName,
    title: "Pago confirmado",
    subtitle: `${formatMoney(params.amount, params.currency)} acreditado`,
    accent: "#15803d",
    body:
      `<p style="margin:0 0 14px 0;font-size:15px;line-height:1.65;color:#374151;">
        Tu pago fue aprobado correctamente y ya quedo registrado en el sistema.
      </p>` +
      infoTable([
        ["Negocio", safeText(params.businessName)],
        ["Producto", safeText(params.productName)],
        ["Cantidad", String(params.quantity)],
        ["Total", formatMoney(params.amount, params.currency || "CLP")],
        ["Operacion", safeText(params.paymentId)],
      ]),
  });
}

function reservationReminderTemplate(params: ReservationReminderParams): string {
  return emailShell({
    businessName: params.cabinName,
    title: "Recordatorio de reserva",
    subtitle: `Hola ${safeText(params.guestName, "cliente")}, tu reserva esta cerca`,
    accent: "#b45309",
    body:
      infoTable([
        ["Cabana", safeText(params.cabinName)],
        ["Check-in", safeText(params.checkIn)],
        ["Check-out", safeText(params.checkOut || "-", "-")],
      ]) +
      `<p style="margin:14px 0 0 0;font-size:14px;line-height:1.65;color:#374151;">
        Si necesitas cambios, responde este correo y te ayudamos.
      </p>`,
  });
}

function weeklyReportTemplate(params: WeeklyReportParams): string {
  const dashUrl = `${process.env.APP_URL || "https://social.yd-engineering.cl"}/dashboard`;
  return emailShell({
    businessName: params.businessName,
    title: "Resumen semanal",
    subtitle: "Actividad consolidada de tu operacion",
    accent: "#4338ca",
    body:
      statsGrid([
        { label: "Mensajes", value: String(params.totalMessages) },
        { label: "Intenciones", value: String(params.purchaseIntents) },
        { label: "Links de pago", value: String(params.paymentLinks) },
        { label: "Contactos", value: String(params.contacts) },
      ]) + button("Ver dashboard completo", dashUrl, "#4338ca"),
  });
}

function leadFollowUpTemplate(params: LeadFollowUpParams): string {
  return emailShell({
    businessName: params.businessName,
    title: "Seguimiento de tu consulta",
    subtitle: `Hola ${safeText(params.contactName || "cliente")}`,
    accent: "#2563eb",
    body: `<p style="margin:0;font-size:15px;line-height:1.7;color:#374151;">
      Queremos ayudarte a completar tu solicitud. Si quieres avanzar, responde este correo y te asistimos de inmediato.
    </p>`,
  });
}

function ownerNewMessageAlertTemplate(params: OwnerNewMessageAlertParams): string {
  const dashboardUrl =
    params.dashboardUrl || `${process.env.APP_URL || "https://social.yd-engineering.cl"}/dashboard/chat-logs`;
  return emailShell({
    businessName: params.businessName,
    title: "Nuevo mensaje de cliente",
    subtitle: `Canal: ${safeText(params.channel)}`,
    accent: "#0f766e",
    body:
      infoTable([
        ["Canal", safeText(params.channel)],
        ["Remitente", safeText(params.senderId)],
      ]) +
      `<div style="margin-top:12px;border:1px solid #e5e7eb;border-radius:10px;padding:12px;background:#f9fafb;">
        <div style="font-size:12px;color:#6b7280;">Mensaje</div>
        <div style="margin-top:5px;font-size:14px;color:#111827;line-height:1.6;">
          ${escapeHtml(params.message).slice(0, 350)}
        </div>
      </div>` +
      button("Abrir chat logs", dashboardUrl, "#0f766e"),
  });
}

function saasSubscriptionStatusTemplate(params: SaasSubscriptionStatusEmailParams): string {
  const status = (params.status || "").toLowerCase();
  const paymentsUrl = `${process.env.APP_URL || "https://social.yd-engineering.cl"}/dashboard/settings?tab=payments`;
  const accent = status === "inactive" ? "#b45309" : "#15803d";
  const subtitle =
    status === "inactive"
      ? "Tu suscripcion quedo inactiva"
      : status === "trial"
        ? "Suscripcion activa en trial"
        : "Suscripcion activa";

  const rows: Array<[string, string]> = [
    ["Plan", formatPlanLabel(params.planTier)],
    ["Estado", safeText(params.status, "unknown")],
    ["Preapproval", safeText(params.preapprovalId)],
  ];
  if (params.nextBillingDate) {
    rows.push(["Proximo cobro", safeText(params.nextBillingDate)]);
  }

  return emailShell({
    businessName: params.businessName,
    title: "Estado de suscripcion",
    subtitle,
    accent,
    body:
      infoTable(rows) +
      button("Revisar pagos", paymentsUrl, accent) +
      `<p style="margin:10px 0 0 0;font-size:13px;color:#6b7280;">
        Si detectas una diferencia, usa "Sincronizar ahora" en Settings > Pagos.
      </p>`,
  });
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

    const isMailerSendKey = runtime.apiKey.startsWith("mlsn.");

    if (isMailerSendKey) {
      const response = await fetch("https://api.mailersend.com/v1/email", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${runtime.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: { email: from },
          to: [{ email: params.to.trim() }],
          subject: params.subject,
          html: params.html,
        }),
      });

      if (!response.ok) {
        const body = await response.text();
        console.warn("[Email] MailerSend error:", response.status, body);
        return { ok: false, reason: `mailersend_${response.status}` };
      }

      const messageId =
        response.headers.get("x-message-id") ||
        response.headers.get("X-Message-Id") ||
        undefined;
      return { ok: true, id: messageId };
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

function passwordRecoveryTemplate(params: {
  resetUrl: string;
  businessName?: string;
}): string {
  return emailShell({
    businessName: params.businessName || "YD Social Ops",
    title: "Restablecer contraseña",
    subtitle: "Recibimos una solicitud para restablecer tu contraseña",
    accent: "#2563eb",
    body:
      `<p style="margin:0 0 14px 0;font-size:15px;line-height:1.65;color:#374151;">
        Haz clic en el botón para crear una nueva contraseña. Si no solicitaste este cambio, puedes ignorar este correo.
      </p>` +
      button("Restablecer contraseña", params.resetUrl, "#2563eb") +
      `<p style="margin:14px 0 0 0;font-size:12px;color:#9ca3af;">
        Este enlace expira en 1 hora. Si el botón no funciona, copia y pega esta URL en tu navegador:<br/>
        <a href="${escapeHtml(params.resetUrl)}" style="color:#2563eb;word-break:break-all;">${escapeHtml(params.resetUrl)}</a>
      </p>`,
  });
}

function emailConfirmationTemplate(params: {
  confirmUrl: string;
  userName?: string;
  businessName?: string;
}): string {
  return emailShell({
    businessName: params.businessName || "YD Social Ops",
    title: "Confirma tu email",
    subtitle: params.userName
      ? `Hola ${escapeHtml(params.userName)}, confirma tu cuenta`
      : "Confirma tu cuenta para comenzar",
    accent: "#0f766e",
    body:
      `<p style="margin:0 0 14px 0;font-size:15px;line-height:1.65;color:#374151;">
        Haz clic en el botón para verificar tu email y activar tu cuenta.
      </p>` +
      button("Confirmar email", params.confirmUrl, "#0f766e") +
      `<p style="margin:14px 0 0 0;font-size:12px;color:#9ca3af;">
        Si no creaste una cuenta, puedes ignorar este correo.
      </p>`,
  });
}

function pendingApprovalNotificationTemplate(params: {
  businessName: string;
  linkTitle: string;
  amount: string;
  customerRef: string;
  dashboardUrl: string;
}): string {
  return emailShell({
    businessName: params.businessName,
    title: "Link de pago pendiente",
    subtitle: "Un cobro requiere tu aprobación",
    accent: "#b45309",
    body:
      infoTable([
        ["Concepto", safeText(params.linkTitle)],
        ["Monto", safeText(params.amount)],
        ["Cliente", safeText(params.customerRef)],
      ]) +
      button("Revisar y aprobar", params.dashboardUrl, "#b45309") +
      `<p style="margin:10px 0 0 0;font-size:13px;color:#6b7280;">
        Si no apruebas este cobro, el link no será enviado al cliente.
      </p>`,
  });
}

export async function sendPasswordRecoveryEmail(
  to: string,
  resetUrl: string,
  businessName?: string
): Promise<SendEmailResult> {
  return sendEmail({
    to,
    subject: "Restablecer tu contraseña - YD Social Ops",
    html: passwordRecoveryTemplate({ resetUrl, businessName }),
  });
}

export async function sendPendingApprovalNotificationEmail(params: {
  tenantId: string;
  to: string;
  businessName: string;
  linkTitle: string;
  amount: string;
  customerRef: string;
  dashboardUrl: string;
}): Promise<SendEmailResult> {
  return sendEmail({
    tenantId: params.tenantId,
    to: params.to,
    subject: `Cobro pendiente de aprobación - ${params.businessName}`,
    html: pendingApprovalNotificationTemplate(params),
  });
}

export function getPasswordRecoveryTemplateHtml(): string {
  return passwordRecoveryTemplate({ resetUrl: "{{ .ConfirmationURL }}" });
}

export function getEmailConfirmationTemplateHtml(): string {
  return emailConfirmationTemplate({ confirmUrl: "{{ .ConfirmationURL }}" });
}

export async function sendWelcomeEmail(to: string, businessName: string): Promise<SendEmailResult> {
  return sendEmail({
    to,
    subject: `Bienvenido a ${businessName}`,
    html: welcomeTemplate(businessName),
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

export async function sendWeeklyReportEmail(params: WeeklyReportParams): Promise<SendEmailResult> {
  return sendEmail({
    tenantId: params.tenantId,
    to: params.to,
    subject: `Reporte semanal - ${params.businessName}`,
    html: weeklyReportTemplate(params),
  });
}

export async function sendLeadFollowUpEmail(params: LeadFollowUpParams): Promise<SendEmailResult> {
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

export async function sendSaasSubscriptionStatusEmail(
  params: SaasSubscriptionStatusEmailParams
): Promise<SendEmailResult> {
  const planLabel = formatPlanLabel(params.planTier);
  const normalizedStatus = safeText(params.status, "unknown").toLowerCase();
  return sendEmail({
    tenantId: params.tenantId,
    to: params.to,
    subject: `Suscripcion ${planLabel} - ${normalizedStatus}`,
    html: saasSubscriptionStatusTemplate(params),
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

  const html = emailShell({
    businessName: "YD Social Ops",
    title: safeSubject || "Notificacion",
    subtitle: "Mensaje automatico",
    accent: "#1d4ed8",
    body: `<p style="margin:0;font-size:15px;line-height:1.7;color:#374151;">${escapeHtml(
      safeMessage
    ).replace(/\n/g, "<br/>")}</p>`,
  });

  return sendEmail({
    tenantId: params.tenantId,
    to: params.to,
    subject: safeSubject || "Mensaje",
    html,
  });
}
