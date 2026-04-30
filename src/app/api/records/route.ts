// ================================================================
// [1] src/app/api/records/route.ts
// ================================================================
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { getRecords, createRecord } from "@/lib/db";
 
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