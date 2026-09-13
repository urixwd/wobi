/**
 * Squad options within Dream Team transfer limit (default 3).
 * Starts from the saved squad; ≤ maxTransfers replacements (same or cross-position).
 * Valid XI: GK1, DEF 3–5, MID 3–5, FWD 1–3 (sum 11). Bench: one per position.
 */
import { BUDGET_TOTAL, XI_POS_MAX, XI_TOTAL_MAX } from '$lib/squadRules';
import { seasonPoints } from '$lib/stats';
import { vlfm } from '$lib/playerMetrics';
import type { FixtureDifficulty } from '$lib/server/db/schema';
import type { UpcomingFixture } from '$lib/server/upcomingFixtures';

export const MAX_TRANSFERS = 3;

/** Legal XI outfield shapes: DEF 3–5, MID 3–5, FWD 1–3, sum 10. */
export const XI_SHAPES: { def: number; mid: number; fwd: number }[] = (() => {
	const out: { def: number; mid: number; fwd: number }[] = [];
	for (let def = 3; def <= 5; def++) {
		for (let mid = 3; mid <= 5; mid++) {
			for (let fwd = 1; fwd <= 3; fwd++) {
				if (def + mid + fwd !== 10) continue;
				if (def > (XI_POS_MAX[2] ?? 5)) continue;
				if (mid > (XI_POS_MAX[3] ?? 5)) continue;
				if (fwd > (XI_POS_MAX[4] ?? 3)) continue;
				out.push({ def, mid, fwd });
			}
		}
	}
	return out;
})();

export type OptionPlayer = {
	id: number;
	name: string;
	teamId: number;
	teamName: string | null;
	position: number;
	price: number;
	points: number;
	vlfm: number;
	fixtureEase: number;
	logo: string | null;
	upcomingFixtures: UpcomingFixture[];
};

export type SquadOption = {
	id: string;
	strategy: string;
	title: string;
	blurb: string;
	formation: string;
	xi: OptionPlayer[];
	bench: OptionPlayer[];
	spend: number;
	remaining: number;
	totalPoints: number;
	avgVlfm: number;
	avgFixtureEase: number;
	transfersUsed: number;
};

function fixtureEase(fixtures: UpcomingFixture[]): number {
	if (!fixtures?.length) return 0;
	const rank: Record<FixtureDifficulty, number> = { green: 3, yellow: 1, red: -2 };
	const slice = fixtures.slice(0, 3);
	return slice.reduce((s, f) => s + (rank[f.difficulty] ?? 0), 0) / slice.length;
}

export function toOptionPlayer(raw: {
	id: number;
	name: string;
	teamId: number;
	teamName: string | null;
	position: number;
	price: number;
	logo: string | null;
	upcomingFixtures: UpcomingFixture[];
	lastRoundPlayerStats?: unknown;
	lastSeasonPlayerStats?: unknown;
}): OptionPlayer {
	const pts = seasonPoints(raw) ?? 0;
	const v = vlfm(raw) ?? 0;
	return {
		id: raw.id,
		name: raw.name,
		teamId: raw.teamId,
		teamName: raw.teamName,
		position: raw.position,
		price: raw.price,
		points: pts,
		vlfm: v,
		fixtureEase: fixtureEase(raw.upcomingFixtures ?? []),
		logo: raw.logo,
		upcomingFixtures: raw.upcomingFixtures ?? []
	};
}

type ScoreFn = (p: OptionPlayer) => number;

function spendOf(players: OptionPlayer[]) {
	return players.reduce((s, p) => s + p.price, 0);
}

function formationLabel(xi: OptionPlayer[]): string {
	const c = { 2: 0, 3: 0, 4: 0 };
	for (const p of xi) {
		if (p.position === 2 || p.position === 3 || p.position === 4) c[p.position as 2 | 3 | 4]++;
	}
	return `${c[2]}-${c[3]}-${c[4]}`;
}

function countsByPos(squad: OptionPlayer[]) {
	const c = { 1: 0, 2: 0, 3: 0, 4: 0 };
	for (const p of squad) {
		if (c[p.position as 1 | 2 | 3 | 4] != null) c[p.position as 1 | 2 | 3 | 4]++;
	}
	return c;
}

/** Enough stock for some legal XI + one bench slot per position. */
function canCoverBenchAndXi(squad: OptionPlayer[]): boolean {
	const c = countsByPos(squad);
	if (c[1] < 2) return false;
	if (c[2] < 4 || c[3] < 4 || c[4] < 2) return false; // min XI 3/3/1 + bench 1 each
	return XI_SHAPES.some(
		(s) => c[2] >= s.def + 1 && c[3] >= s.mid + 1 && c[4] >= s.fwd + 1
	);
}

/** Pick best XI + position-bench from a 15-man set across all legal shapes. */
function arrangeSquad(
	squad15: OptionPlayer[],
	score: ScoreFn
): { xi: OptionPlayer[]; bench: OptionPlayer[] } | null {
	if (squad15.length !== 15) return null;
	if (spendOf(squad15) > BUDGET_TOTAL) return null;
	if (!canCoverBenchAndXi(squad15)) return null;

	const byPos: Record<number, OptionPlayer[]> = { 1: [], 2: [], 3: [], 4: [] };
	for (const p of squad15) byPos[p.position]?.push(p);
	for (const pos of [1, 2, 3, 4]) {
		byPos[pos].sort((a, b) => score(b) - score(a) || b.points - a.points);
	}

	const feasible = XI_SHAPES.filter(
		(s) =>
			byPos[2].length >= s.def + 1 &&
			byPos[3].length >= s.mid + 1 &&
			byPos[4].length >= s.fwd + 1 &&
			1 + s.def + s.mid + s.fwd === XI_TOTAL_MAX
	);
	if (!feasible.length) return null;

	let best:
		| {
				xi: OptionPlayer[];
				bench: OptionPlayer[];
				sc: number;
		  }
		| null = null;

	for (const s of feasible) {
		const gkXi = byPos[1][0];
		const xi: OptionPlayer[] = [
			gkXi,
			...byPos[2].slice(0, s.def),
			...byPos[3].slice(0, s.mid),
			...byPos[4].slice(0, s.fwd)
		];
		const used = new Set(xi.map((p) => p.id));
		const remaining = squad15.filter((p) => !used.has(p.id));
		const bench: OptionPlayer[] = [];
		let ok = true;
		for (const pos of [1, 2, 3, 4]) {
			const cand = remaining
				.filter((p) => p.position === pos)
				.sort((a, b) => score(b) - score(a) || a.price - b.price)[0];
			if (!cand) {
				ok = false;
				break;
			}
			bench.push(cand);
		}
		if (!ok || xi.length !== 11 || bench.length !== 4) continue;
		const sc = xi.reduce((a, p) => a + score(p), 0) * 2 + bench.reduce((a, p) => a + score(p) * 0.35, 0);
		if (!best || sc > best.sc) best = { xi, bench, sc };
	}

	return best ? { xi: best.xi, bench: best.bench } : null;
}

function summarize(
	id: string,
	strategy: string,
	title: string,
	blurb: string,
	xi: OptionPlayer[],
	bench: OptionPlayer[],
	transfersUsed: number
): SquadOption {
	const all = [...xi, ...bench];
	const spend = spendOf(all);
	return {
		id,
		strategy,
		title,
		blurb,
		formation: formationLabel(xi),
		xi,
		bench,
		spend,
		remaining: BUDGET_TOTAL - spend,
		totalPoints: xi.reduce((s, p) => s + p.points, 0),
		avgVlfm: all.reduce((s, p) => s + p.vlfm, 0) / all.length,
		avgFixtureEase: xi.reduce((s, p) => s + p.fixtureEase, 0) / xi.length,
		transfersUsed
	};
}

function squadScore(
	xi: OptionPlayer[],
	bench: OptionPlayer[],
	score: ScoreFn,
	rankExtra: (xi: OptionPlayer[]) => number
) {
	return (
		xi.reduce((s, p) => s + score(p), 0) * 2 +
		bench.reduce((s, p) => s + score(p) * 0.35, 0) +
		rankExtra(xi)
	);
}

/** Top inbound candidates per position (keeps search tractable). */
function topInCandidates(pool: OptionPlayer[], inSquad: Set<number>, score: ScoreFn, perPos = 20) {
	const out: OptionPlayer[] = [];
	for (const pos of [1, 2, 3, 4]) {
		out.push(
			...pool
				.filter((p) => p.position === pos && !inSquad.has(p.id))
				.sort((a, b) => score(b) - score(a) || b.points - a.points)
				.slice(0, perPos)
		);
	}
	return out;
}

/**
 * Greedy: up to `maxTransfers` swaps (same or cross-position) that improve score
 * while keeping a legal 15 (bench one-per-pos + some XI shape DEF3–5/MID3–5/FWD1–3).
 */
function improveWithTransfers(
	pool: OptionPlayer[],
	baseXi: OptionPlayer[],
	baseBench: OptionPlayer[],
	score: ScoreFn,
	rankExtra: (xi: OptionPlayer[]) => number,
	maxTransfers: number
): { xi: OptionPlayer[]; bench: OptionPlayer[]; transfersUsed: number } | null {
	const byId = new Map(pool.map((p) => [p.id, p]));
	let current = [...baseXi, ...baseBench].map((p) => byId.get(p.id) ?? p);
	if (current.length !== 15) return null;

	let arranged = arrangeSquad(current, score);
	if (!arranged) {
		arranged = {
			xi: baseXi.map((p) => byId.get(p.id) ?? p),
			bench: baseBench.map((p) => byId.get(p.id) ?? p)
		};
	}

	let transfersUsed = 0;
	let bestScore = squadScore(arranged.xi, arranged.bench, score, rankExtra);

	for (let step = 0; step < maxTransfers; step++) {
		let best: {
			squad: OptionPlayer[];
			xi: OptionPlayer[];
			bench: OptionPlayer[];
			sc: number;
		} | null = null;

		const inSquad = new Set(current.map((p) => p.id));
		const inbound = topInCandidates(pool, inSquad, score, 22);

		for (const outP of current) {
			for (const inn of inbound) {
				const next = current.map((p) => (p.id === outP.id ? inn : p));
				if (spendOf(next) > BUDGET_TOTAL) continue;
				if (!canCoverBenchAndXi(next)) continue;
				const arr = arrangeSquad(next, score);
				if (!arr) continue;
				const sc = squadScore(arr.xi, arr.bench, score, rankExtra);
				if (sc > bestScore + 1e-6 && (!best || sc > best.sc)) {
					best = { squad: next, xi: arr.xi, bench: arr.bench, sc };
				}
			}
		}

		if (!best) break;
		current = best.squad;
		arranged = { xi: best.xi, bench: best.bench };
		bestScore = best.sc;
		transfersUsed++;
	}

	return { xi: arranged.xi, bench: arranged.bench, transfersUsed };
}

export function generateSquadOptions(
	pool: OptionPlayer[],
	baseXiIds: number[],
	baseBenchIds: number[],
	maxTransfers = MAX_TRANSFERS
): SquadOption[] {
	const byId = new Map(pool.map((p) => [p.id, p]));
	const baseXi = baseXiIds.map((id) => byId.get(id)).filter(Boolean) as OptionPlayer[];
	const baseBench = baseBenchIds.map((id) => byId.get(id)).filter(Boolean) as OptionPlayer[];
	if (baseXi.length !== 11 || baseBench.length !== 4) {
		return [];
	}

	const strategies: {
		id: string;
		title: string;
		blurb: string;
		score: ScoreFn;
		rankExtra: (xi: OptionPlayer[]) => number;
	}[] = [
		{
			id: 'points',
			title: 'מקסימום נקודות',
			blurb: `עד ${maxTransfers} חילופים (גם בין עמדות) לשיפור נקודות — מערכים 3–5 / 3–5 / 1–3.`,
			score: (p) => p.points * 2 + p.vlfm,
			rankExtra: (xi) => xi.reduce((s, p) => s + p.points, 0)
		},
		{
			id: 'vlfm',
			title: 'תמורה למחיר (vlfm)',
			blurb: `עד ${maxTransfers} חילופים לשיפור vlfm, כולל שינוי מערך אם משתלם.`,
			score: (p) => p.vlfm * 10 + p.points * 0.15,
			rankExtra: () => 0
		},
		{
			id: 'fixtures',
			title: 'לוח קל',
			blurb: `עד ${maxTransfers} חילופים לקראת יריבות קלות יותר.`,
			score: (p) => p.fixtureEase * 8 + p.points * 0.4,
			rankExtra: (xi) => xi.reduce((s, p) => s + p.fixtureEase, 0) * 3
		},
		{
			id: 'balanced',
			title: 'מאוזן',
			blurb: `עד ${maxTransfers} חילופים — נקודות + vlfm + לוח, עם בחירת מערך אופטימלית.`,
			score: (p) => p.points * 0.8 + p.vlfm * 6 + p.fixtureEase * 4,
			rankExtra: () => 0
		}
	];

	const out: SquadOption[] = [];
	for (const s of strategies) {
		const improved = improveWithTransfers(pool, baseXi, baseBench, s.score, s.rankExtra, maxTransfers);
		if (!improved) continue;
		out.push(
			summarize(
				`${s.id}-t${improved.transfersUsed}-${formationLabel(improved.xi)}`,
				s.id,
				s.title,
				s.blurb,
				improved.xi,
				improved.bench,
				improved.transfersUsed
			)
		);
	}
	return out;
}
