<script lang="ts">
	import CompactPlayerCard from '$lib/components/CompactPlayerCard.svelte';
	import { enhance } from '$app/forms';
	import type { Snippet } from 'svelte';
	import type { UpcomingFixture } from '$lib/server/upcomingFixtures';
	import type { TransferPlayer } from '$lib/transfers';

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
	type Stat = { label: string; value: string; tone?: string };
	type Props = {
		title: string;
		subtitle?: string | null;
		formation: string;
		badge?: string | null;
		stats?: Stat[];
		xi: CardPlayer[];
		bench?: CardPlayer[];
		out?: TransferPlayer[];
		inn?: TransferPlayer[];
		transfersUsed?: number | null;
		/** When set, always show the transfers box with this header (e.g. «חילופים מול הקבוצה השמורה»). */
		diffLabel?: string | null;
		/** When true, show «הוסף לסקיצה» + «החל על הקבוצה שלי» (needs xi+bench = full 15). */
		actions?: boolean;
		/** With `actions`: hide «הוסף לסקיצה» (pages without a saveSketch action). */
		sketchButton?: boolean;
		sketchName?: string;
		gameweekNumber?: number | null;
		/** Extra header chips (e.g. sketch state). */
		badges?: Snippet;
		/** Extra buttons in the actions row (e.g. «מחק» on /sketches). */
		extraActions?: Snippet;
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
		diffLabel = null,
		actions = false,
		sketchButton = true,
		sketchName = 'סקיצה',
		gameweekNumber = null,
		badges,
		extraActions
	}: Props = $props();

	const byPos = (pos: number) => xi.filter((p) => p.position === pos);
	const xiIds = $derived(xi.map((p) => p.id).join(','));
	const benchIds = $derived(bench.map((p) => p.id).join(','));
	const posLabel: Record<number, string> = { 1: 'שוער', 2: 'הגנה', 3: 'קישור', 4: 'התקפה' };
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
			{@render badges?.()}
			{#if transfersUsed != null}
				<span
					class="rounded-full px-2.5 py-1 text-xs font-medium {transfersUsed === 0
						? 'bg-slate-800 text-slate-300'
						: transfersUsed <= 3
							? 'bg-emerald-500/20 text-emerald-300'
							: 'bg-red-500/20 text-red-300'}">{transfersUsed} חילופים</span
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
		{#if !xi.length}<p class="text-center text-xs text-slate-500">הרכב ריק</p>{/if}
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
							position={p.position}
						/>
					{/each}
				</div>
			{/if}
		{/each}
	</div>

	{#if bench.length}
		<div>
			<div class="mb-1 text-xs text-slate-500">ספסל</div>
			<div class="flex flex-wrap gap-2">
				{#each bench as p (p.id)}
					<CompactPlayerCard
						variant="bench"
						name={p.name}
						price={p.price}
						points={p.points}
						logo={p.logo}
						teamName={p.teamName}
						position={p.position}
						positionLabel={posLabel[p.position]}
					/>
				{/each}
			</div>
		</div>
	{/if}

	{#if diffLabel}
		<div class="rounded-xl border border-slate-700/80 bg-slate-950/50 p-3">
			<div class="mb-2 text-xs font-medium text-slate-400">
				{diffLabel}
				<span class="text-slate-500">· {out.length} יוצאים / {inn.length} נכנסים</span>
			</div>
			{#if out.length === 0 && inn.length === 0}
				<p class="text-xs text-slate-500">ללא חילופים</p>
			{:else}
				<div class="grid gap-3 sm:grid-cols-2">
					<div>
						<div class="mb-1 text-[11px] text-red-300">יוצאים</div>
						<ul class="space-y-0.5 text-xs text-slate-200">
							{#each out as p (p.id)}
								<li class="truncate">
								{p.name}{#if p.detail}<span class="text-slate-500"> · {p.detail}</span>{/if}
							</li>
							{:else}
								<li class="text-slate-500">—</li>
							{/each}
						</ul>
					</div>
					<div>
						<div class="mb-1 text-[11px] text-emerald-300">נכנסים</div>
						<ul class="space-y-0.5 text-xs text-slate-200">
							{#each inn as p (p.id)}
								<li class="truncate">
								{p.name}{#if p.detail}<span class="text-slate-500"> · {p.detail}</span>{/if}
							</li>
							{:else}
								<li class="text-slate-500">—</li>
							{/each}
						</ul>
					</div>
				</div>
			{/if}
		</div>
	{:else if out.length || inn.length}
		<div class="grid gap-3 rounded-xl border border-slate-700/80 bg-slate-950/50 p-3 sm:grid-cols-2">
			<div>
				<div class="mb-1 text-[11px] text-red-300">יוצאים</div>
				<ul class="space-y-0.5 text-xs text-slate-200">
					{#each out as p (p.id)}
						<li class="truncate">
								{p.name}{#if p.detail}<span class="text-slate-500"> · {p.detail}</span>{/if}
							</li>
					{:else}
						<li class="text-slate-500">—</li>
					{/each}
				</ul>
			</div>
			<div>
				<div class="mb-1 text-[11px] text-emerald-300">נכנסים</div>
				<ul class="space-y-0.5 text-xs text-slate-200">
					{#each inn as p (p.id)}
						<li class="truncate">
								{p.name}{#if p.detail}<span class="text-slate-500"> · {p.detail}</span>{/if}
							</li>
					{:else}
						<li class="text-slate-500">—</li>
					{/each}
				</ul>
			</div>
		</div>
	{/if}

	{#if actions || extraActions}
		<div class="mt-auto flex flex-wrap gap-2 pt-1">
			{#if actions}
			{#if sketchButton}
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
			{/if}
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
			{/if}
			{@render extraActions?.()}
		</div>
	{/if}
</article>
