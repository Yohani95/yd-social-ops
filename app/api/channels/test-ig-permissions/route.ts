import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedContext } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const channelId = searchParams.get("channelId");
  if (!channelId) return NextResponse.json({ error: "Missing channelId" }, { status: 400 });

  const ctx = await getAuthenticatedContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: channel } = await ctx.supabase
    .from("social_channels")
    .select("*")
    .eq("id", channelId)
    .eq("tenant_id", ctx.tenantId)
    .single();

  if (!channel || channel.channel_type !== "instagram") {
    return NextResponse.json({ error: "Canal Instagram no encontrado" }, { status: 404 });
  }

  const token = channel.access_token as string;
  const igAccountId = (channel.provider_config as Record<string, string>)?.ig_account_id;

  if (!token || !igAccountId) {
    return NextResponse.json({ error: "Faltan credenciales del canal de Instagram" }, { status: 400 });
  }

  const results: Record<string, unknown> = {};

  try {
    const publishRes = await fetch(
      `https://graph.facebook.com/v21.0/${igAccountId}/media?image_url=https://upload.wikimedia.org/wikipedia/commons/a/a5/Instagram_icon.png&caption=Test_App_Review_Please_Ignore&access_token=${token}`,
      { method: "POST" }
    );
    const publishData = await publishRes.json();
    results.publish_container = publishData;

    if (publishData.id) {
      const mediaPublishRes = await fetch(
        `https://graph.facebook.com/v21.0/${igAccountId}/media_publish?creation_id=${publishData.id}&access_token=${token}`,
        { method: "POST" }
      );
      const mediaPublishData = await mediaPublishRes.json();
      results.published_media = mediaPublishData;

      if (mediaPublishData.id) {
        await new Promise((resolve) => setTimeout(resolve, 2000));

        const commentRes = await fetch(
          `https://graph.facebook.com/v21.0/${mediaPublishData.id}/comments?message=Test_Comment_App_Review&access_token=${token}`,
          { method: "POST" }
        );
        const commentData = await commentRes.json();
        results.created_comment = commentData;

        if (commentData.id) {
          const hideRes = await fetch(
            `https://graph.facebook.com/v21.0/${commentData.id}?hide=true&access_token=${token}`,
            { method: "POST" }
          );
          results.hidden_comment = await hideRes.json();
        }
      }
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "ig_test_failed";
    results.error = message;
  }

  try {
    const meRes = await fetch(`https://graph.facebook.com/v21.0/me?fields=id,name,email&access_token=${token}`);
    results.me_test = await meRes.json();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "me_test_failed";
    results.me_test = { error: message };
  }

  const now = new Date().toISOString();
  const existingConfig = (channel.config && typeof channel.config === "object")
    ? (channel.config as Record<string, unknown>)
    : {};
  const existingMetaReview = (existingConfig.meta_review && typeof existingConfig.meta_review === "object")
    ? (existingConfig.meta_review as Record<string, unknown>)
    : {};
  const success = Boolean((results.publish_container as { id?: string } | undefined)?.id)
    || Boolean((results.published_media as { id?: string } | undefined)?.id);

  await ctx.supabase
    .from("social_channels")
    .update({
      config: {
        ...existingConfig,
        meta_review: {
          ...existingMetaReview,
          instagram_permissions: {
            last_test_at: now,
            success,
            results,
          },
        },
      },
      updated_at: now,
    })
    .eq("id", channel.id)
    .eq("tenant_id", ctx.tenantId);

  return NextResponse.json({
    success: true,
    message: "Pruebas de IG completadas. Revisa Meta Developers e Instagram para evidencia.",
    results,
  });
}
