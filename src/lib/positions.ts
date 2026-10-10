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

/** Outfield shape of an XI, e.g. "4-4-2" (DEF-MID-FWD; the goalkeeper isn't counted). */
export function formationLabel(xi: { position: number }[]): string {
	const c: Record<number, number> = { 2: 0, 3: 0, 4: 0 };
	for (const p of xi) if (p.position in c) c[p.position]++;
	return `${c[2]}-${c[3]}-${c[4]}`;
}
