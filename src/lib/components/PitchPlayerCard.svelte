<script lang="ts">
	import FixtureStrip from '$lib/components/FixtureStrip.svelte';
	import { formatPrice } from '$lib/format';
	import { formatVlfm } from '$lib/playerMetrics';
	import { formatPoints } from '$lib/stats';
	import type { DecileInfo } from '$lib/playerMetrics';
	import type { UpcomingFixture } from '$lib/server/upcomingFixtures';

	/**
	 * One player on a pitch / bench — shared by /squad and every LineupCard (/strategies, /options,
	 * /sketches) so they show the same details: logo, name, price, season (last-round) points, vlfm,
	 * optional points decile, and the next fixtures.
	 */
	type Props = {
		name: string;
		price: number;
		/** Season points so far. */
		seasonPts: number | null;
		/** Last round's points (shown in parentheses). */
		roundPts?: number | null;
		logo?: string | null;
		teamName?: string | null;
		upcomingFixtures?: UpcomingFixture[];
		/** Player position (1–4) — fixture rings use the position-specific rating. */
		position?: number | null;
		/** Small label on top (bench slot, e.g. «שוער»). */
		positionLabel?: string | null;
		decile?: DecileInfo | null;
		variant?: 'xi' | 'bench';
		/** Narrower card (4.5rem) so 5 fit a row in multi-column lineup grids. */
		compact?: boolean;
		/** Hover highlight (card sits inside a clickable/draggable button). */
		interactive?: boolean;
		/** Fixture strip popover on focus — off when the card sits inside a button. */
		focusable?: boolean;
	};

	let {
		name,
		price,
		seasonPts,
		roundPts = null,
		logo = null,
		teamName = null,
		upcomingFixtures = [],
		position = null,
		positionLabel = null,
		decile = null,
		variant = 'xi',
		compact = false,
		interactive = false,
		focusable = true
	}: Props = $props();

	const vlfm = $derived(seasonPts != null && price > 0 ? seasonPts / price : null);
</script>

<div
	class="flex {compact
		? 'w-[4.5rem]'
		: 'w-[5rem]'} flex-col items-center overflow-visible rounded-xl border px-1 py-1.5 text-center shadow-lg {variant ===
	'bench'
		? 'border-slate-700 bg-slate-950/80'
		: 'border-white/10 bg-slate-950/75 backdrop-blur-sm'} {interactive
		? 'transition hover:border-emerald-400/50'
		: ''}"
>
	{#if positionLabel}
		<span class="mb-0.5 text-[9px] text-slate-500">{positionLabel}</span>
	{/if}
	<div class="mb-0.5 flex h-7 w-7 items-center justify-center overflow-hidden rounded-full bg-slate-800">
		{#if logo}
			<img src={logo} alt={teamName ?? ''} class="h-6 w-6 object-contain" />
		{:else}
			<span class="text-[10px]">⚽</span>
		{/if}
	</div>
	<span class="line-clamp-2 w-full text-[10px] font-semibold leading-tight text-white" title={name}
		>{name}</span
	>
	<span class="text-[10px] font-semibold tabular-nums text-amber-300">{formatPrice(price)}</span>
	<span class="text-[10px] tabular-nums text-slate-100">{formatPoints(seasonPts, roundPts)}</span>
	<span class="text-[9px] tabular-nums text-violet-200">{formatVlfm(vlfm)} vlfm</span>
	{#if decile}
		<span class="rounded px-1 py-0.5 text-[9px] {decile.className}">{decile.label}</span>
	{/if}
	<div class="mt-1 w-full overflow-visible">
		<FixtureStrip fixtures={upcomingFixtures} slots={5} {position} stacked {focusable} />
	</div>
</div>
