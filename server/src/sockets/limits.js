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