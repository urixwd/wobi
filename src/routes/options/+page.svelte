<script lang="ts">
	import CompactPlayerCard from '$lib/components/CompactPlayerCard.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const posLabel: Record<number, string> = {
		1: 'שוער',
		2: 'הגנה',
		3: 'קישור',
		4: 'התקפה'
	};

	function byPos(players: PageData['options'][number]['xi'], pos: number) {
		return players.filter((p) => p.position === pos);
	}
</script>

<svelte:head>
	<title>אפשרויות קבוצה · WOBI</title>
</svelte:head>

<div class="mx-auto max-w-6xl space-y-6 px-4 py-6" dir="rtl">
	<header class="space-y-1">
		<h1 class="text-2xl font-bold text-white">אפשרויות קבוצה</h1>
		<p class="text-sm text-slate-400">
			הצעות לשיפור הקבוצה השמורה — עד {data.maxTransfers} חילופים, תקציב 120 ומגבלות עמדות.
			בלי מעקב בשלב זה.
		</p>
	</header>

	{#if !data.options.length}
		<p class="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-amber-100">
			לא הצלחתי לבנות הרכבים תקפים מהנתונים הקיימים. בדוק שיש שחקנים ומחירים ב־DB.
		</p>
	{:else}
		<div class="grid gap-5 lg:grid-cols-2">
			{#each data.options as opt (opt.id)}
				<article
					class="flex flex-col gap-3 rounded-2xl border border-slate-700/80 bg-slate-900/70 p-4 shadow-lg"
				>
					<div class="flex flex-wrap items-start justify-between gap-2">
						<div>
							<h2 class="text-lg font-semibold text-emerald-300">{opt.title}</h2>
							<p class="text-xs text-slate-400">{opt.blurb}</p>
						</div>
						<div class="flex flex-wrap gap-1.5">
							<span
								class="rounded-full bg-slate-800 px-2.5 py-1 text-xs font-medium text-slate-200"
								>{opt.formation}</span
							>
							<span
								class="rounded-full px-2.5 py-1 text-xs font-medium
									{opt.transfersUsed === 0
									? 'bg-slate-800 text-slate-300'
									: opt.transfersUsed <= 3
										? 'bg-emerald-500/20 text-emerald-300'
										: 'bg-red-500/20 text-red-300'}"
							>
								{opt.transfersUsed} חילופים
							</span>
						</div>
					</div>

					<div class="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
						<div class="rounded-lg bg-slate-800/80 px-2 py-1.5">
							<div class="text-[10px] text-slate-500">הוצאה</div>
							<div class="font-semibold text-white">{opt.spend} / 120</div>
						</div>
						<div class="rounded-lg bg-slate-800/80 px-2 py-1.5">
							<div class="text-[10px] text-slate-500">פנוי</div>
							<div class="font-semibold text-emerald-300">{opt.remaining}</div>
						</div>
						<div class="rounded-lg bg-slate-800/80 px-2 py-1.5">
							<div class="text-[10px] text-slate-500">נק׳ הרכב</div>
							<div class="font-semibold text-sky-300">{opt.totalPoints}</div>
						</div>
						<div class="rounded-lg bg-slate-800/80 px-2 py-1.5">
							<div class="text-[10px] text-slate-500">ממוצע vlfm</div>
							<div class="font-semibold text-violet-300">{opt.avgVlfm.toFixed(2)}</div>
						</div>
					</div>

					<div
						class="space-y-2 rounded-xl bg-gradient-to-b from-emerald-950/40 to-slate-950/60 p-3"
					>
						{#each [1, 2, 3, 4] as pos}
							<div class="flex flex-wrap justify-center gap-2">
								{#each byPos(opt.xi, pos) as p}
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
						{/each}
					</div>

					<div>
						<div class="mb-1 text-xs text-slate-500">ספסל</div>
						<div class="flex flex-wrap gap-2">
							{#each opt.bench as p}
								<CompactPlayerCard
									variant="bench"
									name={p.name}
									price={p.price}
									points={p.points}
									logo={p.logo}
									teamName={p.teamName}
									positionLabel={posLabel[p.position]}
								/>
							{/each}
						</div>
					</div>

					<div class="rounded-xl border border-slate-700/80 bg-slate-950/50 p-3">
						<div class="mb-2 text-xs font-medium text-slate-400">
							חילופים מול הקבוצה השמורה
							<span class="text-slate-500">· {opt.out.length} יוצאים / {opt.in.length} נכנסים</span>
						</div>
						{#if opt.out.length === 0 && opt.in.length === 0}
							<p class="text-xs text-slate-500">זהה לקבוצה השמורה</p>
						{:else}
							<div class="grid gap-3 sm:grid-cols-2">
								<div>
									<div class="mb-1 text-[11px] text-red-300">יוצאים</div>
									<ul class="space-y-0.5 text-xs text-slate-200">
										{#each opt.out as p}
											<li class="truncate">{p.name}</li>
										{:else}
											<li class="text-slate-500">—</li>
										{/each}
									</ul>
								</div>
								<div>
									<div class="mb-1 text-[11px] text-emerald-300">נכנסים</div>
									<ul class="space-y-0.5 text-xs text-slate-200">
										{#each opt.in as p}
											<li class="truncate">{p.name}</li>
										{:else}
											<li class="text-slate-500">—</li>
										{/each}
									</ul>
								</div>
							</div>
						{/if}
					</div>

					<form method="POST" action="?/apply" class="mt-auto">
						<input type="hidden" name="xi" value={opt.xi.map((p) => p.id).join(',')} />
						<input type="hidden" name="bench" value={opt.bench.map((p) => p.id).join(',')} />
						<button
							type="submit"
							class="w-full rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
						>
							החל על הקבוצה שלי (טיוטה)
						</button>
					</form>
				</article>
			{/each}
		</div>
	{/if}
</div>
