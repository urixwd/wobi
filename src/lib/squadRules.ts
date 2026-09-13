/** Total squad budget in millions (Dream Team). */
export const BUDGET_TOTAL = 120;

/** Max players from the same club in the full squad (XI + bench). */
export const MAX_PER_CLUB = 2;

/** Dream Team-style XI limits */
export const XI_POS_MAX: Record<number, number> = {
	1: 1, // שוער
	2: 5, // הגנה
	3: 5, // קישור
	4: 3 // התקפה
};

export const XI_TOTAL_MAX = 11;
export const XI_OUTFIELD_MAX = 10; // positions 2–4

export function countByPos(ids: number[], posOf: (id: number) => number | undefined): Record<number, number> {
	const c: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
	for (const id of ids) {
		const p = posOf(id);
		if (p && c[p] != null) c[p]++;
	}
	return c;
}

export function countClub(
	ids: number[],
	teamId: number,
	teamOf: (id: number) => number | undefined
): number {
	let n = 0;
	for (const id of ids) {
		if (teamOf(id) === teamId) n++;
	}
	return n;
}

export function canAddToXi(
	xi: number[],
	playerId: number,
	position: number,
	posOf: (id: number) => number | undefined
): { ok: boolean; reason?: string } {
	if (xi.includes(playerId)) return { ok: false, reason: 'כבר בהרכב' };
	if (xi.length >= XI_TOTAL_MAX) return { ok: false, reason: 'כבר 11 בהרכב' };

	const counts = countByPos(xi, posOf);
	const max = XI_POS_MAX[position] ?? 0;
	if (counts[position] >= max) {
		return { ok: false, reason: `מקס׳ ${max} ב${positionLabelHe(position)}` };
	}

	const outfield = counts[2] + counts[3] + counts[4];
	if (position !== 1 && outfield >= XI_OUTFIELD_MAX) {
		return { ok: false, reason: 'כבר 10 שחקני שדה' };
	}

	return { ok: true };
}

export function canAddToBench(
	bench: number[],
	playerId: number,
	position: number,
	posOf: (id: number) => number | undefined
): { ok: boolean; reason?: string } {
	if (bench.includes(playerId)) return { ok: false, reason: 'כבר בספסל' };
	const taken = bench.some((id) => posOf(id) === position);
	if (taken) return { ok: false, reason: 'משבצת העמדה בספסל תפוסה' };
	return { ok: true };
}

/** Shared checks for club cap + budget across XI+bench. */
export function canFitInSquad(
	squadIds: number[],
	playerId: number,
	teamId: number,
	price: number,
	teamOf: (id: number) => number | undefined,
	priceOf: (id: number) => number
): { ok: boolean; reason?: string } {
	const without = squadIds.filter((id) => id !== playerId);
	if (countClub(without, teamId, teamOf) >= MAX_PER_CLUB) {
		return { ok: false, reason: `מקס׳ ${MAX_PER_CLUB} שחקנים מאותה קבוצה` };
	}
	const spend = without.reduce((s, id) => s + priceOf(id), 0);
	if (spend + price > BUDGET_TOTAL) {
		return {
			ok: false,
			reason: `חריגה מתקציב (${spend + price}/${BUDGET_TOTAL})`
		};
	}
	return { ok: true };
}

function positionLabelHe(pos: number): string {
	return ({ 1: 'שוער', 2: 'הגנה', 3: 'קישור', 4: 'התקפה' } as Record<number, string>)[pos] ?? 'עמדה';
}
