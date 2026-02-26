import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { isCronAuthorized } from "@/lib/cron-auth";

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const supabase = createServiceClient();
    const nowIso = new Date().toISOString();
    const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

    const { data: expiredMemory, error: expiredMemoryError } = await supabase
      .from("conversation_memory")
      .select("id")
      .lt("expires_at", nowIso);

    if (expiredMemoryError) {
      return NextResponse.json({ error: expiredMemoryError.message }, { status: 500 });
    }

    let deletedMemory = 0;
    if ((expiredMemory || []).length > 0) {
      const ids = expiredMemory!.map((row) => row.id);
      const { error: deleteError } = await supabase
        .from("conversation_memory")
        .delete()
        .in("id", ids);

      if (deleteError) {
        return NextResponse.json({ error: deleteError.message }, { status: 500 });
      }
      deletedMemory = ids.length;
    }

    const { data: oldEvents, error: oldEventsError } = await supabase
      .from("payment_events")
      .select("id")
      .lt("created_at", cutoff);

    if (oldEventsError) {
      return NextResponse.json({ error: oldEventsError.message }, { status: 500 });
    }

    let deletedPaymentEvents = 0;
    if ((oldEvents || []).length > 0) {
      const ids = oldEvents!.map((row) => row.id);
      const { error: deleteError } = await supabase
        .from("payment_events")
        .delete()
        .in("id", ids);

      if (deleteError) {
        return NextResponse.json({ error: deleteError.message }, { status: 500 });
      }
      deletedPaymentEvents = ids.length;
    }

    return NextResponse.json({
      success: true,
      deleted_memory_rows: deletedMemory,
      deleted_payment_events: deletedPaymentEvents,
    });
  } catch (error) {
    console.error("[Cron cleanup] Error:", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
