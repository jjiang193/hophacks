/** Rolling-window axis labels. "10:21" as minute:second reads like a clock
 *  time; "-90s" cannot be misread. */
export function relativeTick(t: number, now: number): string {
  const s = Math.round((t - now) / 1000);
  return s >= 0 ? 'now' : `${s}s`;
}

/** Tooltips get the unambiguous wall-clock time, seconds included. */
export function clockTime(t: number): string {
  return new Date(t).toLocaleTimeString([], {
    hour: 'numeric', minute: '2-digit', second: '2-digit',
  });
}
