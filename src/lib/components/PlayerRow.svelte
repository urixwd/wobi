<script lang="ts">
	import { positionLabel } from '$lib/positions';
	import { DIFFICULTY_BG, DIFFICULTY_LABEL, DIFFICULTY_RING } from '$lib/difficulty';
	import type { FixtureDifficulty } from '$lib/server/db/schema';

	type Props = {
		name: string;
		teamName?: string | null;
		position: number;
		price: number;
		points?: number | null;
		logoPath?: string | null;
		difficulty?: FixtureDifficulty | null;
		injured?: boolean;
		expelled?: boolean;
		missing?: boolean;
		selected?: boolean;
		onclick?: () => void;
	};

	let {
		name,
		teamName,
		position,
		price,
		points = null,
		logoPath = null,
		difficulty = null,
		injured = false,
		expelled = false,
		missing = false,
		selected = false,
		onclick
	}: Props = $props();
</script>

<button
	type="button"
	class="flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-right transition
		{selected ? 'border-emerald-500 bg-emerald-500/10' : 'border-slate-800 bg-slate-900/60 hover:border-slate-600'}
		{onclick ? 'cursor-pointer' : 'cursor-default'}"
	{onclick}
	disabled={!onclick}
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
	</div>
	<div class="flex shrink-0 flex-col items-end gap-1 text-xs">
		<span class="rounded bg-slate-800 px-1.5 py-0.5">{price.toFixed(1)}m</span>
		{#if points != null}
			<span class="text-slate-300">{points} נק׳</span>
		{/if}
		{#if difficulty}
			<span class="rounded px-1.5 py-0.5 {DIFFICULTY_BG[difficulty]}">{DIFFICULTY_LABEL[difficulty]}</span>
		{/if}
		<div class="flex gap-1">
			{#if injured}<span class="text-red-400" title="פצוע">🤕</span>{/if}
			{#if expelled}<span class="text-orange-400" title="מורחק">🟥</span>{/if}
			{#if missing}<span class="text-yellow-300" title="חסר">❓</span>{/if}
		</div>
	</div>
</button>
