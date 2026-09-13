<script lang="ts">
	import { onMount } from 'svelte';
	import { positionLabel } from '$lib/positions';
	import { formatPrice } from '$lib/format';
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
					← מחזור קודם
				</a>
			{:else}
				<span class="rounded-lg border border-slate-800 px-3 py-1.5 text-sm text-slate-600">← מחזור קודם</span>
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
					מחזור הבא →
				</a>
			{:else}
				<span class="rounded-lg border border-slate-800 px-3 py-1.5 text-sm text-slate-600">מחזור הבא →</span>
			{/if}
		</nav>
	</header>

	{#if data.sketches.length === 0}
		<p class="rounded-xl border border-slate-700 bg-slate-900/60 px-4 py-6 text-center text-slate-400">
			אין סקיצות למחזור {data.gw}. שמור מהקבוצה שלי עם ״שמור כסקיצה״.
		</p>
	{:else}
		<div class="grid gap-4 lg:grid-cols-2">
			{#each data.sketches as s (s.id)}
				<article class="flex flex-col gap-3 rounded-2xl border border-slate-700/80 bg-slate-900/70 p-4">
					<div class="flex flex-wrap items-start justify-between gap-2">
						<div>
							<h2 class="text-lg font-semibold text-white">{s.name}</h2>
							<p class="text-xs text-slate-500">
								עודכן {new Date(s.updatedAt).toLocaleString('he-IL')}
								· {s.total} שחקנים ({s.xiCount} הרכב / {s.benchCount} ספסל)
							</p>
						</div>
						<div class="flex flex-wrap justify-end gap-1.5">
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
						</div>
					</div>

					<div class="space-y-2 text-sm">
						<div>
							<div class="mb-1 text-[11px] text-slate-500">הרכב</div>
							<ul class="flex flex-wrap gap-1.5">
								{#each s.xiPlayers as r}
									<li class="rounded-lg border border-slate-700 bg-slate-950/60 px-2 py-1 text-xs text-slate-200">
										{r.player.name}
										<span class="text-slate-500"
											>· {positionLabel(r.player.position)} · {formatPrice(r.player.price)}</span
										>
									</li>
								{:else}
									<li class="text-xs text-slate-500">ריק</li>
								{/each}
							</ul>
						</div>
						<div>
							<div class="mb-1 text-[11px] text-slate-500">ספסל</div>
							<ul class="flex flex-wrap gap-1.5">
								{#each s.benchPlayers as r}
									<li class="rounded-lg border border-slate-700 bg-slate-800/50 px-2 py-1 text-xs text-slate-200">
										{r.player.name}
										<span class="text-slate-500"
											>· {positionLabel(r.player.position)} · {formatPrice(r.player.price)}</span
										>
									</li>
								{:else}
									<li class="text-xs text-slate-500">ריק</li>
								{/each}
							</ul>
						</div>
					</div>

					<div class="rounded-xl border border-slate-700/80 bg-slate-950/50 p-3">
						<div class="mb-2 text-xs font-medium text-slate-400">חילופים עד כה</div>
						{#if s.transfers.out.length === 0 && s.transfers.in.length === 0}
							<p class="text-xs text-slate-500">אין חילופים מול ההרכב השמור</p>
						{:else}
							<div class="grid gap-3 sm:grid-cols-2">
								<div>
									<div class="mb-1 text-xs text-red-300">יוצאים ({s.transfers.out.length})</div>
									<ul class="space-y-1">
										{#each s.transfers.out as r}
											<li class="flex items-center justify-between gap-2 rounded-lg bg-red-500/10 px-2 py-1 text-xs">
												<span class="truncate font-medium">{r.player.name}</span>
												<span class="shrink-0 text-slate-400"
													>{positionLabel(r.player.position)} · {formatPrice(r.player.price)}</span
												>
											</li>
										{:else}
											<li class="text-xs text-slate-500">—</li>
										{/each}
									</ul>
								</div>
								<div>
									<div class="mb-1 text-xs text-emerald-300">נכנסים ({s.transfers.in.length})</div>
									<ul class="space-y-1">
										{#each s.transfers.in as r}
											<li class="flex items-center justify-between gap-2 rounded-lg bg-emerald-500/10 px-2 py-1 text-xs">
												<span class="truncate font-medium">{r.player.name}</span>
												<span class="shrink-0 text-slate-400"
													>{positionLabel(r.player.position)} · {formatPrice(r.player.price)}</span
												>
											</li>
										{:else}
											<li class="text-xs text-slate-500">—</li>
										{/each}
									</ul>
								</div>
							</div>
							<p class="mt-2 text-[11px] text-slate-500">
								{s.transfers.out.length} יוצאים · {s.transfers.in.length} נכנסים
							</p>
						{/if}
					</div>

					<div class="mt-auto flex flex-wrap gap-2">
						<form method="POST" action="?/apply" class="flex-1">
							<input type="hidden" name="xi" value={s.xiPlayerIds.join(',')} />
							<input type="hidden" name="bench" value={s.benchPlayerIds.join(',')} />
							<button
								type="submit"
								class="w-full rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
							>
								החל על הקבוצה שלי (טיוטה)
							</button>
						</form>
						<form method="POST" action="?/delete">
							<input type="hidden" name="id" value={s.id} />
							<button
								type="submit"
								class="rounded-xl border border-slate-600 px-3 py-2 text-sm text-white hover:bg-slate-800"
							>
								מחק
							</button>
						</form>
					</div>
				</article>
			{/each}
		</div>
	{/if}
</div>
