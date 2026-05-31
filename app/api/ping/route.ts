import { NextResponse } from "next/server";

export const runtime = "edge";

export function GET() {
  return NextResponse.json(
    { ok: true },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
        Pragma: "no-cache",
      },
    }
  );
}
