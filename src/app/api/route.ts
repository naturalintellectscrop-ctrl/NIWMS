import { NextResponse } from "next/server";

// Minimal service marker (Task 23 audit: replaced the "Hello, world!" scaffold).
export async function GET() {
  return NextResponse.json({ ok: true, service: "niwms" });
}
