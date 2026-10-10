import type { Player } from '$lib/server/db/schema';
import type { UpcomingFixture } from '$lib/server/upcomingFixtures';

/** One player row as returned by /watchlist load (player + team + next fixtures). */
export type PoolRow = {
	player: Player;
	teamName: string | null;
	teamLogo: string | null;
	upcomingFixtures: UpcomingFixture[];
};

export type WatchList = 'permanent' | 'round';

export type Membership = {
	permanent: boolean;
	round: boolean;
	squad: 'xi' | 'bench' | null;
};

/** Treat geresh/apostrophe/quote variants as the same so "ג׳יימס" finds "ג`יימס". */
export function normalizeSearch(s: string): string {
	return s.replace(/[`'׳’‘"״“”]/g, '').trim();
}

