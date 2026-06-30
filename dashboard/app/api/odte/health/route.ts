export async function GET() {
  try {
    const res = await fetch("http://127.0.0.1:8788/health", { next: { revalidate: 0 } });
    const data = await res.json();
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ ok: false, error: "0DTE service offline" }, { status: 503 });
  }
}
