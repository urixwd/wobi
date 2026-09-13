import type { FixtureDifficulty, Player, Team } from '$lib/server/db/schema';

export type Suggestion = {
	outPlayer: Player & { teamName?: string };
	inPlayer: Player & { teamName?: string };
	reason: string;
	score: number;
};

function availabilityPenalty(p: Player): number {
	let n = 0;
	if (p.injuredStatus) n += 40;
	if (p.expelledStatus) n += 50;
	if (p.missingStatus) n += 25;
	return n;
}

function lastRoundPoints(p: Player): number {
	const stats = p.lastRoundPlayerStats as { points?: number; totalPoints?: number } | null;
	if (!stats) return 0;
	return Number(stats.points ?? stats.totalPoints ?? 0) || 0;
}

function difficultyScore(d: FixtureDifficulty | undefined): number {
	if (d === 'green') return 12;
	if (d === 'yellow') return 4;
	if (d === 'red') return -8;
	return 0;
}

/**
 * Heuristic transfer suggestions (max 3).
 * Prefers: replace injured/missing/expelled, upgrade form, easier upcoming opponent.
 */
export function suggestTransfers(opts: {
	squadIds: number[];
	players: Player[];
	teamsById: Map<number, Team>;
	/** Opponent difficulty for each team in the current/upcoming GW */
	opponentDifficultyByTeamId?: Map<number, FixtureDifficulty>;
	max?: number;
}): Suggestion[] {
	const max = opts.max ?? 3;
	const squadSet = new Set(opts.squadIds);
	const byId = new Map(opts.players.map((p) => [p.id, p]));
	const squad = opts.squadIds.map((id) => byId.get(id)).filter(Boolean) as Player[];
	const pool = opts.players.filter((p) => !squadSet.has(p.id));

	const outCandidates = [...squad].sort(
		(a, b) =>
			availabilityPenalty(b) - availabilityPenalty(a) ||
			lastRoundPoints(a) - lastRoundPoints(b) ||
			a.price - b.price
	);

	const suggestions: Suggestion[] = [];
	const usedIn = new Set<number>();
	const usedOut = new Set<number>();

	for (const out of outCandidates) {
		if (suggestions.length >= max) break;
		if (usedOut.has(out.id)) continue;

		const outDiff = opts.opponentDifficultyByTeamId?.get(out.teamId);
		const outScore =
			availabilityPenalty(out) - lastRoundPoints(out) * 0.5 - difficultyScore(outDiff);

		const candidates = pool
			.filter((p) => p.position === out.position && !usedIn.has(p.id))
			.filter((p) => !p.injuredStatus && !p.expelledStatus)
			.map((p) => {
				const inDiff = opts.opponentDifficultyByTeamId?.get(p.teamId);
				const score =
					lastRoundPoints(p) * 0.8 +
					difficultyScore(inDiff) -
					availabilityPenalty(p) +
					(p.price <= out.price + 0.5 ? 3 : 0) -
					Math.max(0, p.price - out.price) * 2 +
					outScore * 0.3;
				return { p, score };
			})
			.sort((a, b) => b.score - a.score);

		const best = candidates[0];
		if (!best || best.score < 5) continue;

		const reasons: string[] = [];
		if (out.injuredStatus) reasons.push('פצוע בהרכב');
		else if (out.expelledStatus) reasons.push('מורחק');
		else if (out.missingStatus) reasons.push('חסר');
		else reasons.push('שדרוג צפוי');

		const inDiff = opts.opponentDifficultyByTeamId?.get(best.p.teamId);
		if (inDiff === 'green') reasons.push('יריבה קלה');
		if (lastRoundPoints(best.p) > lastRoundPoints(out)) reasons.push('פורם טוב יותר');

		suggestions.push({
			outPlayer: { ...out, teamName: opts.teamsById.get(out.teamId)?.name },
			inPlayer: { ...best.p, teamName: opts.teamsById.get(best.p.teamId)?.name },
			reason: reasons.join(' · '),
			score: best.score
		});
		usedIn.add(best.p.id);
		usedOut.add(out.id);
	}

	return suggestions.slice(0, max);
}
