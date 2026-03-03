import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedContext } from "@/lib/supabase/server";
import {
  createMerchantPaymentLink,
  listMerchantPaymentLinks,
} from "@/lib/merchant-payment-links";
import type { ChatChannel, MerchantPaymentLinkStatus } from "@/types";

const VALID_STATUSES: MerchantPaymentLinkStatus[] = [
  "draft",
  "pending_approval",
  "approved",
  "rejected",
  "created",
  "paid",
  "expired",
  "cancelled",
  "failed",
];

const VALID_CHANNELS: ChatChannel[] = ["web", "whatsapp", "messenger", "instagram", "tiktok"];

function canManage(role: string): boolean {
  return role === "owner" || role === "admin";
}

export async function GET(request: NextRequest) {
  const ctx = await getAuthenticatedContext();
  if (!ctx) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  if (!canManage(ctx.userRole)) {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }

  const searchParams = request.nextUrl.searchParams;
  const statusRaw = searchParams.get("status");
  const channelRaw = searchParams.get("channel");
  const contactId = searchParams.get("contact_id") || undefined;
  const from = searchParams.get("from") || undefined;
  const to = searchParams.get("to") || undefined;
  const limit = Number(searchParams.get("limit") || "50");
  const offset = Number(searchParams.get("offset") || "0");

  const status = statusRaw && VALID_STATUSES.includes(statusRaw as MerchantPaymentLinkStatus)
    ? (statusRaw as MerchantPaymentLinkStatus)
    : undefined;
  const channel = channelRaw && VALID_CHANNELS.includes(channelRaw as ChatChannel)
    ? (channelRaw as ChatChannel)
    : undefined;

  const result = await listMerchantPaymentLinks({
    tenantId: ctx.tenantId,
    status,
    channel,
    contactId,
    from,
    to,
    limit,
    offset,
  });

  return NextResponse.json({
    success: true,
    data: result.data,
    pagination: {
      limit,
      offset,
      has_more: result.hasMore,
      next_offset: result.nextOffset,
    },
  });
}

export async function POST(request: NextRequest) {
  const ctx = await getAuthenticatedContext();
  if (!ctx) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  if (!canManage(ctx.userRole)) {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    title?: string;
    description?: string;
    amount_clp?: number;
    quantity?: number;
    channel?: ChatChannel;
    thread_id?: string;
    contact_id?: string;
    customer_ref?: string;
    expires_minutes?: number;
  };

  const result = await createMerchantPaymentLink({
    tenantId: ctx.tenantId,
    title: String(body.title || ""),
    description: body.description,
    amountClp: Number(body.amount_clp || 0),
    quantity: Number(body.quantity || 1),
    channel: body.channel,
    threadId: body.thread_id,
    contactId: body.contact_id,
    customerRef: body.customer_ref,
    expiresMinutes: body.expires_minutes,
    createdBy: ctx.userRole === "owner" ? "owner" : "agent",
  });

  if (!result.ok) {
    return NextResponse.json(
      {
        error: result.error || "No se pudo crear el link de pago.",
        error_code: result.code || "create_failed",
        data: result.link || null,
      },
      { status: 400 }
    );
  }

  return NextResponse.json({ success: true, data: result.link });
}
