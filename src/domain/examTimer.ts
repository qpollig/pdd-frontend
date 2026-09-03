export function createCountdownTimer(options: {
  tick: () => void;
  isZero: () => boolean;
  onZero: () => void;
  intervalMs?: number;
}) {
  let handle: ReturnType<typeof setInterval> | null = null;

  function stop() {
    if (handle == null) return;
    clearInterval(handle);
    handle = null;
  }

  function start() {
    if (handle != null) return;
    handle = setInterval(() => {
      options.tick();
      if (options.isZero()) {
        stop();
        options.onZero();
      }
    }, options.intervalMs ?? 1000);
  }

  return { start, stop };
}
