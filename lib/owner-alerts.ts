import { createServiceClient } from "@/lib/supabase/server";
import { sendOwnerNewMessageAlertEmail } from "@/lib/email";
import { notifyN8n } from "@/lib/integrations/n8n";
import { getAppUrl } from "@/lib/app-url";
import type { ChatChannel } from "@/types";

interface OwnerAlertInput {
  tenantId: string;
  channel: ChatChannel;
  senderId: string;
  message: string;
}

function normalizeChannelLabel(channel: ChatChannel): string {
  if (channel === "whatsapp") return "WhatsApp";
  if (channel === "messenger") return "Messenger";
  if (channel === "instagram") return "Instagram";
  if (channel === "tiktok") return "TikTok";
  return channel;
}

export async function notifyOwnerOnFirstExternalMessage(
  input: OwnerAlertInput
): Promise<{ alerted: boolean; reason?: string }> {
  if (input.channel === "web") return { alerted: false, reason: "web_channel" };
  if (!input.senderId?.trim()) return { alerted: false, reason: "missing_sender" };

  const alertsEnabled = process.env.OWNER_ALERTS_EMAIL_ENABLED !== "false";
  if (!alertsEnabled) return { alerted: false, reason: "disabled" };

  try {
    const supabase = createServiceClient();

    const { count, error: countError } = await supabase
      .from("chat_logs")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", input.tenantId)
      .eq("channel", input.channel)
      .eq("user_identifier", input.senderId);

    if (countError) {
      console.warn("[Owner Alerts] count error:", countError.message);
      return { alerted: false, reason: "count_error" };
    }

    if ((count || 0) > 0) {
      return { alerted: false, reason: "not_first_message" };
    }

    const { data: tenant, error: tenantError } = await supabase
      .from("tenants")
      .select("id, email, business_name")
      .eq("id", input.tenantId)
      .single();

    if (tenantError || !tenant?.email) {
      return { alerted: false, reason: "tenant_email_missing" };
    }

    const dashboardUrl = `${getAppUrl()}/dashboard/chat-logs`;
    const messagePreview = input.message.slice(0, 500);
    const channelLabel = normalizeChannelLabel(input.channel);

    const emailResult = await sendOwnerNewMessageAlertEmail({
      tenantId: input.tenantId,
      to: tenant.email,
      businessName: tenant.business_name || "Tu negocio",
      channel: channelLabel,
      senderId: input.senderId,
      message: messagePreview,
      dashboardUrl,
    });

    if (!emailResult.ok) {
      return { alerted: false, reason: emailResult.reason || "email_failed" };
    }

    void notifyN8n("owner_new_external_message", {
      tenant_id: input.tenantId,
      channel: input.channel,
      sender_id: input.senderId,
      message: messagePreview,
    }, { tenantId: input.tenantId });

    return { alerted: true };
  } catch (error) {
    console.warn("[Owner Alerts] exception:", error);
    return { alerted: false, reason: "exception" };
  }
}
