<script lang="ts">
	import { positionLabel } from '$lib/positions';
	import { formatPrice } from '$lib/format';
	import {
		formatPointsLabel,
		lastRoundPoints,
		playerStatLines,
		seasonPoints
	} from '$lib/stats';
	import { DIFFICULTY_BG, DIFFICULTY_LABEL, DIFFICULTY_RING } from '$lib/difficulty';
	import type { FixtureDifficulty } from '$lib/server/db/schema';
	import type { UpcomingFixture } from '$lib/server/upcomingFixtures';
	import FixtureStrip from '$lib/components/FixtureStrip.svelte';
	import PlayerStatsPanel from '$lib/components/PlayerStatsPanel.svelte';

	type Statsish = {
		lastRoundPlayerStats?: unknown;
		lastSeasonPlayerStats?: unknown;
	};

	type Props = {
		name: string;
		teamName?: string | null;
		position: number;
		price: number;
		playerStats?: Statsish | null;
		points?: number | null;
		logoPath?: string | null;
		difficulty?: FixtureDifficulty | null;
		injured?: boolean;
		expelled?: boolean;
		missing?: boolean;
		selected?: boolean;
		upcomingFixtures?: UpcomingFixture[];
		/** Show X (top-left) and call on remove */
		onRemove?: () => void;
	};

	let {
		name,
		teamName,
		position,
		price,
		playerStats = null,
		points = null,
		logoPath = null,
		difficulty = null,
		injured = false,
		expelled = false,
		missing = false,
		selected = false,
		upcomingFixtures = [],
		onRemove
	}: Props = $props();

	let open = $state(false);

	const label = $derived(
		playerStats ? formatPointsLabel(playerStats) : `${points ?? 0} נק׳`
	);
	const lines = $derived(playerStats ? playerStatLines(playerStats) : []);
	const roundPts = $derived(playerStats ? lastRoundPoints(playerStats) : null);
	const seasonPts = $derived(playerStats ? seasonPoints(playerStats) : points);

	function onCardClick() {
		open = !open;
	}

	function remove(e: MouseEvent) {
		e.stopPropagation();
		e.preventDefault();
		open = false;
		onRemove?.();
	}
</script>

<div class="relative" class:z-[90]={open}>
	{#if onRemove}
		<button
			type="button"
			class="absolute left-1 top-1 z-20 flex h-5 w-5 items-center justify-center rounded-md bg-slate-700/90 text-sm font-medium text-slate-200 shadow hover:bg-slate-600 hover:text-white"
			title="הסרה"
			onclick={remove}
		>
			×
		</button>
	{/if}

	<button
		type="button"
		class="flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-right transition
			{selected ? 'border-emerald-500 bg-emerald-500/10' : 'border-slate-800 bg-slate-900/60 hover:border-slate-600'}
			{onRemove ? 'pr-3 pl-7' : ''}"
		onclick={onCardClick}
		title="לחצו לפירוט נקודות"
	>
		<div
			class="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-800 ring-2
				{difficulty ? DIFFICULTY_RING[difficulty] : 'ring-slate-700'}"
		>
			{#if logoPath}
				<img src={logoPath} alt="" class="h-8 w-8 object-contain" />
			{:else}
				<span class="text-xs text-slate-500">⚽</span>
			{/if}
		</div>
		<div class="min-w-0 flex-1">
			<div class="truncate font-medium">{name}</div>
			<div class="truncate text-xs text-slate-400">
				{positionLabel(position)}
				{#if teamName}· {teamName}{/if}
			</div>
			<div class="mt-1">
				<FixtureStrip fixtures={upcomingFixtures} />
			</div>
		</div>
		<div class="flex shrink-0 flex-col items-end gap-1 text-xs">
			<div class="flex items-center gap-1">
				<span class="rounded bg-slate-800 px-1.5 py-0.5" title="מחיר">{formatPrice(price)}</span>
				<span class="rounded bg-sky-500/20 px-1.5 py-0.5 text-sky-200" title="עונה (מחזור אחרון)"
					>{label}</span
				>
			</div>
			{#if difficulty}
				<span class="rounded px-1.5 py-0.5 {DIFFICULTY_BG[difficulty]}">{DIFFICULTY_LABEL[difficulty]}</span>
			{/if}
			<div class="flex gap-1">
				{#if injured}<span class="text-red-400" title="פצוע">🤕</span>{/if}
				{#if expelled}<span class="text-orange-400" title="מורחק">🟥</span>{/if}
				{#if missing}<span class="rounded bg-yellow-500/20 px-1 py-0.5 text-[10px] text-yellow-200" title="נעדר">נעדר</span>{/if}
			</div>
		</div>
	</button>

	{#if open}
		<div
			class="absolute left-0 top-full z-[100] mt-1 w-[min(100%,16rem)] max-w-[16rem] overflow-hidden rounded-xl border border-slate-700 bg-slate-950 p-3 shadow-2xl"
			role="dialog"
		>
			<PlayerStatsPanel {lines} roundPoints={roundPts} seasonPts={seasonPts} />
		</div>
	{/if}
</div>
