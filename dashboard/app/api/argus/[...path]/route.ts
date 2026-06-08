const ARGUS_BASE = "http://127.0.0.1:8088/api";

export async function GET(
  request: Request,
  { params }: { params: { path: string[] } }
) {
  const argusPath = params.path.join("/");
  const url = new URL(request.url);
  const query = url.search;
  try {
    const res = await fetch(`${ARGUS_BASE}/${argusPath}${query}`, {
      headers: { "Content-Type": "application/json" },
      next: { revalidate: 0 },
    });
    const data = await res.json();
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: "Argus API offline" }, { status: 503 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: { path: string[] } }
) {
  const argusPath = params.path.join("/");
  const body = await request.json();
  try {
    const res = await fetch(`${ARGUS_BASE}/${argusPath}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      next: { revalidate: 0 },
    });
    const data = await res.json();
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: "Argus API offline" }, { status: 503 });
  }
}
