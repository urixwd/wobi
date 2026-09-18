<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const st = $derived(data.standings);

	/** Distinct, colorblind-friendly hue per series; actual is the neutral reference line. */
	const COLORS: Record<string, string> = {
		actual: '#e2e8f0',
		points: '#38bdf8',
		vlfm: '#a78bfa',
		fixtures: '#fbbf24',
		form: '#fb7185'
	};
	const colorOf = (key: string) => COLORS[key] ?? '#94a3b8';
	const actualTotal = $derived(st.series.find((s) => s.key === 'actual')?.total ?? 0);
	const fmtDelta = (d: number) => (d > 0 ? `+${d}` : `${d}`);

	// Chart geometry (viewBox units; scales responsively).
	const W = 720;
	const H = 340;
	const padL = 44;
	const padR = 16;
	const padT = 16;
	const padB = 34;
	const plotW = W - padL - padR;
	const plotH = H - padT - padB;

	const gws = $derived(st.gameweeks);
	const maxY = $derived(
		Math.max(1, ...st.series.flatMap((s) => s.perGw.map((p) => p.cumulative)))
	);
	const yTicks = $derived.by(() => {
		const step = niceStep(maxY / 4);
		const ticks: number[] = [];
		for (let v = 0; v <= maxY + 1e-6; v += step) ticks.push(Math.round(v));
		return ticks;
	});

	function niceStep(raw: number): number {
		const pow = Math.pow(10, Math.floor(Math.log10(Math.max(1, raw))));
		const n = raw / pow;
		const m = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
		return m * pow;
	}
	function xFor(i: number): number {
		if (gws.length <= 1) return padL + plotW / 2;
		return padL + (i / (gws.length - 1)) * plotW;
	}
	function yFor(v: number): number {
		return padT + plotH - (v / maxY) * plotH;
	}
	function linePoints(perGw: { cumulative: number }[]): string {
		return perGw.map((p, i) => `${xFor(i)},${yFor(p.cumulative)}`).join(' ');
	}
</script>

<svelte:head><title>מעקב אסטרטגיות · WOBI</title></svelte:head>

<section class="space-y-6" dir="rtl">
	<div>
		<h1 class="text-2xl font-bold">מעקב אסטרטגיות</h1>
		<p class="text-sm text-slate-400">
			כמה נקודות כל שיטה הייתה צוברת לאורך העונה (מ־מחזור 5), מול הבחירות שלך בפועל. מבוסס על ה־«מה
			היה קורה» שנרשם בכל מחזור ומדורג אחרי שהתוצאות נכנסות.
		</p>
	</div>

	{#if !st.gameweeks.length}
		<div class="rounded-xl border border-slate-700 bg-slate-900/60 px-4 py-6 text-center text-slate-400">
			עדיין אין מחזורים מדורגים. הנתונים יופיעו אחרי שמייבאים תוצאות + dump של מחזור שהסתיים
			(<code class="text-slate-300">bun run db:score-strategies</code>).
		</div>
	{:else}
		<!-- Leaderboard -->
		<div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
			{#each st.series as s (s.key)}
				{@const isLeader = st.leader === s.key}
				<div
					class="rounded-xl border p-3 {isLeader
						? 'border-emerald-500/60 bg-emerald-500/10'
						: 'border-slate-700 bg-slate-900/60'}"
				>
					<div class="flex items-center gap-2">
						<span class="inline-block h-3 w-3 rounded-full" style="background:{colorOf(s.key)}"></span>
						<span class="text-sm font-semibold text-slate-200">{s.label}</span>
						{#if isLeader}<span class="text-[10px] text-emerald-300">מוביל</span>{/if}
					</div>
					<div class="mt-1 text-2xl font-bold" style="color:{colorOf(s.key)}">{s.total}</div>
					<div class="text-[11px] text-slate-500">נק׳ מצטבר</div>
					{#if s.key === 'actual'}
						<div class="text-[11px] text-slate-500">הבחירות שלך בפועל</div>
					{:else}
						{@const d = s.total - actualTotal}
						<div
							class="text-[11px] font-medium {d > 0
								? 'text-emerald-300'
								: d < 0
									? 'text-red-300'
									: 'text-slate-400'}"
						>
							{fmtDelta(d)} מול הבחירה שלך
						</div>
					{/if}
				</div>
			{/each}
		</div>

		<!-- Cumulative line chart -->
		<div class="rounded-2xl border border-slate-700/80 bg-slate-900/70 p-4">
			<h2 class="mb-2 text-sm font-semibold text-slate-300">נקודות מצטברות לפי מחזור</h2>
			<svg viewBox="0 0 {W} {H}" class="w-full" role="img" aria-label="גרף נקודות מצטברות">
				<!-- y gridlines + labels -->
				{#each yTicks as t}
					<line x1={padL} x2={W - padR} y1={yFor(t)} y2={yFor(t)} stroke="#1e293b" stroke-width="1" />
					<text x={padL - 6} y={yFor(t) + 3} text-anchor="end" font-size="10" fill="#64748b">{t}</text>
				{/each}
				<!-- x labels (gameweeks) -->
				{#each gws as gw, i}
					<text x={xFor(i)} y={H - padB + 16} text-anchor="middle" font-size="10" fill="#64748b">
						מ׳{gw}
					</text>
				{/each}
				<!-- series -->
				{#each st.series as s (s.key)}
					<polyline
						points={linePoints(s.perGw)}
						fill="none"
						stroke={colorOf(s.key)}
						stroke-width={s.key === 'actual' ? 3 : 2}
						stroke-dasharray={s.key === 'actual' ? '5 4' : undefined}
						stroke-linejoin="round"
						stroke-linecap="round"
						opacity={s.key === 'actual' ? 0.95 : 0.9}
					/>
					{#each s.perGw as p, i}
						<circle cx={xFor(i)} cy={yFor(p.cumulative)} r="3" fill={colorOf(s.key)} />
					{/each}
				{/each}
			</svg>
			<div class="mt-2 flex flex-wrap gap-x-4 gap-y-1">
				{#each st.series as s (s.key)}
					<span class="flex items-center gap-1.5 text-xs text-slate-300">
						<span class="inline-block h-2.5 w-2.5 rounded-full" style="background:{colorOf(s.key)}"></span>
						{s.label}
					</span>
				{/each}
			</div>
		</div>

		<!-- Per-matchday table -->
		<div class="overflow-x-auto rounded-2xl border border-slate-700/80 bg-slate-900/70 p-4">
			<h2 class="mb-2 text-sm font-semibold text-slate-300">נקודות לכל מחזור</h2>
			<table class="w-full min-w-[28rem] text-right text-sm">
				<thead>
					<tr class="text-slate-400">
						<th class="py-1 pl-2 font-medium">שיטה</th>
						{#each gws as gw}
							<th class="px-2 py-1 text-center font-medium">מ׳{gw}</th>
						{/each}
						<th class="px-2 py-1 text-center font-medium">סה״כ</th>
					</tr>
				</thead>
				<tbody>
					{#each st.series as s (s.key)}
						<tr class="border-t border-slate-800">
							<td class="py-1.5 pl-2">
								<span class="flex items-center gap-1.5">
									<span class="inline-block h-2.5 w-2.5 rounded-full" style="background:{colorOf(s.key)}"></span>
									<span class="text-slate-200">{s.label}</span>
								</span>
							</td>
							{#each s.perGw as p}
								<td class="px-2 py-1.5 text-center text-slate-300">{p.points}</td>
							{/each}
							<td class="px-2 py-1.5 text-center font-semibold text-white">{s.total}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</section>
