import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "yd-social-ops",
    ts: new Date().toISOString(),
  });
}
