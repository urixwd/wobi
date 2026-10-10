<script lang="ts">
	import type { StatLine } from '$lib/stats';

	type RoundEntry = { matchday: number; points: number; minutes: number } | { matchday: number; played: false };
	type Props = {
		lines: StatLine[];
		roundPoints?: number | null;
		seasonPts?: number | null;
		/** Points per recent matchday, newest first (see playerHistory). */
		history?: RoundEntry[] | null;
	};

	let { lines, roundPoints = null, seasonPts = null, history = null }: Props = $props();

	// Mini line chart: points per matchday around a zero line. Time runs right → left (RTL):
	// oldest on the right, latest on the left, and the arrowhead points at the latest value.
	// One series → one hue (blue, validated on the dark panel); the sign shows by position
	// against the dashed zero line and in the value labels.
	const LINE = '#3b82f6';
	const W = 224;
	const H = 88;
	const TOP = 19; // value labels above the highest point
	const LABELS = 15; // matchday labels row
	const PAD_X = 14;
	const played = $derived(
		(history ?? []).filter((h) => !('played' in h)) as { matchday: number; points: number; minutes: number }[]
	);
	const maxV = $derived(Math.max(1, ...played.map((h) => h.points)));
	const minV = $derived(Math.min(0, ...played.map((h) => h.points)));
	// Negative values put their label under the point → leave room above the matchday row.
	const bottom = $derived(LABELS + (minV < 0 ? 13 : 0));
	const plotH = $derived(H - TOP - bottom);
	const yOf = (v: number) => TOP + ((maxV - v) / (maxV - minV)) * plotH;
	const baseY = $derived(yOf(0));
	const n = $derived(history?.length ?? 0);
	// history is newest first → index 0 at the LEFT edge.
	const xOf = (i: number) => (n <= 1 ? W / 2 : PAD_X + (i * (W - 2 * PAD_X)) / (n - 1));
	/**
	 * Line segments drawn oldest → newest (right → left), broken where he didn't play.
	 * The segment reaching the latest point carries the arrowhead, stopping short of the dot.
	 */
	const segments = $derived.by(() => {
		const out: { d: string; arrow: boolean }[] = [];
		const hs = history ?? [];
		for (let i = hs.length - 1; i > 0; i--) {
			const a = hs[i];
			const b = hs[i - 1];
			if ('played' in a || 'played' in b) continue;
			const x1 = xOf(i);
			const y1 = yOf(a.points);
			let x2 = xOf(i - 1);
			let y2 = yOf(b.points);
			const arrow = i - 1 === 0;
			if (arrow) {
				// stop before the newest dot so the arrowhead tip touches its edge
				const len = Math.hypot(x2 - x1, y2 - y1) || 1;
				x2 -= ((x2 - x1) / len) * 6;
				y2 -= ((y2 - y1) / len) * 6;
			}
			out.push({ d: `M${x1},${y1} L${x2},${y2}`, arrow });
		}
		return out;
	});
	/** Latest played matchday vs the average of the earlier ones. */
	const trend = $derived.by(() => {
		if (played.length < 2) return null;
		const [last, ...rest] = played;
		const prev = rest.reduce((a, h) => a + h.points, 0) / rest.length;
		const d = last.points - prev;
		return { d: Math.round(d * 10) / 10, dir: d >= 2 ? 'up' : d <= -2 ? 'down' : 'flat' };
	});
</script>

{#if lines.length === 0 && roundPoints == null && seasonPts == null && !history?.length}
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
		{#if history?.length}
			<div class="border-b border-slate-700 pb-1.5">
				<div class="mb-0.5 flex items-baseline justify-between gap-2">
					<span class="text-slate-400">לפי מחזור</span>
					{#if trend}
						<span class="text-[11px] text-slate-200" title="המחזור האחרון מול ממוצע הקודמים">
							{trend.dir === 'up' ? '▲ עולה' : trend.dir === 'down' ? '▼ יורד' : '▶ יציב'}
							<bdi dir="ltr" class="tabular-nums text-slate-400">({trend.d > 0 ? '+' : ''}{trend.d})</bdi>
						</span>
					{/if}
				</div>
				<svg viewBox="0 0 {W} {H}" class="w-full" role="img" aria-label="נקודות לפי מחזור">
					<defs>
						<marker id="pts-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
							<path d="M0,0 L10,5 L0,10 Z" fill={LINE} />
						</marker>
					</defs>
					<line x1="0" x2={W} y1={baseY} y2={baseY} stroke="#334155" stroke-width="1" stroke-dasharray="3 3" />
					{#each segments as seg, k (k)}
						<path
							d={seg.d}
							fill="none"
							stroke={LINE}
							stroke-width="2"
							stroke-linecap="round"
							marker-end={seg.arrow ? 'url(#pts-arrow)' : undefined}
						/>
					{/each}
					{#each history ?? [] as h, i (h.matchday)}
						<g>
							<title
								>{'played' in h ? `מחזור ${h.matchday}: לא שיחק` : `מחזור ${h.matchday}: ${h.points} נק׳ · ${h.minutes} דק׳`}</title
							>
							<!-- whole column is the hover target -->
							<rect x={xOf(i) - W / (2 * Math.max(1, n))} y="0" width={W / Math.max(1, n)} height={H} fill="transparent" />
							{#if 'played' in h}
								<circle cx={xOf(i)} cy={baseY} r="4" fill="#020617" stroke="#64748b" stroke-dasharray="2 1.5" />
								<text x={xOf(i)} y={baseY - 7} text-anchor="middle" font-size="9" fill="#64748b">—</text>
							{:else}
								<circle cx={xOf(i)} cy={yOf(h.points)} r={i === 0 ? 4.5 : 4} fill={LINE} stroke="#020617" stroke-width="2" />
								<text
									x={xOf(i)}
									y={h.points < 0 ? yOf(h.points) + 15 : yOf(h.points) - 8}
									text-anchor="middle"
									font-size="10"
									font-weight="700"
									style="direction:ltr;unicode-bidi:isolate"
									fill="#e2e8f0">{h.points}</text
								>
							{/if}
							<text
								x={xOf(i)}
								y={H - 3}
								text-anchor="middle"
								font-size="9"
								font-weight={i === 0 ? '700' : '400'}
								fill={i === 0 ? '#cbd5e1' : '#64748b'}>מ׳{h.matchday}</text
							>
						</g>
					{/each}
				</svg>
				<!-- Direction cue (explicit left/right regardless of page direction) -->
				<div class="flex justify-between text-[9px] text-slate-500" dir="ltr">
					<span>← אחרון</span><span>קודם →</span>
				</div>
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
