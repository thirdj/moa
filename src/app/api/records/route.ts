// src/app/api/records/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { getRecords, createRecord } from "@/lib/db";

// Vercel Edge가 아닌 Node.js 런타임 명시 → 연결 재사용 가능
export const runtime = "nodejs";
// 항상 최신 데이터가 필요하므로 캐시 안 함 (기본값이지만 명시)
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const records = await getRecords(session.user.id);
  return NextResponse.json(records);
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  const record = await createRecord(session.user.id, body);
  return NextResponse.json(record, { status: 201 });
}