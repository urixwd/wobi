<script lang="ts">
	import { DIFFICULTY_RING, difficultyFor } from '$lib/difficulty';
	import type { UpcomingFixture } from '$lib/server/upcomingFixtures';

	type Props = {
		fixtures?: UpcomingFixture[];
		/** Total circles to show (empty placeholders fill the rest). */
		slots?: number;
		size?: 'sm' | 'md';
		/** The player's position (1–4): colours by the vs-defence / vs-attack rating. Absent → overall. */
		position?: number | null;
		/**
		 * Overlapping logos (closest on top, no ב/ח letters) to fit narrow cards; hover / focus / tap
		 * shows the full strip in a popover.
		 */
		stacked?: boolean;
		/** With `stacked`: keyboard/tap focus opens the popover. Off when the strip sits inside a button. */
		focusable?: boolean;
	};

	let {
		fixtures = [],
		slots = 5,
		size = 'sm',
		position = null,
		stacked = false,
		focusable = true
	}: Props = $props();

	/** Closest first → with dir=rtl the first item sits on the RIGHT. */
	const shown = $derived(fixtures.slice(0, slots));
	const cells = $derived(Array.from({ length: slots }, (_, i) => shown[i] ?? null));
	const TITLE = '5 המחזורים הבאים (ימין = הקרוב) · ב=בית ח=חוץ';
</script>

{#snippet circle(fx: UpcomingFixture | null, sz: 'sm' | 'md')}
	{#if fx}
		<div
			class="flex {sz === 'md' ? 'h-6 w-6' : 'h-4 w-4'} items-center justify-center overflow-hidden rounded-full bg-white ring-2 {DIFFICULTY_RING[
				difficultyFor(fx, position)
			]}"
		>
			{#if fx.opponentLogo}
				<img
					src={fx.opponentLogo}
					alt={fx.opponentName}
					class="{sz === 'md' ? 'h-5 w-5' : 'h-[14px] w-[14px]'} object-contain"
				/>
			{:else}
				<span class="text-[7px] text-slate-500">⚽</span>
			{/if}
		</div>
	{:else}
		<div
			class="flex {sz === 'md' ? 'h-6 w-6' : 'h-4 w-4'} items-center justify-center rounded-full border border-dashed border-slate-500/70 bg-slate-900"
		></div>
	{/if}
{/snippet}

{#snippet strip(sz: 'sm' | 'md')}
	<div class="flex w-max max-w-full flex-row flex-nowrap items-end justify-end gap-0.5" dir="rtl" title={TITLE}>
		{#each cells as fx, i (i)}
			<div
				class="flex shrink-0 flex-col items-center gap-0.5"
				title={fx ? `${fx.isHome ? 'בית' : 'חוץ'} נגד ${fx.opponentName} · מחזור ${fx.gameweekNumber}` : 'אין משחק עדיין במסד'}
				aria-hidden={fx ? undefined : 'true'}
			>
				{@render circle(fx, sz)}
				<span
					class="{sz === 'md' ? 'text-[9px]' : 'text-[8px]'} font-bold leading-none {fx
						? fx.isHome
							? 'text-sky-300'
							: 'text-orange-300/90'
						: 'text-transparent'}"
				>
					{fx ? (fx.isHome ? 'ב' : 'ח') : '·'}
				</span>
			</div>
		{/each}
	</div>
{/snippet}

{#snippet stackedInner()}
	<div class="flex flex-row flex-nowrap items-center" dir="rtl">
		{#each cells as fx, i (i)}
			<div class="shrink-0 rounded-full {i ? '-ms-1.5' : ''}" style="z-index:{slots - i}">
				{@render circle(fx, size)}
			</div>
		{/each}
	</div>
	<div
		class="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5 hidden -translate-x-1/2 rounded-lg border border-slate-700 bg-slate-950 p-1.5 shadow-2xl group-hover/fx:block group-focus/fx:block"
	>
		{@render strip('md')}
	</div>
{/snippet}

<!-- Named group (group/fx) so a hover-group ancestor (e.g. a card) doesn't open it. -->
{#if stacked && focusable}
	<!-- Focusable: keyboard / tap opens the popover too. -->
	<div class="group/fx relative inline-flex outline-none" tabindex="0" role="button" aria-label={TITLE}>
		{@render stackedInner()}
	</div>
{:else if stacked}
	<!-- Inside a button already: hover only. -->
	<div class="group/fx relative inline-flex" title={TITLE}>
		{@render stackedInner()}
	</div>
{:else}
	{@render strip(size)}
{/if}
