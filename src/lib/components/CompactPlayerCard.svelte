<script lang="ts">
	import FixtureStrip from '$lib/components/FixtureStrip.svelte';
	import { formatPrice } from '$lib/format';
	import type { UpcomingFixture } from '$lib/server/upcomingFixtures';

	type Props = {
		name: string;
		price: number;
		points: number;
		logo?: string | null;
		teamName?: string | null;
		upcomingFixtures?: UpcomingFixture[];
		/** Bench variant: show position label on top */
		positionLabel?: string | null;
		variant?: 'xi' | 'bench';
	};

	let {
		name,
		price,
		points,
		logo = null,
		teamName = null,
		upcomingFixtures = [],
		positionLabel = null,
		variant = 'xi'
	}: Props = $props();
</script>

{#if variant === 'bench'}
	<div class="min-w-[6rem] flex-1 rounded-lg border border-slate-700 bg-slate-800/60 px-2 py-1 text-center">
		{#if positionLabel}
			<div class="text-[10px] text-slate-500">{positionLabel}</div>
		{/if}
		<div class="mx-auto mb-0.5 flex h-6 w-6 items-center justify-center overflow-hidden rounded-full bg-white">
			{#if logo}
				<img src={logo} alt={teamName ?? ''} class="h-5 w-5 object-contain" />
			{:else}
				<span class="text-[8px] text-slate-500">⚽</span>
			{/if}
		</div>
		<div class="truncate text-xs text-white" title={name}>{name}</div>
		<div class="text-[10px] text-slate-400">{formatPrice(price)} · {points} נק׳</div>
	</div>
{:else}
	<div
		class="w-[5.5rem] rounded-lg border border-slate-600/60 bg-slate-900/90 px-1.5 py-1 text-center"
	>
		<div class="mx-auto mb-0.5 flex h-6 w-6 items-center justify-center overflow-hidden rounded-full bg-white">
			{#if logo}
				<img src={logo} alt={teamName ?? ''} class="h-5 w-5 object-contain" />
			{:else}
				<span class="text-[8px] text-slate-500">⚽</span>
			{/if}
		</div>
		<div class="truncate text-[11px] font-medium text-white" title={name}>{name}</div>
		<div class="text-[10px] text-amber-200/90">{formatPrice(price)}</div>
		<div class="text-[10px] text-sky-300/90">{points} נק׳</div>
		<div class="mt-0.5 flex justify-center">
			<FixtureStrip fixtures={upcomingFixtures} size="sm" />
		</div>
	</div>
{/if}
