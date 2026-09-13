export const POSITION_LABELS: Record<number, string> = {
	1: 'שוער',
	2: 'הגנה',
	3: 'קישור',
	4: 'התקפה'
};

export const POSITION_ORDER = [1, 2, 3, 4] as const;

export function positionLabel(pos: number): string {
	return POSITION_LABELS[pos] ?? String(pos);
}
