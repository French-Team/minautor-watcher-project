export interface ChartData {
  labels: string[];
  values: number[];
  title?: string;
  width?: number;
  height?: number;
}

/**
 * Render a simple horizontal bar chart in ASCII
 */
export function renderBarChart(data: ChartData): string {
  const { labels, values, title, width = 50, height = 5 } = data;
  if (labels.length === 0 || values.length === 0) return "(empty)";

  const maxVal = Math.max(...values);
  if (maxVal === 0) return "(all zero)";

  const lines: string[] = [];
  if (title) {
    lines.push(`  ${title}`);
    lines.push("");
  }

  const barMax = width - 12;
  const scale = Math.min(maxVal, 1) > 0 ? barMax / maxVal : 1;

  for (let i = 0; i < labels.length; i++) {
    const label = labels[i].length > 10 ? labels[i].slice(0, 9) + "…" : labels[i];
    const barWidth = Math.round(values[i] * scale);
    const bar = "█".repeat(Math.max(1, barWidth));
    const paddedLabel = label.padEnd(11);
    lines.push(`${paddedLabel} ${bar} ${values[i]}`);
  }

  return lines.join("\n");
}

/**
 * Render a vertical sparkline from time-series data
 */
export function renderSparkline(values: number[], width = 30): string {
  if (values.length === 0) return "(empty)";

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const chars = "▁▂▃▄▅▆▇█";
  const step = values.length > width
    ? Math.floor(values.length / width)
    : 1;

  const sampled: number[] = [];
  for (let i = 0; i < values.length; i += step) {
    sampled.push(values[i]);
  }

  const line = sampled
    .map((v) => {
      const normalized = (v - min) / range;
      const idx = Math.floor(normalized * (chars.length - 1));
      return chars[Math.max(0, Math.min(idx, chars.length - 1))];
    })
    .join("");

  return `${line}  (min: ${min}, max: ${max})`;
}

/**
 * Render a full timing chart with CPU and memory
 */
export function renderTimingChart(
  cpuSamples: number[],
  heapSamples: number[],
  title = "Timeline"
): string {
  const lines: string[] = [];
  lines.push(`  ${title}`);
  lines.push(`  CPU:     ${renderSparkline(cpuSamples)}`);
  lines.push(`  Heap:    ${renderSparkline(heapSamples)}`);
  return lines.join("\n");
}
