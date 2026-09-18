<script lang="ts">
	import CompactPlayerCard from '$lib/components/CompactPlayerCard.svelte';
	import { enhance } from '$app/forms';
	import type { UpcomingFixture } from '$lib/server/upcomingFixtures';

	type CardPlayer = {
		id: number;
		name: string;
		price: number;
		points: number;
		position: number;
		logo?: string | null;
		teamName?: string | null;
		upcomingFixtures?: UpcomingFixture[];
	};
	type NamePlayer = { id: number; name: string };
	type Stat = { label: string; value: string; tone?: string };
	type Props = {
		title: string;
		subtitle?: string | null;
		formation: string;
		badge?: string | null;
		stats?: Stat[];
		xi: CardPlayer[];
		bench?: CardPlayer[];
		out?: NamePlayer[];
		inn?: NamePlayer[];
		transfersUsed?: number | null;
		/** When true, show «הוסף לסקיצה» + «החל על הקבוצה שלי» (needs xi+bench = full 15). */
		actions?: boolean;
		sketchName?: string;
		gameweekNumber?: number | null;
	};

	let {
		title,
		subtitle = null,
		formation,
		badge = null,
		stats = [],
		xi,
		bench = [],
		out = [],
		inn = [],
		transfersUsed = null,
		actions = false,
		sketchName = 'סקיצה',
		gameweekNumber = null
	}: Props = $props();

	const byPos = (pos: number) => xi.filter((p) => p.position === pos);
	const xiIds = $derived(xi.map((p) => p.id).join(','));
	const benchIds = $derived(bench.map((p) => p.id).join(','));
</script>

<article class="flex flex-col gap-3 rounded-2xl border border-slate-700/80 bg-slate-900/70 p-4 shadow-lg">
	<div class="flex flex-wrap items-start justify-between gap-2">
		<div>
			<h3 class="text-base font-semibold text-emerald-300">{title}</h3>
			{#if subtitle}<p class="text-xs text-slate-400">{subtitle}</p>{/if}
		</div>
		<div class="flex flex-wrap gap-1.5">
			{#if badge}
				<span class="rounded-full bg-sky-500/20 px-2.5 py-1 text-xs font-medium text-sky-300">{badge}</span>
			{/if}
			{#if transfersUsed != null}
				<span class="rounded-full bg-emerald-500/20 px-2.5 py-1 text-xs font-medium text-emerald-300"
					>{transfersUsed} חילופים</span
				>
			{/if}
			<span class="rounded-full bg-slate-800 px-2.5 py-1 text-xs font-medium text-slate-200">{formation}</span>
		</div>
	</div>

	{#if stats.length}
		<div class="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
			{#each stats as s}
				<div class="rounded-lg bg-slate-800/80 px-2 py-1.5">
					<div class="text-[10px] text-slate-500">{s.label}</div>
					<div class="font-semibold {s.tone ?? 'text-white'}">{s.value}</div>
				</div>
			{/each}
		</div>
	{/if}

	<div class="space-y-2 rounded-xl bg-gradient-to-b from-emerald-950/40 to-slate-950/60 p-3">
		{#each [1, 2, 3, 4] as pos}
			{#if byPos(pos).length}
				<div class="flex flex-wrap justify-center gap-2">
					{#each byPos(pos) as p (p.id)}
						<CompactPlayerCard
							name={p.name}
							price={p.price}
							points={p.points}
							logo={p.logo}
							teamName={p.teamName}
							upcomingFixtures={p.upcomingFixtures}
						/>
					{/each}
				</div>
			{/if}
		{/each}
	</div>

	{#if out.length || inn.length}
		<div class="grid gap-3 rounded-xl border border-slate-700/80 bg-slate-950/50 p-3 sm:grid-cols-2">
			<div>
				<div class="mb-1 text-[11px] text-red-300">יוצאים</div>
				<ul class="space-y-0.5 text-xs text-slate-200">
					{#each out as p (p.id)}
						<li class="truncate">{p.name}</li>
					{:else}
						<li class="text-slate-500">—</li>
					{/each}
				</ul>
			</div>
			<div>
				<div class="mb-1 text-[11px] text-emerald-300">נכנסים</div>
				<ul class="space-y-0.5 text-xs text-slate-200">
					{#each inn as p (p.id)}
						<li class="truncate">{p.name}</li>
					{:else}
						<li class="text-slate-500">—</li>
					{/each}
				</ul>
			</div>
		</div>
	{/if}

	{#if actions}
		<div class="mt-auto flex flex-wrap gap-2 pt-1">
			<form method="POST" action="?/saveSketch" use:enhance class="flex-1">
				<input type="hidden" name="xi" value={xiIds} />
				<input type="hidden" name="bench" value={benchIds} />
				<input type="hidden" name="sketchName" value={sketchName} />
				{#if gameweekNumber != null}
					<input type="hidden" name="gameweekNumber" value={gameweekNumber} />
				{/if}
				<button
					type="submit"
					class="w-full rounded-xl bg-slate-700 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-600"
				>
					הוסף לסקיצה
				</button>
			</form>
			<form method="POST" action="?/apply" use:enhance class="flex-1">
				<input type="hidden" name="xi" value={xiIds} />
				<input type="hidden" name="bench" value={benchIds} />
				<button
					type="submit"
					class="w-full rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
				>
					החל על הקבוצה שלי
				</button>
			</form>
		</div>
	{/if}
</article>
