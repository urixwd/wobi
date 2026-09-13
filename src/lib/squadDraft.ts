/** Per-tab working draft from /squad (sessionStorage). */
export const SQUAD_DRAFT_KEY = 'wobi:squad-draft';

export type SquadDraft = {
	xi: number[];
	bench: number[];
	updatedAt: number;
};

export function sameIdList(a: number[], b: number[]): boolean {
	if (a.length !== b.length) return false;
	for (let i = 0; i < a.length; i++) {
		if (a[i] !== b[i]) return false;
	}
	return true;
}

/** Exact XI + bench match (order matters — true 1:1 snapshot). */
export function isExactSquad(
	xiA: number[],
	benchA: number[],
	xiB: number[],
	benchB: number[]
): boolean {
	return sameIdList(xiA, xiB) && sameIdList(benchA, benchB);
}

export function writeSquadDraft(xi: number[], bench: number[]) {
	if (typeof sessionStorage === 'undefined') return;
	const payload: SquadDraft = { xi, bench, updatedAt: Date.now() };
	sessionStorage.setItem(SQUAD_DRAFT_KEY, JSON.stringify(payload));
}

export function readSquadDraft(): SquadDraft | null {
	if (typeof sessionStorage === 'undefined') return null;
	try {
		const raw = sessionStorage.getItem(SQUAD_DRAFT_KEY);
		if (!raw) return null;
		const parsed = JSON.parse(raw) as SquadDraft;
		if (!Array.isArray(parsed.xi) || !Array.isArray(parsed.bench)) return null;
		return parsed;
	} catch {
		return null;
	}
}
