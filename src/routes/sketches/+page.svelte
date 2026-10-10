<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { enhance } from '$app/forms';
	import LineupCard from '$lib/components/LineupCard.svelte';
	import { formationLabel } from '$lib/positions';
	import { isExactSquad, readSquadDraft, type SquadDraft } from '$lib/squadDraft';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let draft = $state<SquadDraft | null>(null);

	onMount(() => {
		draft = readSquadDraft();
	});

	type Sketch = PageData['sketches'][number];
	type Ins = Sketch['insights'];

	const fmtEase = (n: number) => (n > 0 ? `+${n.toFixed(2)}` : n.toFixed(2));
	const riskCount = (i: Ins) => i.risks.reduce((n, r) => n + r.players.length, 0) + i.hardThisMatchday.length;

	/** Comparison columns: value, display, and which direction is better (for the «best» highlight). */
	const COLUMNS: { key: string; label: string; hint?: string; get: (i: Ins) => number; show: (i: Ins) => string; better: 'high' | 'low' }[] = [
		{ key: 'remaining', label: 'פנוי', get: (i) => i.remaining, show: (i) => `${i.remaining}`, better: 'high' },
		{ key: 'xiPoints', label: 'נק׳ עונה (XI)', get: (i) => i.xiPoints, show: (i) => `${i.xiPoints}`, better: 'high' },
		{ key: 'xiForm', label: 'מחזור אחרון (XI)', get: (i) => i.xiForm, show: (i) => `${i.xiForm}`, better: 'high' },
		{ key: 'xiVlfm', label: 'vlfm', get: (i) => i.xiVlfm, show: (i) => i.xiVlfm.toFixed(2), better: 'high' },
		{ key: 'easeMatchday', label: 'לוח מחזור', hint: 'ממוצע קלות היריב ל־XI לפי עמדה (ירוק +3, צהוב +1, אדום −2)', get: (i) => i.easeMatchday, show: (i) => fmtEase(i.easeMatchday), better: 'high' },
		{ key: 'ease3', label: 'לוח 3', get: (i) => i.ease3, show: (i) => fmtEase(i.ease3), better: 'high' },
		{ key: 'ease5', label: 'לוח 5', get: (i) => i.ease5, show: (i) => fmtEase(i.ease5), better: 'high' },
		{ key: 'risks', label: 'סיכונים', hint: 'פצועים/מורחקים, דקות נמוכות, «ספסל בלבד» בהרכב, ספסל שלא משחק, משחק קשה במחזור', get: riskCount, show: (i) => `${riskCount(i)}`, better: 'low' }
	];
	/** Best value per column among the shown sketches (only when there's something to compare). */
	const best = $derived.by(() => {
		const out: Record<string, number> = {};
		if (data.sketches.length < 2) return out;
		for (const c of COLUMNS) {
			const vals = data.sketches.map((s) => c.get(s.insights));
			out[c.key] = c.better === 'high' ? Math.max(...vals) : Math.min(...vals);
		}
		return out;
	});
	const isBest = (key: string, i: Ins) =>
		best[key] != null && COLUMNS.find((c) => c.key === key)!.get(i) === best[key];

	/** Card that blinks after being picked in the comparison table. */
	let blinkId = $state<number | null>(null);
	async function focusSketch(id: number) {
		blinkId = null;
		await tick(); // restart the animation when the same card is picked again
		document.getElementById(`sketch-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
		blinkId = id;
	}

	/** Inline rename: `${where}-${id}`, so the table and the card never edit at once. */
	let editing = $state<string | null>(null);
	function focusInput(el: HTMLInputElement) {
		el.focus();
		el.select();
	}

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
		{#snippet nameEditor(s: Sketch, where: 'table' | 'card')}
			{#if editing === `${where}-${s.id}`}
				<form
					method="POST"
					action="?/rename"
					class="inline"
					use:enhance={() =>
						async ({ update }) => {
							editing = null;
							await update({ reset: false });
						}}
				>
					<input type="hidden" name="id" value={s.id} />
					<input
						name="name"
						value={s.name}
						maxlength="80"
						use:focusInput
						onblur={(e) => {
							// Esc / a finished submit already closed the editor — don't save again.
							if (editing === `${where}-${s.id}`) e.currentTarget.form?.requestSubmit();
						}}
						onkeydown={(e) => {
							if (e.key === 'Escape') {
								e.preventDefault();
								editing = null;
							}
						}}
						class="w-56 max-w-full rounded-md border border-emerald-500/60 bg-slate-950 px-1.5 py-0.5 text-sm text-white"
					/>
				</form>
			{:else}
				{#if where === 'table'}
					<button
						type="button"
						class="text-right text-slate-200 hover:text-emerald-300"
						title="הצג את הסקיצה"
						onclick={() => focusSketch(s.id)}>{s.name}</button
					>
				{:else}
					<span>{s.name}</span>
				{/if}
				<button
					type="button"
					class="mr-1 text-xs text-slate-500 hover:text-emerald-300"
					title="שינוי שם"
					aria-label="שינוי שם"
					onclick={(e) => {
						e.stopPropagation();
						editing = `${where}-${s.id}`;
					}}>✎</button
				>
			{/if}
		{/snippet}

		{#if data.sketches.length > 1}
			<!-- Side-by-side comparison; the best value per column is highlighted -->
			<div class="overflow-x-auto rounded-2xl border border-slate-700/80 bg-slate-900/70 p-3">
				<h2 class="mb-2 text-sm font-semibold text-slate-300">
					השוואה <span class="font-normal text-slate-500">· הירוק = הטוב ביותר בעמודה · לוח: גבוה = קל</span>
				</h2>
				<table class="w-full min-w-[56rem] text-right text-xs">
					<thead class="text-slate-400">
						<tr>
							<th class="py-1 pl-2 font-medium">סקיצה</th>
							<th class="px-1.5 py-1 text-center font-medium">חוקי</th>
							<th class="px-1.5 py-1 font-medium">נכנסים</th>
							{#each COLUMNS as c (c.key)}
								<th class="px-1.5 py-1 text-center font-medium" title={c.hint}>{c.label}</th>
							{/each}
						</tr>
					</thead>
					<tbody>
						{#each data.sketches as s (s.id)}
							<tr class="border-t border-slate-800">
								<td class="max-w-[16rem] truncate py-1.5 pl-2">
									{@render nameEditor(s, 'table')}
									<span class="text-[10px] text-slate-500"
										>· {new Date(s.updatedAt).toLocaleString('he-IL', {
											day: 'numeric',
											month: 'numeric',
											hour: '2-digit',
											minute: '2-digit'
										})}</span
									>
								</td>
								<td class="px-1.5 text-center {s.insights.valid ? 'text-emerald-300' : 'text-red-300'}"
									title={s.insights.issues.join(' · ')}>{s.insights.valid ? '✓' : '✕'}</td
								>
								<td class="max-w-[18rem] px-1.5 text-emerald-200">
									{#if s.transfers.in.length}
										{s.transfers.in.map((p) => p.name).join(', ')}
									{:else}
										<span class="text-slate-500">—</span>
									{/if}
								</td>
								{#each COLUMNS as c (c.key)}
									<td
										class="px-1.5 text-center tabular-nums {isBest(c.key, s.insights)
											? 'rounded bg-emerald-500/15 font-semibold text-emerald-200'
											: 'text-slate-300'}">{c.show(s.insights)}</td
									>
								{/each}
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}

		<div class="grid gap-5 lg:grid-cols-2">
			{#each data.sketches as s (s.id)}
				<div
					id="sketch-{s.id}"
					class="scroll-mt-20 {blinkId === s.id ? 'ring-blink' : ''}"
					onanimationend={() => (blinkId = null)}
				>
				<LineupCard
					title={s.name}
					subtitle={`עודכן ${new Date(s.updatedAt).toLocaleString('he-IL')}`}
					stats={[
						{ label: 'הוצאה / פנוי', value: `${s.insights.spend} / ${s.insights.remaining}`, tone: 'text-white' },
						{
							label: 'חילופים',
							value: `${s.insights.transfers} / ${s.insights.freeTransfers}`,
							tone: s.insights.overTransfers ? 'text-red-300' : 'text-emerald-300'
						},
						{ label: 'נק׳ עונה (XI)', value: `${s.insights.xiPoints}`, tone: 'text-sky-300' },
						{ label: 'מחזור אחרון (XI)', value: `${s.insights.xiForm}`, tone: 'text-sky-200' },
						{ label: 'vlfm ממוצע', value: s.insights.xiVlfm.toFixed(2), tone: 'text-violet-300' },
						{ label: 'לוח מחזור', value: fmtEase(s.insights.easeMatchday), tone: 'text-emerald-200' },
						{ label: 'לוח 3', value: fmtEase(s.insights.ease3), tone: 'text-emerald-200' },
						{ label: 'לוח 5', value: fmtEase(s.insights.ease5), tone: 'text-emerald-200' }
					]}
					formation={formationLabel(s.xiPlayers)}
					xi={s.xiPlayers}
					bench={s.benchPlayers}
					out={s.transfers.out}
					inn={s.transfers.in}
					diffLabel="חילופים מול הקבוצה השמורה"
					actions
					sketchButton={false}
				>
					{#snippet heading()}
						<h3 class="text-base font-semibold text-emerald-300">
							{@render nameEditor(s, 'card')}
						</h3>
					{/snippet}
					{#snippet insights()}
						{@const i = s.insights}
						<ul class="space-y-1 rounded-xl border border-slate-800 bg-slate-950/40 p-2.5 text-xs">
							{#if i.valid}
								<li class="text-emerald-300">✓ הרכב חוקי (תקציב, עמדות, ספסל, עד 2 מקבוצה)</li>
							{:else}
								<li class="text-red-300">✕ לא חוקי: {i.issues.join(' · ')}</li>
							{/if}
							{#if i.overTransfers}
								<li class="text-red-300">✕ {i.transfers} חילופים — יותר מ־{i.freeTransfers} החופשיים</li>
							{/if}
							<li class="text-slate-300">
								במחזור {data.gw}: {i.easyThisMatchday} מה־XI במשחק קל
								{#if i.hardThisMatchday.length}
									· <span class="text-amber-300">קשה: {i.hardThisMatchday.join(', ')}</span>
								{/if}
							</li>
							{#each i.risks as r (r.kind)}
								<li class="text-amber-300">⚠ {r.text}: <span class="text-amber-100">{r.players.join(', ')}</span></li>
							{/each}
						</ul>
					{/snippet}
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
				</div>
			{/each}
		</div>
	{/if}
</div>
