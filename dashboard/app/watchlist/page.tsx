import { MEDIAN_DAYS_TO_PEAK } from "@/lib/perf-constants";
import WatchlistClient from "./WatchlistClient";

export default function WatchlistPage() {
  return <WatchlistClient medianDaysToPeak={MEDIAN_DAYS_TO_PEAK} />;
}
