"use client";

import useSWR from "swr";

interface HealthResponse {
  error?: string;
  [key: string]: unknown;
}

const fetcher = (url: string): Promise<HealthResponse> =>
  fetch(url).then((r) => r.json());

export default function ApiStatus() {
  const { data, error } = useSWR<HealthResponse>("/api/argus/health", fetcher, {
    refreshInterval: 30000,
    revalidateOnFocus: false,
  });

  const online = !error && data != null && !data.error;
  const color = online ? "#22c55e" : "#ef4444";
  const label = online ? "Argus API online" : "Argus API offline";

  return (
    <span
      title={label}
      style={{ backgroundColor: color }}
      className="w-2 h-2 rounded-full inline-block cursor-default"
      aria-label={label}
    />
  );
}
