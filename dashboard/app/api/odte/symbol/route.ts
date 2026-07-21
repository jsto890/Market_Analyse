import { isOdteSymbol } from "@/lib/odte-core";

export async function POST(req: Request) {
  let symbol: unknown;
  try {
    ({ symbol } = await req.json());
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }
  if (typeof symbol !== "string" || !isOdteSymbol(symbol)) {
    return Response.json(
      { error: "symbol must be one of SPY, QQQ, IWM, DIA, SPX, NDX, RUT, DJX" },
      { status: 400 }
    );
  }
  try {
    const res = await fetch("http://127.0.0.1:8788/control/symbol", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol }),
      next: { revalidate: 0 },
    });
    const data = await res.json();
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: "0DTE service offline" }, { status: 503 });
  }
}
