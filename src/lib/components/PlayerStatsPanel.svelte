<script lang="ts">
	import type { StatLine } from '$lib/stats';

	type Props = {
		lines: StatLine[];
		roundPoints?: number | null;
		seasonPts?: number | null;
	};

	let { lines, roundPoints = null, seasonPts = null }: Props = $props();
</script>

{#if lines.length === 0 && roundPoints == null && seasonPts == null}
	<p class="text-xs text-slate-400">אין פירוט נקודות עדיין</p>
{:else}
	<div class="w-full max-w-[16rem] space-y-1.5 overflow-hidden text-right text-xs">
		{#if seasonPts != null || roundPoints != null}
			<div class="border-b border-slate-700 pb-1.5 leading-relaxed text-slate-200">
				{#if seasonPts != null}
					<div class="flex justify-between gap-2">
						<span class="text-slate-400">עונה</span>
						<b class="tabular-nums">{seasonPts}</b>
					</div>
				{/if}
				{#if roundPoints != null}
					<div class="flex justify-between gap-2">
						<span class="text-slate-400">מחזור אחרון</span>
						<b class="tabular-nums">{roundPoints}</b>
					</div>
				{/if}
			</div>
		{/if}
		{#each lines as line}
			<div class="grid grid-cols-[1fr_auto] items-baseline gap-x-2 gap-y-0.5">
				<span class="min-w-0 truncate text-slate-400" title={line.label}>{line.label}</span>
				<span class="shrink-0 tabular-nums text-slate-200">
					{line.count}
					<span class="text-slate-500">·</span>
					<span class={line.points >= 0 ? 'text-emerald-300' : 'text-red-300'}
						>{line.points > 0 ? '+' : ''}{line.points}</span
					>
				</span>
			</div>
		{/each}
	</div>
{/if}
