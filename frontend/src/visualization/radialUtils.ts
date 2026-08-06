export function polarToXY(angle: number, radius: number): [number, number] {
  return [radius * Math.cos(angle), radius * Math.sin(angle)];
}

/** Quadratic Bézier arc between two polar points */
export function radialLink(
  r1: number, a1: number,
  r2: number, a2: number
): string {
  const [x1, y1] = polarToXY(a1, r1);
  const [x2, y2] = polarToXY(a2, r2);
  const midR = (r1 + r2) / 2;
  const midA = (a1 + a2) / 2;
  const [cx, cy] = polarToXY(midA, midR);
  return `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`;
}

/** Truncate a name: first name only if short enough, else truncate */
export function shortName(name: string, maxLen = 12): string {
  const first = name.split(" ")[0];
  if (first.length <= maxLen) return first;
  return first.slice(0, maxLen - 1) + "…";
}

export function fullFirstName(name: string): string {
  return name.split(" ")[0];
}
