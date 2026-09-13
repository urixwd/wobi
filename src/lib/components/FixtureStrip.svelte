<script lang="ts">
	import { DIFFICULTY_RING } from '$lib/difficulty';
	import type { UpcomingFixture } from '$lib/server/upcomingFixtures';

	type Props = {
		fixtures?: UpcomingFixture[];
		/** Total circles to show (empty placeholders fill the rest). */
		slots?: number;
		size?: 'sm' | 'md';
	};

	let { fixtures = [], slots = 5, size = 'sm' }: Props = $props();

	/** Closest first → with dir=rtl the first item sits on the RIGHT. */
	const shown = $derived(fixtures.slice(0, slots));
	const dim = $derived(size === 'md' ? 'h-6 w-6' : 'h-4 w-4');
	const img = $derived(size === 'md' ? 'h-5 w-5' : 'h-[14px] w-[14px]');
</script>

<div
	class="flex w-max max-w-full flex-row flex-nowrap items-center justify-end gap-0.5"
	dir="rtl"
	title="5 המחזורים הבאים (ימין = הקרוב)"
>
	{#each Array.from({ length: slots }, (_, i) => shown[i] ?? null) as fx, i (i)}
		{#if fx}
			<div
				class="flex {dim} shrink-0 items-center justify-center overflow-hidden rounded-full bg-white ring-2 {DIFFICULTY_RING[fx.difficulty]}"
				title="{fx.isHome ? 'בית' : 'חוץ'} נגד {fx.opponentName} · מחזור {fx.gameweekNumber}"
			>
				{#if fx.opponentLogo}
					<img src={fx.opponentLogo} alt={fx.opponentName} class="{img} object-contain" />
				{:else}
					<span class="text-[7px] text-slate-500">⚽</span>
				{/if}
			</div>
		{:else}
			<div
				class="flex {dim} shrink-0 items-center justify-center rounded-full border border-dashed border-slate-500/70 bg-slate-900/50"
				title="אין משחק עדיין במסד"
				aria-hidden="true"
			></div>
		{/if}
	{/each}
</div>
