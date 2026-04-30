// ================================================================
// [2] src/app/api/records/[id]/route.ts
// ================================================================
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { updateRecord, deleteRecord } from "@/lib/db";
 
export async function PUT(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 
  const body = await req.json();
  const record = await updateRecord(Number(params.id), session.user.id, body);
  return NextResponse.json(record);
}
 
export async function DELETE(
  _: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 
  await deleteRecord(Number(params.id), session.user.id);
  return NextResponse.json({ ok: true });
}