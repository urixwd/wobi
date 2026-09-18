<script lang="ts">
	import LineupCard from '$lib/components/LineupCard.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const st = $derived(data.standings);
	const pending = $derived(data.pending);
	const posLabel: Record<number, string> = { 1: 'שוער', 2: 'הגנה', 3: 'קישור', 4: 'התקפה' };

	/** Color by objective; mode is shown via line style / a badge. */
	const COLORS: Record<string, string> = {
		actual: '#e2e8f0',
		points: '#38bdf8',
		vlfm: '#a78bfa',
		fixtures: '#fbbf24',
		fixtures5: '#2dd4bf',
		form: '#fb7185'
	};
	const colorOf = (objective: string) => COLORS[objective] ?? '#94a3b8';
	const dashOf = (mode: string | null) =>
		mode === 'out' ? '6 3' : mode === 'free' ? '2 3' : undefined; // constrained & actual: solid
	const actualTotal = $derived(st.series.find((s) => s.key === 'actual')?.total ?? 0);
	const fmtDelta = (d: number) => (d > 0 ? `+${d}` : `${d}`);

	const MODE_TABS = [
		{ key: 'constrained', label: 'מוגבל' },
		{ key: 'out', label: 'יציאה בלבד' },
		{ key: 'free', label: 'חופשי' }
	];
	let selectedMode = $state('constrained');
	// Chart shows one mode at a time (+ your actual), to stay legible.
	const chartSeries = $derived(st.series.filter((s) => s.key === 'actual' || s.mode === selectedMode));
	const leaderboard = $derived([...st.series].sort((a, b) => b.total - a.total));

	// Chart geometry (viewBox units).
	const W = 720;
	const H = 320;
	const padL = 44;
	const padR = 16;
	const padT = 16;
	const padB = 34;
	const plotW = W - padL - padR;
	const plotH = H - padT - padB;
	const gws = $derived(st.gameweeks);
	const maxY = $derived(Math.max(1, ...chartSeries.flatMap((s) => s.perGw.map((p) => p.cumulative))));

	function niceStep(raw: number): number {
		const pow = Math.pow(10, Math.floor(Math.log10(Math.max(1, raw))));
		const n = raw / pow;
		const m = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
		return m * pow;
	}
	const yTicks = $derived.by(() => {
		const step = niceStep(maxY / 4);
		const ticks: number[] = [];
		for (let v = 0; v <= maxY + 1e-6; v += step) ticks.push(Math.round(v));
		return ticks;
	});
	const xFor = (i: number) => (gws.length <= 1 ? padL + plotW / 2 : padL + (i / (gws.length - 1)) * plotW);
	const yFor = (v: number) => padT + plotH - (v / maxY) * plotH;
	const linePoints = (perGw: { cumulative: number }[]) =>
		perGw.map((p, i) => `${xFor(i)},${yFor(p.cumulative)}`).join(' ');
</script>

<svelte:head><title>מעקב אסטרטגיות · WOBI</title></svelte:head>

<section class="space-y-6" dir="rtl">
	<div>
		<h1 class="text-2xl font-bold">מעקב אסטרטגיות</h1>
		<p class="text-sm text-slate-400">
			כל שיטה נמדדת בשלוש גרסאות — <b class="text-slate-300">מוגבל</b> (מכבד יציאה+כניסה),
			<b class="text-slate-300">יציאה בלבד</b>, ו<b class="text-slate-300">חופשי</b> — מול הבחירות שלך
			בפועל. מ־מחזור 5, מדורג אחרי שהתוצאות נכנסות.
		</p>
	</div>

	{#if pending}
		{@const c = pending.constraints}
		{@const outIds = new Set(c.forcedOut)}
		{@const inIds = new Set(c.forcedIn)}
		<div class="space-y-3">
			<div>
				<h2 class="text-lg font-bold">מחזור {pending.gameweekNumber} — טרם דורג</h2>
				<p class="text-sm text-slate-400">
					האילוצים וההרכבים שנרשמו לכל שיטה. הניקוד יתווסף אחרי שהתוצאות ייכנסו.
				</p>
			</div>

			<!-- Read-only constraint log (same lists as /watchlist) -->
			<div class="grid gap-3 md:grid-cols-2">
				<div class="rounded-xl border border-slate-700/70 bg-slate-900/50 p-3">
					<h3 class="mb-2 text-sm font-semibold text-slate-300">
						לשחרר מהקבוצה <span class="text-slate-500">({c.forcedOut.length})</span>
					</h3>
					<div class="flex flex-wrap gap-1.5">
						{#each c.squad as p (p.id)}
							{@const on = outIds.has(p.id)}
							<span
								class="rounded-lg border px-2 py-1 text-xs {on
									? 'border-red-500/60 bg-red-500/20 text-red-200'
									: 'border-slate-700 bg-slate-800/60 text-slate-400'}"
							>
								{on ? '✕ ' : ''}{p.name}
								<span class="text-[10px] text-slate-500">{posLabel[p.position]}</span>
							</span>
						{/each}
					</div>
				</div>
				<div class="rounded-xl border border-slate-700/70 bg-slate-900/50 p-3">
					<h3 class="mb-2 text-sm font-semibold text-slate-300">
						חייבים להיכנס <span class="text-slate-500">({c.forcedIn.length})</span>
					</h3>
					<div class="flex flex-wrap gap-1.5">
						{#each c.inbound as p (p.id)}
							{@const on = inIds.has(p.id)}
							<span
								class="rounded-lg border px-2 py-1 text-xs {on
									? 'border-emerald-500/60 bg-emerald-500/20 text-emerald-200'
									: 'border-slate-700 bg-slate-800/60 text-slate-400'}"
							>
								{on ? '✓ ' : ''}{p.name}
								<span class="text-[10px] text-slate-500">{posLabel[p.position]}</span>
							</span>
						{:else}
							<span class="text-xs text-slate-500">אין שחקנים ברשימת המחזור.</span>
						{/each}
					</div>
				</div>
			</div>

			<div class="grid gap-5 lg:grid-cols-3">
				{#each pending.picks as p (p.strategy)}
					<LineupCard
						title={p.mode ? `${p.label} · ${p.modeLabel}` : p.label}
						badge="טרם דורג"
						formation={p.formation ?? '—'}
						stats={[{ label: 'הוצאה', value: `${p.spend ?? '—'} / 120`, tone: 'text-white' }]}
						xi={p.xi}
						bench={p.bench}
					/>
				{/each}
			</div>
		</div>
	{/if}

	{#if !st.gameweeks.length}
		<div class="rounded-xl border border-slate-700 bg-slate-900/60 px-4 py-6 text-center text-slate-400">
			עדיין אין מחזורים מדורגים. הנתונים יופיעו אחרי שמייבאים תוצאות + dump של מחזור שהסתיים
			(<code class="text-slate-300">bun run db:score-strategies</code>).
		</div>
	{:else}
		<!-- Leaderboard: every variant + your actual, ranked -->
		<div class="overflow-x-auto rounded-2xl border border-slate-700/80 bg-slate-900/70 p-4">
			<h2 class="mb-2 text-sm font-semibold text-slate-300">דירוג — כל הגרסאות מול הבחירה שלך</h2>
			<table class="w-full min-w-[24rem] text-right text-sm">
				<thead>
					<tr class="text-slate-400">
						<th class="py-1 pl-2 font-medium">#</th>
						<th class="py-1 font-medium">שיטה</th>
						<th class="px-2 py-1 text-center font-medium">מצב</th>
						<th class="px-2 py-1 text-center font-medium">נק׳</th>
						<th class="px-2 py-1 text-center font-medium">מול הבחירה שלך</th>
					</tr>
				</thead>
				<tbody>
					{#each leaderboard as s, i (s.key)}
						{@const d = s.total - actualTotal}
						<tr class="border-t border-slate-800 {s.key === st.leader ? 'bg-emerald-500/10' : ''}">
							<td class="py-1.5 pl-2 text-slate-500">{i + 1}</td>
							<td class="py-1.5">
								<span class="flex items-center gap-1.5">
									<span class="inline-block h-2.5 w-2.5 rounded-full" style="background:{colorOf(s.objective)}"></span>
									<span class="text-slate-200">{s.label}</span>
								</span>
							</td>
							<td class="px-2 py-1.5 text-center">
								{#if s.modeLabel}
									<span class="rounded-full bg-slate-800 px-2 py-0.5 text-[11px] text-slate-300">{s.modeLabel}</span>
								{:else}
									<span class="text-[11px] text-slate-500">—</span>
								{/if}
							</td>
							<td class="px-2 py-1.5 text-center font-semibold text-white">{s.total}</td>
							<td class="px-2 py-1.5 text-center">
								{#if s.key === 'actual'}
									<span class="text-[11px] text-slate-500">הבחירה שלך</span>
								{:else}
									<span class="font-medium {d > 0 ? 'text-emerald-300' : d < 0 ? 'text-red-300' : 'text-slate-400'}"
										>{fmtDelta(d)}</span
									>
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		<!-- Cumulative chart, one mode at a time -->
		<div class="rounded-2xl border border-slate-700/80 bg-slate-900/70 p-4">
			<div class="mb-2 flex flex-wrap items-center justify-between gap-2">
				<h2 class="text-sm font-semibold text-slate-300">נקודות מצטברות</h2>
				<div class="flex gap-1">
					{#each MODE_TABS as t}
						<button
							type="button"
							onclick={() => (selectedMode = t.key)}
							class="rounded-lg px-2.5 py-1 text-xs {selectedMode === t.key
								? 'bg-sky-500/20 text-sky-300'
								: 'bg-slate-800 text-slate-400'}">{t.label}</button
						>
					{/each}
				</div>
			</div>
			<svg viewBox="0 0 {W} {H}" class="w-full" role="img" aria-label="גרף נקודות מצטברות">
				{#each yTicks as t}
					<line x1={padL} x2={W - padR} y1={yFor(t)} y2={yFor(t)} stroke="#1e293b" stroke-width="1" />
					<text x={padL - 6} y={yFor(t) + 3} text-anchor="end" font-size="10" fill="#64748b">{t}</text>
				{/each}
				{#each gws as gw, i}
					<text x={xFor(i)} y={H - padB + 16} text-anchor="middle" font-size="10" fill="#64748b">מ׳{gw}</text>
				{/each}
				{#each chartSeries as s (s.key)}
					<polyline
						points={linePoints(s.perGw)}
						fill="none"
						stroke={colorOf(s.objective)}
						stroke-width={s.key === 'actual' ? 3 : 2}
						stroke-dasharray={s.key === 'actual' ? '5 4' : dashOf(s.mode)}
						stroke-linejoin="round"
						stroke-linecap="round"
					/>
					{#each s.perGw as p, i}
						<circle cx={xFor(i)} cy={yFor(p.cumulative)} r="3" fill={colorOf(s.objective)} />
					{/each}
				{/each}
			</svg>
			<div class="mt-2 flex flex-wrap gap-x-4 gap-y-1">
				{#each chartSeries as s (s.key)}
					<span class="flex items-center gap-1.5 text-xs text-slate-300">
						<span class="inline-block h-2.5 w-2.5 rounded-full" style="background:{colorOf(s.objective)}"></span>
						{s.label}{s.modeLabel ? ` · ${s.modeLabel}` : ''}
					</span>
				{/each}
			</div>
		</div>
	{/if}
</section>
