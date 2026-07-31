import fs from "fs";
import path from "path";
import RotationPanel, { type RotationRow } from "@/components/today/RotationPanel";
import RRGChart from "@/components/rotation/RRGChart";
import Failed from "@/components/ui/Failed";
import Stale from "@/components/ui/Stale";
import Page from "@/components/ui/Page";

export const dynamic = "force-dynamic";

function reportsDir(): string {
  return process.env.BRIDGE_DIR ?? path.join(process.cwd(), "..", "reports");
}

function rotationPath(): string {
  return path.join(reportsDir(), "rotation_latest.json");
}

function loadRotation(): RotationRow[] | null {
  try {
    const raw = fs.readFileSync(rotationPath(), "utf-8");
    const data = JSON.parse(raw);
    if (Array.isArray(data)) return data as RotationRow[];
    return null;
  } catch {
    return null;
  }
}

function loadRotationMtime(): Date | null {
  try {
    return fs.statSync(rotationPath()).mtime;
  } catch {
    return null;
  }
}

export default function RotationPage() {
  const rotation = loadRotation();
  const mtime = loadRotationMtime();

  return (
    <Page width="wide">
      <Page.Header
        title="Sector Rotation"
        status={<Stale asOf={mtime} source="run_daily" staleAfterMins={1440} />}
      />
      {rotation ? (
        <>
          <RRGChart rows={rotation} />
          <RotationPanel rows={rotation} defaultOpen collapsible={false} />
        </>
      ) : (
        <Failed
          title="No rotation data"
          message="rotation_latest.json hasn't been written — the run_daily rotation job may have failed."
        />
      )}
    </Page>
  );
}
