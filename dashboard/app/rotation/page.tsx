import fs from "fs";
import path from "path";
import RotationPanel, { type RotationRow } from "@/components/today/RotationPanel";

export const dynamic = "force-dynamic";

function reportsDir(): string {
  return process.env.BRIDGE_DIR ?? path.join(process.cwd(), "..", "reports");
}

function loadRotation(): RotationRow[] | null {
  try {
    const raw = fs.readFileSync(path.join(reportsDir(), "rotation_latest.json"), "utf-8");
    const data = JSON.parse(raw);
    if (Array.isArray(data)) return data as RotationRow[];
    return null;
  } catch {
    return null;
  }
}

export default function RotationPage() {
  const rotation = loadRotation();

  return (
    <main className="mx-auto max-w-6xl space-y-4 px-4 py-6">
      {rotation ? (
        <RotationPanel rows={rotation} defaultOpen collapsible={false} />
      ) : (
        <div className="rounded-lg border border-warn/50 bg-warn/10 px-4 py-2.5 text-[13px] text-warn">
          No rotation data — run_daily may have failed
        </div>
      )}
    </main>
  );
}
