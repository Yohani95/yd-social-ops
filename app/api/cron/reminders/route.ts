import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { isCronAuthorized } from "@/lib/cron-auth";
import { sendReservationReminderEmail } from "@/lib/email";

type ReservaRow = {
  id: string;
  guest_name: string | null;
  guest_email: string | null;
  check_in: string;
  check_out: string | null;
  cabanas?: { name?: string | null } | null;
};

function toDateOnly(input: Date): string {
  return input.toISOString().slice(0, 10);
}

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const supabase = createServiceClient();
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setUTCDate(now.getUTCDate() + 1);

    const dateFrom = toDateOnly(tomorrow);
    const dayAfterTomorrow = new Date(tomorrow);
    dayAfterTomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    const dateTo = toDateOnly(dayAfterTomorrow);

    const { data, error } = await supabase
      .from("reservas")
      .select("id, guest_name, guest_email, check_in, check_out, cabanas(name)")
      .gte("check_in", dateFrom)
      .lt("check_in", dateTo);

    if (error) {
      console.warn("[Cron reminders] Query error:", error.message);
      return NextResponse.json({ success: true, skipped: true, reason: error.message });
    }

    const reservas = (data || []) as ReservaRow[];
    let sent = 0;
    let skippedNoEmail = 0;

    for (const reserva of reservas) {
      const to = reserva.guest_email?.trim();
      if (!to) {
        skippedNoEmail += 1;
        continue;
      }

      const result = await sendReservationReminderEmail({
        to,
        guestName: reserva.guest_name || "cliente",
        cabinName: reserva.cabanas?.name || "Reserva",
        checkIn: reserva.check_in,
        checkOut: reserva.check_out,
      });

      if (result.ok) sent += 1;
    }

    return NextResponse.json({
      success: true,
      target_date: dateFrom,
      reservations_found: reservas.length,
      emails_sent: sent,
      skipped_no_email: skippedNoEmail,
    });
  } catch (error) {
    console.error("[Cron reminders] Error:", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
