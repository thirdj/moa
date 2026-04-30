// ================================================================
// [4] src/app/api/search/books/route.ts
// ================================================================
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
 
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q");
  if (!q) return NextResponse.json([]);
 
  const res = await fetch(
    `https://www.googleapis.com/books/v1/volumes` +
      `?q=${encodeURIComponent(q)}&maxResults=10&langRestrict=ko` +
      `&key=${process.env.GOOGLE_BOOKS_API_KEY}`
  );
  const data = await res.json();
 
  return NextResponse.json(
    (data.items ?? []).map((item: any) => ({
      id: item.id,
      title: item.volumeInfo.title,
      author: item.volumeInfo.authors?.join(", ") ?? "",
      thumbnail: item.volumeInfo.imageLinks?.thumbnail?.replace("http:", "https:") ?? null,
      publishedDate: item.volumeInfo.publishedDate ?? "",
      publisher: item.volumeInfo.publisher ?? "",
    }))
  );
}