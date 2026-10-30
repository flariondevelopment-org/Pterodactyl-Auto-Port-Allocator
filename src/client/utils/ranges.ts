import type { PortRange } from '../types/admin';

export function formatRangesDisplay(
    ranges?: Array<{ start: number; end: number }> | null,
    startFallback?: number | null,
    endFallback?: number | null
): string {
    if (ranges && ranges.length > 0) {
        return ranges.map((r) => `${r.start}–${r.end}`).join(', ');
    }
    if (startFallback && endFallback) {
        return `${startFallback}–${endFallback}`;
    }
    return 'Any Free';
}

/**
 * Extracts and filters valid numeric range bounds from raw form state.
 */
export function extractValidRanges(ranges: PortRange[]): Array<{ start: number; end: number }> {
    return ranges
        .filter((r) => r.start !== '' && r.end !== '' && Number(r.start) > 0 && Number(r.end) >= Number(r.start))
        .map((r) => ({ start: Number(r.start), end: Number(r.end) }));
}
