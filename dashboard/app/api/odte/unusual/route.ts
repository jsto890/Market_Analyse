import { isOdteSymbol } from "@/lib/odte";
import { companionSymbol } from "@/lib/odteCompanion";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get("symbol") ?? "";
  if (!isOdteSymbol(symbol)) {
    return Response.json({ error: "unknown symbol" }, { status: 400 });
  }
  const target = companionSymbol(symbol);
  try {
    const res = await fetch(`http://127.0.0.1:8088/api/unusual/${target}`, {
      next: { revalidate: 0 },
    });
    const data = await res.json();
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: "argus API offline" }, { status: 503 });
  }
}
