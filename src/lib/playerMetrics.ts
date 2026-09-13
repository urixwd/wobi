/** Show 3-round momentum in UI starting from this gameweek. */
export const MOMENTUM_FROM_GW = 7;

import { seasonPoints, lastRoundPoints } from '$lib/stats';

type Statsish = {
	lastRoundPlayerStats?: unknown;
	lastSeasonPlayerStats?: unknown;
	price?: number;
	id?: number;
};

export type DecileInfo = {
	/** 1 = bottom 10%, 10 = top 10% */
	decile: number;
	label: string;
	/** Tailwind text/bg classes */
	className: string;
};

const DECILE_META: Record<number, { label: string; className: string }> = {
	10: { label: 'עליון', className: 'bg-emerald-500/25 text-emerald-200' },
	9: { label: '9', className: 'bg-lime-500/20 text-lime-200' },
	8: { label: '8', className: 'bg-lime-500/15 text-lime-300/90' },
	7: { label: '7', className: 'bg-yellow-400/20 text-yellow-200' },
	6: { label: '6', className: 'bg-yellow-500/15 text-yellow-300/90' },
	5: { label: '5', className: 'bg-slate-500/25 text-slate-300' },
	4: { label: '4', className: 'bg-orange-500/15 text-orange-300/90' },
	3: { label: '3', className: 'bg-orange-500/20 text-orange-200' },
	2: { label: '2', className: 'bg-red-500/15 text-red-300/90' },
	1: { label: 'תחתון', className: 'bg-red-500/25 text-red-200' }
};

/** Points per million — higher is better value. */
export function vlfm(p: Statsish): number | null {
	const pts = seasonPoints(p);
	const price = Number(p.price);
	if (pts == null || !price || price <= 0) return null;
	return pts / price;
}

export function formatVlfm(v: number | null): string {
	if (v == null || !Number.isFinite(v)) return '—';
	return v.toFixed(2);
}

/**
 * Build id → decile for a pool (sorted by season points ascending).
 * Players with null/0 points still get a decile among the pool.
 */
export function buildPointsDeciles(players: Statsish[]): Map<number, DecileInfo> {
	const rows = players
		.map((p) => ({ id: Number(p.id), pts: seasonPoints(p) ?? 0 }))
		.filter((r) => Number.isFinite(r.id) && r.id > 0)
		.sort((a, b) => a.pts - b.pts || a.id - b.id);

	const map = new Map<number, DecileInfo>();
	const n = rows.length;
	if (!n) return map;

	for (let i = 0; i < n; i++) {
		// percentile rank 0..1 then ceil to 1..10
		const pct = n === 1 ? 1 : i / (n - 1);
		const decile = Math.min(10, Math.max(1, Math.ceil(pct * 10) || 1));
		// top scorers should be 10: because sorted ascending, high i → high decile
		const meta = DECILE_META[decile];
		map.set(rows[i].id, { decile, label: meta.label, className: meta.className });
	}
	return map;
}

/**
 * Rough momentum without 3-round history:
 * last-round points vs average points per played round so far.
 * Positive = last round above season pace.
 */
/** @deprecated Prefer player_round_stats history from GW7. */
export function momentumProxy(p: Statsish): number | null {
	const season = seasonPoints(p);
	const last = lastRoundPoints(p);
	if (season == null || last == null) return null;
	// Estimate rounds played: seasonPoints / avg — we don't have round count.
	// Use: last - (season - last) / max(1, assumedPriorRounds)
	// Simpler signal: lastRound / max(season/3, 1) when ~3 rounds played, or last - season/n
	// With only current season early: compare last to mean of season so far.
	// If season == last (only one round of scoring), momentum = 0.
	if (season === last) return 0;
	const prior = season - last;
	// assume prior spread over at least 1 round
	const priorAvg = prior; // unknown rounds — treat prior total as one lump vs last is weak
	// Better: lastRound share of season — high share after many rounds = hot
	// Use delta: last - season/maxRoundsEstimate. Early season use /3 as stand-in for "recent window".
	const avgSoFar = season / 3; // early-season proxy until we store history
	return last - avgSoFar;
}
