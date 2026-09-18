/**
 * Matchday transfer suggestions.
 *
 * Base = the user's saved squad (15). Incoming players come ONLY from the round
 * watchlist. Up to `maxTransfers` swaps, keeping a legal squad (some legal XI
 * DEF3–5/MID3–5/FWD1–3 + one bench per position), budget ≤ 120, max 2 per club.
 *
 * Transfers may be cross-position (the squad shape is flexible), so a keeper in
 * the wishlist is never required — positions the wishlist doesn't cover simply
 * stay untouched. The user may force up to `maxTransfers` current players OUT;
 * every suggestion then removes those and fills from the wishlist.
 */
import { BUDGET_TOTAL, MAX_PER_CLUB, XI_POS_MAX } from '$lib/squadRules';
import type { UpcomingFixture } from '$lib/server/upcomingFixtures';

export type TPlayer = {
	id: number;
	name: string;
	teamId: number;
	teamName: string | null;
	position: number; // 1 GK, 2 DEF, 3 MID, 4 FWD
	price: number;
	logo: string | null;
	points: number; // season points
	form: number; // last-round points
	vlfm: number; // points per million
	matchdayEase: number; // this matchday fixture: green +3, yellow +1, red -2
	upcomingFixtures: UpcomingFixture[];
};

export type ObjectiveKey = 'points' | 'vlfm' | 'fixtures' | 'form';

export type TransferCombo = {
	id: string; // sorted squad ids
	formation: string; // DEF-MID-FWD of the XI
	xi: TPlayer[];
	bench: TPlayer[];
	out: TPlayer[];
	in: TPlayer[];
	transfersUsed: number;
	spend: number;
	remaining: number;
	points: number; // XI sum
	form: number; // XI sum
	vlfm: number; // XI average
	matchdayEase: number; // XI average
};

export type BestByObjective = { key: ObjectiveKey; title: string; combo: TransferCombo | null };

export type TransferResult = {
	hasSquad: boolean;
	wishlistCount: number;
	inboundCount: number;
	forcedOut: number[];
	forcedIn: number[];
	maxTransfers: number;
	feasible: boolean;
	notes: string[];
	best: BestByObjective[];
	topPoints: TransferCombo[];
	capped: boolean;
};

export const OBJECTIVES: { key: ObjectiveKey; title: string }[] = [
	{ key: 'points', title: 'מקסימום נקודות' },
	{ key: 'vlfm', title: 'תמורה למחיר' },
	{ key: 'fixtures', title: 'לוח קל למחזור' },
	{ key: 'form', title: 'כושר (מחזור אחרון)' }
];

/** Legal XI outfield shapes: DEF 3–5, MID 3–5, FWD 1–3, sum 10 (+1 GK). */
const XI_SHAPES: { def: number; mid: number; fwd: number }[] = (() => {
	const out: { def: number; mid: number; fwd: number }[] = [];
	for (let def = 3; def <= (XI_POS_MAX[2] ?? 5); def++)
		for (let mid = 3; mid <= (XI_POS_MAX[3] ?? 5); mid++)
			for (let fwd = 1; fwd <= (XI_POS_MAX[4] ?? 3); fwd++)
				if (def + mid + fwd === 10) out.push({ def, mid, fwd });
	return out;
})();

type ScoreFn = (p: TPlayer) => number;
const SCORE: Record<ObjectiveKey, ScoreFn> = {
	points: (p) => p.points,
	vlfm: (p) => p.vlfm,
	fixtures: (p) => p.matchdayEase,
	form: (p) => p.form
};

function kcombos<T>(arr: T[], k: number): T[][] {
	if (k < 0 || k > arr.length) return [];
	if (k === 0) return [[]];
	const res: T[][] = [];
	const rec = (start: number, acc: T[]) => {
		if (acc.length === k) {
			res.push(acc.slice());
			return;
		}
		for (let i = start; i <= arr.length - (k - acc.length); i++) {
			acc.push(arr[i]);
			rec(i + 1, acc);
			acc.pop();
		}
	};
	rec(0, []);
	return res;
}

function countsByPos(sq: TPlayer[]): Record<number, number> {
	const c: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
	for (const p of sq) if (c[p.position] != null) c[p.position]++;
	return c;
}

function clubOk(sq: TPlayer[]): boolean {
	const byClub = new Map<number, number>();
	for (const p of sq) {
		const n = (byClub.get(p.teamId) ?? 0) + 1;
		if (n > MAX_PER_CLUB) return false;
		byClub.set(p.teamId, n);
	}
	return true;
}

/** Enough stock for a legal XI plus one bench slot per position. */
function canCover(sq: TPlayer[]): boolean {
	const c = countsByPos(sq);
	if (c[1] < 2 || c[2] < 4 || c[3] < 4 || c[4] < 2) return false;
	return XI_SHAPES.some((s) => c[2] >= s.def + 1 && c[3] >= s.mid + 1 && c[4] >= s.fwd + 1);
}

/** Best XI + one-per-position bench from a 15-man squad, maximizing `score`. */
function arrange(sq15: TPlayer[], score: ScoreFn): { xi: TPlayer[]; bench: TPlayer[] } | null {
	const byPos: Record<number, TPlayer[]> = { 1: [], 2: [], 3: [], 4: [] };
	for (const p of sq15) byPos[p.position]?.push(p);
	for (const pos of [1, 2, 3, 4]) byPos[pos].sort((a, b) => score(b) - score(a) || b.points - a.points);

	let best: { xi: TPlayer[]; bench: TPlayer[]; sc: number } | null = null;
	for (const s of XI_SHAPES) {
		if (byPos[1].length < 2 || byPos[2].length < s.def + 1 || byPos[3].length < s.mid + 1 || byPos[4].length < s.fwd + 1)
			continue;
		const xi = [byPos[1][0], ...byPos[2].slice(0, s.def), ...byPos[3].slice(0, s.mid), ...byPos[4].slice(0, s.fwd)];
		const used = new Set(xi.map((p) => p.id));
		const rest = sq15.filter((p) => !used.has(p.id));
		const bench: TPlayer[] = [];
		let ok = true;
		for (const pos of [1, 2, 3, 4]) {
			const cand = rest.filter((p) => p.position === pos).sort((a, b) => score(b) - score(a) || a.price - b.price)[0];
			if (!cand) {
				ok = false;
				break;
			}
			bench.push(cand);
		}
		if (!ok || xi.length !== 11 || bench.length !== 4) continue;
		const sc = xi.reduce((a, p) => a + score(p), 0);
		if (!best || sc > best.sc) best = { xi, bench, sc };
	}
	return best ? { xi: best.xi, bench: best.bench } : null;
}

function formationLabel(xi: TPlayer[]): string {
	const c = { 2: 0, 3: 0, 4: 0 } as Record<number, number>;
	for (const p of xi) if (p.position >= 2 && p.position <= 4) c[p.position]++;
	return `${c[2]}-${c[3]}-${c[4]}`;
}

function makeCombo(newSquad: TPlayer[], squadIds: Set<number>, xi: TPlayer[], bench: TPlayer[]): TransferCombo {
	const newIds = new Set(newSquad.map((p) => p.id));
	const orderedXi = [...xi].sort((a, b) => a.position - b.position || b.points - a.points);
	const spend = newSquad.reduce((s, p) => s + p.price, 0);
	return {
		id: newSquad
			.map((p) => p.id)
			.sort((a, b) => a - b)
			.join('-'),
		formation: formationLabel(xi),
		xi: orderedXi,
		bench: [...bench].sort((a, b) => a.position - b.position),
		out: [...squadIds].filter((id) => !newIds.has(id)).map((id) => squadById.get(id)!).filter(Boolean),
		in: newSquad.filter((p) => !squadIds.has(p.id)),
		transfersUsed: newSquad.filter((p) => !squadIds.has(p.id)).length,
		spend: Math.round(spend * 10) / 10,
		remaining: Math.round((BUDGET_TOTAL - spend) * 10) / 10,
		points: xi.reduce((s, p) => s + p.points, 0),
		form: xi.reduce((s, p) => s + p.form, 0),
		vlfm: xi.reduce((s, p) => s + p.vlfm, 0) / xi.length,
		matchdayEase: xi.reduce((s, p) => s + p.matchdayEase, 0) / xi.length
	};
}

// Set by buildTransfers so makeCombo can resolve out-players by id.
let squadById = new Map<number, TPlayer>();

const PER_POS_CAP = 8;
const PLAN_CAP = 60_000;

export function buildTransfers(
	squad: TPlayer[],
	wishlist: TPlayer[],
	forcedOutIds: Set<number>,
	forcedInIds: Set<number> = new Set(),
	maxTransfers = 3,
	topN = 5
): TransferResult {
	squadById = new Map(squad.map((p) => [p.id, p]));
	const squadIds = new Set(squad.map((p) => p.id));
	const inboundAll = wishlist.filter((p) => !squadIds.has(p.id));
	const inboundIds = new Set(inboundAll.map((p) => p.id));
	const forced = [...forcedOutIds].filter((id) => squadIds.has(id)).slice(0, maxTransfers);
	const forcedIn = [...forcedInIds].filter((id) => inboundIds.has(id)).slice(0, maxTransfers);

	const base: Omit<TransferResult, 'feasible' | 'notes' | 'best' | 'topPoints'> = {
		hasSquad: squad.length === 15 && canCover(squad),
		wishlistCount: wishlist.length,
		inboundCount: inboundAll.length,
		forcedOut: forced,
		forcedIn,
		maxTransfers,
		capped: false
	};

	const empty = { best: [] as BestByObjective[], topPoints: [] as TransferCombo[] };

	if (!base.hasSquad)
		return { ...base, ...empty, feasible: false, notes: ['שמור קודם הרכב מלא (15 שחקנים) בעמוד «הקבוצה שלי».'] };
	if (inboundAll.length === 0)
		return { ...base, ...empty, feasible: false, notes: ['הוסף שחקנים לרשימת המחזור כדי לקבל הצעות חילופים.'] };
	if (forced.length > inboundAll.length)
		return {
			...base,
			...empty,
			feasible: false,
			notes: [`בחרת ${forced.length} להוצאה אבל יש רק ${inboundAll.length} מועמדים ברשימת המחזור.`]
		};
	if (forcedIn.length > maxTransfers)
		return {
			...base,
			...empty,
			feasible: false,
			notes: [`אפשר עד ${maxTransfers} חילופים, אז לכל היותר ${maxTransfers} שחקנים שחייבים להיכנס.`]
		};

	// Cap inbound per position (top by points) to bound the search; keep mandatory-in aside.
	const forcedInPlayers = inboundAll.filter((p) => forcedInIds.has(p.id));
	const inboundByPos: Record<number, TPlayer[]> = { 1: [], 2: [], 3: [], 4: [] };
	for (const p of inboundAll) if (!forcedInIds.has(p.id)) inboundByPos[p.position]?.push(p);
	for (const pos of [1, 2, 3, 4])
		inboundByPos[pos].sort((a, b) => b.points - a.points || a.price - b.price);
	// Candidates for the non-mandatory incoming slots.
	const restPool = [1, 2, 3, 4].flatMap((pos) => inboundByPos[pos].slice(0, PER_POS_CAP));

	const optionalOuts = squad.filter((p) => !forcedOutIds.has(p.id));
	const forcedPlayers = forced.map((id) => squadById.get(id)!).filter(Boolean);

	const kMin = Math.max(1, forced.length, forcedIn.length);
	let plans = 0;
	let capped = false;

	const bestByObj = new Map<ObjectiveKey, { combo: TransferCombo; sc: number }>();
	const pointsCombos = new Map<string, TransferCombo>();

	outer: for (let k = kMin; k <= maxTransfers; k++) {
		const extraOuts = kcombos(optionalOuts, k - forced.length);
		// Every incoming set includes the mandatory players, then fills the rest.
		const inSets = kcombos(restPool, k - forcedIn.length).map((rest) => [...forcedInPlayers, ...rest]);
		for (const eo of extraOuts) {
			const outSet = [...forcedPlayers, ...eo];
			const removeIds = new Set(outSet.map((p) => p.id));
			const kept = squad.filter((p) => !removeIds.has(p.id));
			for (const inn of inSets) {
				if (++plans > PLAN_CAP) {
					capped = true;
					break outer;
				}
				const newSquad = [...kept, ...inn];
				if (newSquad.length !== 15) continue;
				if (!clubOk(newSquad)) continue;
				const spend = newSquad.reduce((s, p) => s + p.price, 0);
				if (spend > BUDGET_TOTAL + 1e-6) continue;
				if (!canCover(newSquad)) continue;

				// points arrangement → topPoints (dedup by resulting squad)
				const pArr = arrange(newSquad, SCORE.points);
				if (pArr) {
					const combo = makeCombo(newSquad, squadIds, pArr.xi, pArr.bench);
					if (!pointsCombos.has(combo.id)) pointsCombos.set(combo.id, combo);
				}
				// best per objective
				for (const { key } of OBJECTIVES) {
					const arr = arrange(newSquad, SCORE[key]);
					if (!arr) continue;
					const combo = makeCombo(newSquad, squadIds, arr.xi, arr.bench);
					const sc =
						key === 'points'
							? combo.points
							: key === 'form'
								? combo.form
								: key === 'vlfm'
									? combo.vlfm
									: combo.matchdayEase;
					const cur = bestByObj.get(key);
					if (!cur || sc > cur.sc + 1e-9 || (Math.abs(sc - cur.sc) <= 1e-9 && combo.points > cur.combo.points))
						bestByObj.set(key, { combo, sc: Math.max(sc, cur?.sc ?? -Infinity) });
				}
			}
		}
	}

	const best: BestByObjective[] = OBJECTIVES.map(({ key, title }) => ({
		key,
		title,
		combo: bestByObj.get(key)?.combo ?? null
	}));

	const topPoints = [...pointsCombos.values()]
		.sort((a, b) => b.points - a.points || b.vlfm - a.vlfm || a.spend - b.spend)
		.slice(0, topN);

	const feasible = best.some((b) => b.combo) || topPoints.length > 0;
	const notes: string[] = [];
	if (!feasible)
		notes.push('לא נמצא חילוף חוקי (בדוק תקציב 120 ומקס׳ 2 מאותה קבוצה, או הוסף מועמדים מתאימים לרשימה).');

	return { ...base, capped, feasible, notes, best, topPoints };
}
