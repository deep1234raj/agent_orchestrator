/**
 * Pure cron helpers — no external library needed for these use cases.
 */

/** Map well-known cron patterns to human-readable descriptions. */
export function describeCron(cron: string): string {
  const trimmed = cron.trim();
  const patterns: Record<string, string> = {
    "0 * * * *": "Every hour",
    "0 9 * * *": "Every day at 09:00",
    "0 9 * * 1": "Every Monday at 09:00",
    "0 9 * * 1-5": "Every weekday at 09:00",
    "* * * * *": "Every minute",
    "0 0 * * *": "Every day at midnight",
    "0 0 * * 1": "Every Monday at midnight",
  };
  if (patterns[trimmed]) return patterns[trimmed];

  // Generic fallback: parse minute/hour for simple "every day at HH:MM" patterns
  const parts = trimmed.split(/\s+/);
  if (parts.length === 5) {
    const [min, hour, dom, month, dow] = parts;
    if (dom === "*" && month === "*" && dow === "*") {
      const h = parseInt(hour, 10);
      const m = parseInt(min, 10);
      if (!isNaN(h) && !isNaN(m)) {
        const hh = String(h).padStart(2, "0");
        const mm = String(m).padStart(2, "0");
        return `Every day at ${hh}:${mm}`;
      }
    }
  }

  return cron;
}

/** Assemble a cron string from the five individual parts. */
export function buildCronFromParts(
  minute: string,
  hour: string,
  dom: string,
  month: string,
  dow: string,
): string {
  return `${minute} ${hour} ${dom} ${month} ${dow}`;
}
