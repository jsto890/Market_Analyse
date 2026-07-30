import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createLiveLadderPoller, computeBackoffDelay } from "../liveLadderPoller";

describe("computeBackoffDelay", () => {
  it("returns the base interval with zero prior failures", () => {
    expect(computeBackoffDelay(0, 500, 5000)).toBe(500);
  });

  it("doubles per consecutive failure, capped at maxIntervalMs", () => {
    expect(computeBackoffDelay(1, 500, 5000)).toBe(1000);
    expect(computeBackoffDelay(2, 500, 5000)).toBe(2000);
    expect(computeBackoffDelay(3, 500, 5000)).toBe(4000);
    expect(computeBackoffDelay(4, 500, 5000)).toBe(5000); // would be 8000, capped
  });
});

describe("createLiveLadderPoller", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("polls immediately on start, then every baseIntervalMs while healthy", async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: true });
    const onSuccess = vi.fn();
    const poller = createLiveLadderPoller({
      fetch: fetchFn, onSuccess, onError: vi.fn(),
      baseIntervalMs: 500, maxIntervalMs: 5000,
    });

    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(onSuccess).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(500);
    expect(fetchFn).toHaveBeenCalledTimes(2);

    poller.stop();
  });

  it("never starts a second fetch while one is still in flight (overlap guard)", async () => {
    let resolveFirst: (v: unknown) => void = () => {};
    const fetchFn = vi
      .fn()
      .mockImplementationOnce(() => new Promise((res) => { resolveFirst = res; }))
      .mockResolvedValue({ ok: true });

    const poller = createLiveLadderPoller({
      fetch: fetchFn, onSuccess: vi.fn(), onError: vi.fn(),
      baseIntervalMs: 500, maxIntervalMs: 5000,
    });
    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchFn).toHaveBeenCalledTimes(1);

    // Interval elapses while the first request is still pending — the next
    // fetch is only scheduled once the in-flight promise settles.
    await vi.advanceTimersByTimeAsync(2000);
    expect(fetchFn).toHaveBeenCalledTimes(1);

    resolveFirst({ ok: true });
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(500);
    expect(fetchFn).toHaveBeenCalledTimes(2);

    poller.stop();
  });

  it("backs off exponentially on repeated failures, capped at maxIntervalMs", async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error("network down"));
    const onError = vi.fn();
    const poller = createLiveLadderPoller({
      fetch: fetchFn, onSuccess: vi.fn(), onError,
      baseIntervalMs: 500, maxIntervalMs: 2000,
    });

    poller.start();
    await vi.advanceTimersByTimeAsync(0); // failure 1 → next delay 1000ms
    await vi.advanceTimersByTimeAsync(1000); // failure 2 → next delay 2000ms
    await vi.advanceTimersByTimeAsync(2000); // failure 3 → next delay capped 2000ms
    expect(fetchFn).toHaveBeenCalledTimes(3);
    expect(onError).toHaveBeenCalledTimes(3);

    poller.stop();
  });

  it("pauses while isPaused() returns true, resumes once it returns false", async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: true });
    let paused = false;
    const poller = createLiveLadderPoller({
      fetch: fetchFn, onSuccess: vi.fn(), onError: vi.fn(),
      baseIntervalMs: 500, maxIntervalMs: 5000, isPaused: () => paused,
    });

    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchFn).toHaveBeenCalledTimes(1);

    paused = true;
    await vi.advanceTimersByTimeAsync(2000);
    expect(fetchFn).toHaveBeenCalledTimes(1);

    paused = false;
    await vi.advanceTimersByTimeAsync(500);
    expect(fetchFn).toHaveBeenCalledTimes(2);

    poller.stop();
  });

  it("stop() halts all future polling", async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: true });
    const poller = createLiveLadderPoller({
      fetch: fetchFn, onSuccess: vi.fn(), onError: vi.fn(),
      baseIntervalMs: 500, maxIntervalMs: 5000,
    });

    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    poller.stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});
