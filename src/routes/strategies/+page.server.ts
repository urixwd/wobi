import { getStandings } from '$lib/server/strategyTracking';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	return { standings: await getStandings() };
};
