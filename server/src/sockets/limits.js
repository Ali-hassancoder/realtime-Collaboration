// Fixed-window event limiter; create one per socket.
// Returns 'ok', 'limited' (drop the event), or 'abusive' (disconnect the socket).
export function createEventLimiter({ limit, windowMs, abuseFactor = 3, now = Date.now }) {
  let windowStart = now();
  let count = 0;

  return () => {
    const time = now();
    if (time - windowStart >= windowMs) {
      windowStart = time;
      count = 0;
    }
    count += 1;
    if (count > limit * abuseFactor) return 'abusive';
    if (count > limit) return 'limited';
    return 'ok';
  };
}

// Same fixed-window idea, but one window per key (an IP, a user id) so a single guard can
// cover many clients. Returns a check function: (key) => 'ok' | 'limited'.
// Keys come and go (IPs rotate, users log out), so call sweep() on an interval to drop
// windows that have fully expired - otherwise the map grows without bound.
export function createKeyedLimiter({ limit, windowMs, now = Date.now }) {
  const windows = new Map(); // key -> { start, count }

  const check = (key) => {
    const time = now();
    const current = windows.get(key);
    if (!current || time - current.start >= windowMs) {
      windows.set(key, { start: time, count: 1 });
      return 'ok';
    }
    current.count += 1;
    return current.count > limit ? 'limited' : 'ok';
  };

  check.sweep = () => {
    const time = now();
    for (const [key, window] of windows) {
      if (time - window.start >= windowMs) windows.delete(key);
    }
  };

  return check;
}