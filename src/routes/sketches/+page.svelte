<script lang="ts">
	import { onMount } from 'svelte';
	import LineupCard from '$lib/components/LineupCard.svelte';
	import { formationLabel } from '$lib/positions';
	import { isExactSquad, readSquadDraft, type SquadDraft } from '$lib/squadDraft';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let draft = $state<SquadDraft | null>(null);

	onMount(() => {
		draft = readSquadDraft();
	});

	function matchesDraft(s: PageData['sketches'][number]): boolean {
		if (!draft) return false;
		return isExactSquad(s.xiPlayerIds, s.benchPlayerIds, draft.xi, draft.bench);
	}
</script>

<svelte:head>
	<title>סקיצות · מחזור {data.gw} · WOBI</title>
</svelte:head>

<div class="space-y-6" dir="rtl">
	<header class="flex flex-wrap items-center justify-between gap-3">
		<div>
			<h1 class="text-2xl font-bold text-white">סקיצות</h1>
			<p class="text-sm text-slate-400">
				טיוטות הרכב לפי מחזור. אפשר לשמור גם הרכב חלקי (WIP) ממסך הקבוצה.
			</p>
		</div>
		<nav class="flex items-center gap-2">
			{#if data.gw > data.minGw}
				<a
					href="/sketches?gw={data.gw - 1}"
					class="rounded-lg border border-slate-600 bg-slate-800 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-700"
				>
					→ מחזור קודם
				</a>
			{:else}
				<span class="rounded-lg border border-slate-800 px-3 py-1.5 text-sm text-slate-600">→ מחזור קודם</span>
			{/if}
			<span class="rounded-full bg-slate-800 px-3 py-1 text-sm font-medium text-emerald-300">
				מחזור {data.gw}
				{#if data.gw === data.currentGw}
					<span class="text-slate-400">· נוכחי</span>
				{/if}
			</span>
			{#if data.gw < data.maxGw}
				<a
					href="/sketches?gw={data.gw + 1}"
					class="rounded-lg border border-slate-600 bg-slate-800 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-700"
				>
					מחזור הבא ←
				</a>
			{:else}
				<span class="rounded-lg border border-slate-800 px-3 py-1.5 text-sm text-slate-600">מחזור הבא ←</span>
			{/if}
		</nav>
	</header>

	{#if data.sketches.length === 0}
		<p class="rounded-xl border border-slate-700 bg-slate-900/60 px-4 py-6 text-center text-slate-400">
			אין סקיצות למחזור {data.gw}. שמור מהקבוצה שלי עם ״שמור כסקיצה״.
		</p>
	{:else}
		<div class="grid gap-5 lg:grid-cols-2">
			{#each data.sketches as s (s.id)}
				<LineupCard
					title={s.name}
					subtitle={`עודכן ${new Date(s.updatedAt).toLocaleString('he-IL')} · ${s.total} שחקנים (${s.xiCount} הרכב / ${s.benchCount} ספסל)`}
					formation={formationLabel(s.xiPlayers)}
					xi={s.xiPlayers}
					bench={s.benchPlayers}
					out={s.transfers.out}
					inn={s.transfers.in}
					diffLabel="חילופים מול הקבוצה השמורה"
					actions
					sketchButton={false}
				>
					{#snippet badges()}
						{#if s.matchesSaved}
							<span
								class="rounded-full bg-sky-500/25 px-2.5 py-1 text-xs font-medium text-sky-200"
								title="זהה לקבוצה השמורה ב־DB"
							>
								= הקבוצה שלי
							</span>
						{/if}
						{#if matchesDraft(s)}
							<span
								class="rounded-full bg-violet-500/25 px-2.5 py-1 text-xs font-medium text-violet-200"
								title="זהה לטיוטה הנוכחית במסך הקבוצה (בטאב הזה)"
							>
								= טיוטה נוכחית
							</span>
						{/if}
						{#if s.isWip}
							<span class="rounded-full bg-amber-500/20 px-2.5 py-1 text-xs text-amber-200">WIP</span>
						{:else}
							<span class="rounded-full bg-emerald-500/20 px-2.5 py-1 text-xs text-emerald-300">מלא</span>
						{/if}
					{/snippet}
					{#snippet extraActions()}
						<form method="POST" action="?/delete">
							<input type="hidden" name="id" value={s.id} />
							<button
								type="submit"
								class="rounded-xl border border-slate-600 px-3 py-2 text-sm text-white hover:bg-slate-800"
							>
								מחק
							</button>
						</form>
					{/snippet}
				</LineupCard>
			{/each}
		</div>
	{/if}
</div>
