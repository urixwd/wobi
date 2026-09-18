import { getStandings, getMatchdayDetail, getRecordedGameweeks } from '$lib/server/strategyTracking';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
	const gameweeks = await getRecordedGameweeks();
	const requested = Number(url.searchParams.get('gw'));
	const selectedGw =
		Number.isFinite(requested) && gameweeks.includes(requested)
			? requested
			: (gameweeks.at(-1) ?? null);

	return {
		standings: await getStandings(),
		gameweeksAvailable: gameweeks,
		selectedGw,
		detail: selectedGw != null ? await getMatchdayDetail(selectedGw) : null
	};
};
