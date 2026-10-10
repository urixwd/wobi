<script lang="ts">
	import LineupCard from '$lib/components/LineupCard.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
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
				<LineupCard
					title={opt.title}
					subtitle={opt.blurb}
					formation={opt.formation}
					transfersUsed={opt.transfersUsed}
					stats={[
						{ label: 'הוצאה', value: `${opt.spend} / 120`, tone: 'text-white' },
						{ label: 'פנוי', value: `${opt.remaining}`, tone: 'text-emerald-300' },
						{ label: 'נק׳ הרכב', value: `${opt.totalPoints}`, tone: 'text-sky-300' },
						{ label: 'ממוצע vlfm', value: opt.avgVlfm.toFixed(2), tone: 'text-violet-300' }
					]}
					xi={opt.xi}
					bench={opt.bench}
					out={opt.out}
					inn={opt.in}
					diffLabel="חילופים מול הקבוצה השמורה"
					actions
					sketchButton={false}
				/>
			{/each}
		</div>
	{/if}
</div>
