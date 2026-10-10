<script lang="ts">
	import { enhance } from '$app/forms';
	import LineupCard from '$lib/components/LineupCard.svelte';
	import { formatPrice } from '$lib/format';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	const st = $derived(data.standings);
	const detail = $derived(data.detail);
	const posLabel: Record<number, string> = { 1: 'שוער', 2: 'הגנה', 3: 'קישור', 4: 'התקפה' };

	// Matchday navigation (prev/next across recorded gameweeks).
	const gwList = $derived(data.gameweeksAvailable ?? []);
	const gwIdx = $derived(data.selectedGw != null ? gwList.indexOf(data.selectedGw) : -1);
	const prevGw = $derived(gwIdx > 0 ? gwList[gwIdx - 1] : null);
	const nextGw = $derived(gwIdx >= 0 && gwIdx < gwList.length - 1 ? gwList[gwIdx + 1] : null);

	/** Color by objective; mode is shown via line style / a badge. */
	const COLORS: Record<string, string> = {
		actual: '#e2e8f0',
		points: '#38bdf8',
		vlfm: '#a78bfa',
		fixtures: '#fbbf24',
		fixtures3: '#a3e635',
		fixtures5: '#2dd4bf',
		form: '#fb7185'
	};
	const colorOf = (objective: string) => COLORS[objective] ?? '#94a3b8';
	const dashOf = (mode: string | null) =>
		mode === 'out' ? '6 3' : mode === 'free' ? '2 3' : undefined; // constrained & actual: solid
	const fmtDelta = (d: number) => (d > 0 ? `+${d}` : `${d}`);

	/** How each strategy picks its lineup (mirrors matchdayTransfers.ts SCORE / COMBO_METRIC). */
	const HOW: Record<string, string> = {
		actual:
			'הקבוצה ששמרת בפועל ב־/squad למחזור הזה (במחזור פתוח: הקבוצה השמורה כרגע). כל השיטות נמדדות מולה. הניקוד: נקודות האמת של ה־XI במחזור, כולל חילוף אוטומטי מהספסל לשחקן שלא שיחק, בלי הכפלת קפטן.',
		points:
			'סכום נקודות העונה של 11 השחקנים בהרכב. נבחרים החילופים וההרכב עם הסכום הגבוה ביותר.',
		vlfm:
			'vlfm = נקודות עונה ÷ מחיר (נקודות לכל מיליון). נבחר ההרכב שבו ממוצע ה־vlfm של 11 השחקנים הכי גבוה; בשוויון — יותר נקודות עונה.',
		fixtures:
			'כל שחקן מקבל ציון לפי קושי המשחק של הקבוצה שלו במחזור הזה, לפי העמדה שלו: ירוק +3, צהוב +1, אדום −2. נבחר ההרכב עם הממוצע הגבוה ביותר של 11 השחקנים; בשוויון — יותר נקודות עונה.',
		fixtures3:
			'אותו ציון (ירוק +3, צהוב +1, אדום −2, לפי העמדה של השחקן), בממוצע על עד 3 המשחקים הקרובים של כל שחקן. נבחר ההרכב עם הממוצע הגבוה ביותר של 11 השחקנים; בשוויון — יותר נקודות עונה.',
		fixtures5:
			'אותו ציון (ירוק +3, צהוב +1, אדום −2, לפי העמדה של השחקן), בממוצע על עד 5 המשחקים הקרובים של כל שחקן. נבחר ההרכב עם הממוצע הגבוה ביותר של 11 השחקנים; בשוויון — יותר נקודות עונה.',
		form: 'סכום הנקודות ש־11 השחקנים צברו במחזור האחרון בלבד. נבחר ההרכב עם הסכום הגבוה ביותר; בשוויון — יותר נקודות עונה.'
	};
	const HOW_COMMON =
		'בכל השיטות: עד 3 חילופים, הנכנסים רק מרשימת המחזור, תקציב 120, עד 2 שחקנים מאותה קבוצה והרכב חוקי. הספסל — השחקן הטוב ביותר לפי אותו מדד בכל עמדה. בשיטות הלוח, קושי היריב תלוי בעמדת השחקן — שוער והגנה מול התקפת היריב, קישור והתקפה מול הגנת היריב — ונקבע לכל מחזור ב־/difficulty. מצבים: «מוגבל» מכבד את «לשחרר», «עדיף לא להוציא» ו«חייבים להיכנס»; «יציאה בלבד» את «לשחרר» ו«עדיף לא להוציא»; «חופשי» אף אחד. «ספסל בלבד» חל בכל המצבים: שחקן כזה לא פותח אם יש הרכב חוקי בלעדיו.';

	const MODE_TABS = [
		{ key: 'constrained', label: 'מוגבל' },
		{ key: 'out', label: 'יציאה בלבד' },
		{ key: 'free', label: 'חופשי' }
	];
	let selectedMode = $state('constrained');
	// Chart shows one mode at a time (+ your actual), to stay legible.
	const chartSeries = $derived(st.series.filter((s) => s.key === 'actual' || s.mode === selectedMode));

	/** Card stats + the objective's own score, as /watchlist showed them. */
	type Metrics = NonNullable<NonNullable<typeof detail>['picks'][number]['metrics']>;
	const objScore: Record<string, (m: Metrics) => string> = {
		points: (m) => `${m.points} נק׳ עונה ב־XI`,
		vlfm: (m) => `vlfm ממוצע ${m.vlfm.toFixed(2)}`,
		fixtures: (m) => `קלות לוח מחזור ${m.matchdayEase.toFixed(2)}`,
		fixtures3: (m) => `קלות לוח 3 מחזורים ${m.fixtureEase3.toFixed(2)}`,
		fixtures5: (m) => `קלות לוח 5 מחזורים ${m.fixtureEase5.toFixed(2)}`,
		form: (m) => `${m.form} נק׳ במחזור האחרון`
	};
	function cardStats(spend: number | null, m: Metrics | null) {
		const stats = [{ label: 'הוצאה', value: `${spend ?? '—'} / 120`, tone: 'text-white' }];
		if (m)
			stats.push(
				{ label: 'פנוי', value: `${m.remaining}`, tone: 'text-emerald-300' },
				{ label: 'נק׳ הרכב', value: `${m.points}`, tone: 'text-sky-300' },
				{ label: 'vlfm', value: m.vlfm.toFixed(2), tone: 'text-violet-300' }
			);
		return stats;
	}

	// Lineups grouped by strategy (one collapsible row each), in the server's order.
	const pickGroups = $derived.by(() => {
		const groups: { key: string; label: string; picks: NonNullable<typeof detail>['picks'] }[] = [];
		for (const p of detail?.picks ?? []) {
			let g = groups.find((x) => x.key === p.objective);
			if (!g) groups.push((g = { key: p.objective, label: p.label, picks: [] }));
			g.picks.push(p);
		}
		return groups;
	});

	// Open/closed per strategy row, persisted locally. Default: only «הבחירה שלי» open.
	const COLLAPSE_KEY = 'wobi.strategies.open';
	let openRows = $state<Record<string, boolean>>({});
	let openLoaded = $state(false);
	$effect(() => {
		if (!openLoaded) {
			openLoaded = true;
			try {
				const raw = localStorage.getItem(COLLAPSE_KEY);
				const o = raw ? JSON.parse(raw) : null;
				if (o && typeof o === 'object') openRows = o;
			} catch {
				/* ignore */
			}
			return;
		}
		try {
			localStorage.setItem(COLLAPSE_KEY, JSON.stringify(openRows));
		} catch {
			/* ignore */
		}
	});
	const isRowOpen = (key: string) => openRows[key] ?? key === 'actual';

	// Lineups view: all modes (accordion) or «מוגבל בלבד» (flat), remembered locally.
	type PickView = 'all' | 'constrained';
	const VIEW_KEY = 'wobi.strategies.view';
	let pickView = $state<PickView>('all');
	let viewLoaded = $state(false);
	$effect(() => {
		if (!viewLoaded) {
			viewLoaded = true;
			try {
				const v = localStorage.getItem(VIEW_KEY);
				if (v === 'all' || v === 'constrained') pickView = v;
			} catch {
				/* ignore */
			}
			return;
		}
		try {
			localStorage.setItem(VIEW_KEY, pickView);
		} catch {
			/* ignore */
		}
	});
	/** Card whose constraint-warning details are open (click); hover shows a tooltip. */
	let warnOpen = $state<string | null>(null);
	const warnTitle = (v: { text: string; players: string[] }[]) =>
		v.map((x) => `${x.text}: ${x.players.join(', ')}`).join('\n');
	const constrainedPicks = $derived(
		(detail?.picks ?? []).filter((p) => p.strategy === 'actual' || p.mode === 'constrained')
	);
	/** Suggestions in the current view that miss a constraint. */
	const unmetCount = $derived(
		(pickView === 'constrained' ? constrainedPicks : (detail?.picks ?? [])).filter((p) => p.violations.length)
			.length
	);
	const toggleRow = (key: string) => (openRows[key] = !isRowOpen(key));

	// Leaderboard view: season total, or one scored matchday (default: the latest).
	let boardView = $state<'total' | 'gw'>('total');
	let boardGwPick = $state<number | null>(null);
	const scoredGws = $derived(st.gameweeks);
	const boardGw = $derived(
		boardGwPick != null && scoredGws.includes(boardGwPick) ? boardGwPick : (scoredGws.at(-1) ?? null)
	);
	const boardGwIdx = $derived(boardGw != null ? scoredGws.indexOf(boardGw) : -1);
	const boardPrev = $derived(boardGwIdx > 0 ? scoredGws[boardGwIdx - 1] : null);
	const boardNext = $derived(boardGwIdx >= 0 && boardGwIdx < scoredGws.length - 1 ? scoredGws[boardGwIdx + 1] : null);
	type Series = (typeof st.series)[number];
	/** null = the series has no pick for that matchday (e.g. a strategy added later) — not 0. */
	const boardPts = (s: Series): number | null =>
		boardView === 'total' ? s.total : (s.perGw.find((p) => p.gw === boardGw)?.points ?? null);
	const leaderboard = $derived(
		[...st.series].sort((a, b) => (boardPts(b) ?? -Infinity) - (boardPts(a) ?? -Infinity))
	);
	const actualSeries = $derived(st.series.find((s) => s.key === 'actual') ?? null);
	/**
	 * Your actual points over the same matchdays `s` has data for, so a strategy
	 * that started later is compared fairly (only on common matchdays).
	 */
	const actualOver = (s: Series): number => {
		if (!actualSeries) return 0;
		if (boardView === 'gw') return actualSeries.perGw.find((p) => p.gw === boardGw)?.points ?? 0;
		const has = new Set(s.perGw.filter((p) => p.points != null).map((p) => p.gw));
		return actualSeries.perGw.reduce((sum, p) => sum + (has.has(p.gw) ? (p.points ?? 0) : 0), 0);
	};
	const boardLeader = $derived(leaderboard[0]?.key ?? null);

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
	const maxY = $derived(
		Math.max(1, ...chartSeries.flatMap((s) => s.perGw.map((p) => p.cumulative ?? 0)))
	);

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
	// Inset so the first/last value labels don't hit the y-axis or the edge.
	const padX = 18;
	const xFor = (i: number) =>
		gws.length <= 1 ? padL + plotW / 2 : padL + padX + (i / (gws.length - 1)) * (plotW - 2 * padX);
	const yFor = (v: number) => padT + plotH - (v / maxY) * plotH;
	// Matchdays without data are skipped, so a later-added strategy's line starts where its data does.
	const linePoints = (perGw: { cumulative: number | null }[]) =>
		perGw
			.map((p, i) => (p.cumulative == null ? null : `${xFor(i)},${yFor(p.cumulative)}`))
			.filter(Boolean)
			.join(' ');

	// Value labels: per matchday, stack labels that would overlap (sorted by y, min gap apart).
	const LABEL_H = 15;
	const LABEL_GAP = 2;
	// Approximate width of "<label> · <points>" at font-size 10.
	const labelW = (name: string, v: number) => name.length * 5.4 + String(v).length * 6.5 + 22;
	// Keep wide labels inside the plot at the first/last matchday.
	const labelX = (x: number, w: number) => Math.min(Math.max(x, padL + w / 2), W - padR - w / 2);
	const labelY = $derived.by(() => {
		const out = new Map<string, number[]>();
		for (const s of chartSeries) out.set(s.key, []);
		gws.forEach((_, i) => {
			const col = chartSeries
				.filter((s) => s.perGw[i]?.cumulative != null)
				.map((s) => ({ key: s.key, y: yFor(s.perGw[i].cumulative ?? 0) }))
				.sort((a, b) => a.y - b.y);
			const step = LABEL_H + LABEL_GAP;
			for (let j = 1; j < col.length; j++) col[j].y = Math.max(col[j].y, col[j - 1].y + step);
			// Pushed past the bottom: shift the whole stack back up.
			const over = col.length ? col[col.length - 1].y - (padT + plotH) : 0;
			if (over > 0) for (const c of col) c.y -= over;
			for (const c of col) out.get(c.key)![i] = c.y;
		});
		return out;
	});
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

	{#if form?.sketchSaved}
		<div class="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-200">
			סקיצה נשמרה למחזור {form.sketchGw} ✓ ·
			<a class="underline" href="/sketches?gw={form.sketchGw}">לסקיצות</a>
		</div>
	{/if}

	{#if detail}
		{@const c = detail.constraints}
		{@const outIds = new Set(c.forcedOut)}
		{@const inIds = new Set(c.forcedIn)}
		{@const keepIds = new Set(c.preferKeep)}
		{@const benchIds = new Set(c.benchOnly)}
		{@const suggestIds = new Set(c.suggestBenchOnly)}
		<div class="space-y-3">
			<div class="flex flex-wrap items-center justify-between gap-2">
				<div>
					<h2 class="text-lg font-bold">
						מחזור {detail.gameweekNumber}
						{#if detail.scored}
							<span class="text-sm font-normal text-emerald-300">· דורג</span>
						{:else if detail.live}
							<span class="text-sm font-normal text-sky-300">· מחזור פתוח — תצוגה חיה</span>
						{:else}
							<span class="text-sm font-normal text-slate-500">· טרם דורג</span>
						{/if}
					</h2>
					<p class="text-sm text-slate-400">
						{#if detail.live}
							מחושב עכשיו מהסגל הנוכחי והאילוצים של המחזור. נרשם כשלוחצים «שמור קבוצה» ב־/squad.
						{:else}
							האילוצים וההרכבים שנרשמו לכל שיטה.
						{/if}
					</p>
				</div>
				<div class="flex items-center gap-1">
					{#if prevGw != null}
						<a href="?gw={prevGw}" class="rounded-lg bg-slate-800 px-3 py-1.5 text-sm text-slate-200">→ מחזור {prevGw}</a>
					{:else}
						<span class="rounded-lg bg-slate-900 px-3 py-1.5 text-sm text-slate-600">→</span>
					{/if}
					{#if nextGw != null}
						<a href="?gw={nextGw}" class="rounded-lg bg-slate-800 px-3 py-1.5 text-sm text-slate-200">מחזור {nextGw} ←</a>
					{:else}
						<span class="rounded-lg bg-slate-900 px-3 py-1.5 text-sm text-slate-600">←</span>
					{/if}
				</div>
			</div>

			<!-- Constraint log (same lists as /watchlist); editable for the open matchday only -->
			<div class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
				<div class="rounded-xl border border-slate-700/70 bg-slate-900/50 p-3">
					<h3 class="mb-2 text-sm font-semibold text-slate-300">
						לשחרר מהקבוצה <span class="text-slate-500">({c.forcedOut.length})</span>
					</h3>
					<div class="flex flex-wrap gap-1.5">
						{#each c.squad as p (p.id)}
							{@const on = outIds.has(p.id)}
							{@const cls = `rounded-lg border px-2 py-1 text-xs ${on
								? 'border-red-500/60 bg-red-500/20 text-red-200'
								: 'border-slate-700 bg-slate-800/60 text-slate-400'}`}
							{#if detail.live}
								<form method="POST" action="?/toggleMustOut" use:enhance>
									<input type="hidden" name="playerId" value={p.id} />
									<button
										type="submit"
										disabled={!on && outIds.size >= 3}
										class="{cls} transition hover:border-slate-500 disabled:opacity-40"
									>
										{on ? '✕ ' : ''}{p.name} <span class="tabular-nums text-slate-400">({p.points} · {formatPrice(p.price)})</span>
										<span class="text-[10px] text-slate-500">{posLabel[p.position]}</span>
									</button>
								</form>
							{:else}
								<span class={cls}>
									{on ? '✕ ' : ''}{p.name} <span class="tabular-nums text-slate-400">({p.points} · {formatPrice(p.price)})</span>
									<span class="text-[10px] text-slate-500">{posLabel[p.position]}</span>
								</span>
							{/if}
						{/each}
					</div>
				</div>
				<div class="rounded-xl border border-slate-700/70 bg-slate-900/50 p-3">
					<h3 class="mb-1 text-sm font-semibold text-slate-300">
						עדיף לא להוציא <span class="text-slate-500">({c.preferKeep.length})</span>
					</h3>
					<p class="mb-2 text-[11px] text-slate-500">
						השיטות ישאירו אותם אם אפשר במסגרת האילוצים. יצאו רק אם אין דרך חוקית אחרת.
					</p>
					<div class="flex flex-wrap gap-1.5">
						{#each c.squad as p (p.id)}
							{@const on = keepIds.has(p.id)}
							{@const cls = `rounded-lg border px-2 py-1 text-xs ${on
								? 'border-sky-500/60 bg-sky-500/20 text-sky-200'
								: outIds.has(p.id)
									? 'border-slate-800 bg-slate-900/60 text-slate-600 line-through'
									: 'border-slate-700 bg-slate-800/60 text-slate-400'}`}
							{#if detail.live}
								<form method="POST" action="?/togglePreferKeep" use:enhance>
									<input type="hidden" name="playerId" value={p.id} />
									<button
										type="submit"
										class="{cls} transition hover:border-slate-500"
										title={outIds.has(p.id) ? 'מסומן לשחרור — לחיצה תעביר אותו לכאן' : undefined}
									>
										{on ? '🛡 ' : ''}{p.name} <span class="tabular-nums text-slate-400">({p.points} · {formatPrice(p.price)})</span>
										<span class="text-[10px] text-slate-500">{posLabel[p.position]}</span>
									</button>
								</form>
							{:else}
								<span class={cls}>
									{on ? '🛡 ' : ''}{p.name} <span class="tabular-nums text-slate-400">({p.points} · {formatPrice(p.price)})</span>
									<span class="text-[10px] text-slate-500">{posLabel[p.position]}</span>
								</span>
							{/if}
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
							{@const cls = `rounded-lg border px-2 py-1 text-xs ${on
								? 'border-emerald-500/60 bg-emerald-500/20 text-emerald-200'
								: 'border-slate-700 bg-slate-800/60 text-slate-400'}`}
							{#if detail.live}
								<form method="POST" action="?/toggleMustIn" use:enhance>
									<input type="hidden" name="playerId" value={p.id} />
									<button
										type="submit"
										disabled={!on && inIds.size >= 3}
										class="{cls} transition hover:border-slate-500 disabled:opacity-40"
									>
										{on ? '✓ ' : ''}{p.name} <span class="tabular-nums text-slate-400">({p.points} · {formatPrice(p.price)})</span>
										<span class="text-[10px] text-slate-500">{posLabel[p.position]}</span>
									</button>
								</form>
							{:else}
								<span class={cls}>
									{on ? '✓ ' : ''}{p.name} <span class="tabular-nums text-slate-400">({p.points} · {formatPrice(p.price)})</span>
									<span class="text-[10px] text-slate-500">{posLabel[p.position]}</span>
								</span>
							{/if}
						{:else}
							<span class="text-xs text-slate-500">
								אין שחקנים ברשימת המחזור.{#if detail.live}
									<a href="/watchlist" class="underline">הוסף ב־/watchlist</a>{/if}
							</span>
						{/each}
					</div>
				</div>
			</div>

			{#if detail.live}
				<!-- «ספסל בלבד»: per player (not per matchday), squad + round list -->
				<div class="rounded-xl border border-slate-700/70 bg-slate-900/50 p-3">
					<h3 class="mb-1 text-sm font-semibold text-slate-300">
						ספסל בלבד <span class="text-slate-500">({c.benchOnly.length})</span>
					</h3>
					<p class="mb-2 text-[11px] text-slate-500">
						שחקנים שלא פותחים (למשל שוער מחליף). השיטות ו־/options ישימו אותם רק בספסל, אלא אם אין הרכב
						חוקי בלעדיהם. נשמר לשחקן — לא למחזור. המספרים: דקות ב־3 המחזורים האחרונים; מסומנים
						<span class="text-amber-300">כהצעה</span> מי ששיחקו 0 דקות בכולם.
					</p>
					{#each [{ label: 'מהסגל', list: c.squad }, { label: 'מרשימת המחזור', list: c.inbound }] as grp (grp.label)}
						{#if grp.list.length}
							<div class="mb-1 mt-2 text-[11px] text-slate-500">{grp.label}</div>
							<div class="flex flex-wrap gap-1.5">
								{#each grp.list as p (p.id)}
									{@const on = benchIds.has(p.id)}
									{@const suggested = suggestIds.has(p.id)}
									{@const mins = c.minutes[p.id]}
									<form method="POST" action="?/toggleBenchOnly" use:enhance>
										<input type="hidden" name="playerId" value={p.id} />
										<button
											type="submit"
											class="rounded-lg border px-2 py-1 text-xs transition hover:border-slate-500 {on
												? 'border-violet-500/60 bg-violet-500/20 text-violet-200'
												: suggested
													? 'border-dashed border-amber-400/70 bg-amber-500/10 text-amber-200'
													: 'border-slate-700 bg-slate-800/60 text-slate-400'}"
											title={suggested ? 'הצעה: 0 דקות במחזורים האחרונים' : undefined}
										>
											{on ? '🪑 ' : ''}{p.name}
											<span class="tabular-nums text-slate-400">({p.points} · {formatPrice(p.price)})</span>
											<span class="text-[10px] text-slate-500">{posLabel[p.position]}</span>
											{#if mins?.length}
												<span class="text-[10px] tabular-nums text-slate-500">· {mins.join('/')}′</span>
											{/if}
										</button>
									</form>
								{/each}
							</div>
						{/if}
					{/each}
				</div>
			{/if}

			{#snippet pickCard(p: NonNullable<typeof detail>['picks'][number])}
				<LineupCard
					title={p.mode ? `${p.label} · ${p.modeLabel}` : p.label}
					badge={p.points != null ? `${p.points} נק׳` : 'טרם דורג'}
					formation={p.formation ?? '—'}
					subtitle={p.metrics && objScore[p.objective] ? objScore[p.objective](p.metrics) : null}
					stats={cardStats(p.spend, p.metrics)}
					xi={p.xi}
					bench={p.bench}
					out={p.out}
					inn={p.in}
					diffLabel={detail.baseFromGw != null
						? `חילופים מול הקבוצה של מחזור ${detail.baseFromGw}`
						: 'חילופים מול הקבוצה השמורה'}
					actions={detail.live}
					sketchName={`${p.label}${p.modeLabel ? ` · ${p.modeLabel}` : ''} · מחזור ${detail.gameweekNumber}`}
					gameweekNumber={detail.gameweekNumber}
				>
				{#snippet badges()}
					{#if p.violations.length}
						<span class="relative">
							<button
								type="button"
								class="rounded-full bg-amber-500/20 px-2.5 py-1 text-xs font-medium text-amber-300 hover:bg-amber-500/30"
								title={warnTitle(p.violations)}
								aria-expanded={warnOpen === p.strategy}
								onclick={() => (warnOpen = warnOpen === p.strategy ? null : p.strategy)}
								>⚠ אילוצים ({p.violations.reduce((n, v) => n + v.players.length, 0)})</button
							>
							{#if warnOpen === p.strategy}
								<div
									class="absolute left-0 top-full z-30 mt-1 w-72 max-w-[80vw] rounded-xl border border-amber-500/40 bg-slate-950 p-3 text-right text-xs shadow-2xl"
								>
									<div class="mb-1.5 font-semibold text-amber-200">לא עומד באילוצים:</div>
									<ul class="space-y-1.5">
										{#each p.violations as v (v.kind)}
											<li>
												<div class="text-slate-300">{v.text}</div>
												<div class="text-amber-200">{v.players.join(' · ')}</div>
											</li>
										{/each}
									</ul>
								</div>
							{/if}
						</span>
					{/if}
				{/snippet}
			</LineupCard>
			{/snippet}

			{#if unmetCount}
				<div class="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm text-amber-100">
					⚠ {unmetCount === 1 ? 'הצעה אחת לא עומדת' : `${unmetCount} הצעות לא עומדות`} בכל האילוצים. הכרטיסים
					מסומנים ב־«⚠ אילוצים» — מעבר עכבר או לחיצה לפירוט.
				</div>
			{/if}

			<!-- View: every mode in collapsible rows, or «מוגבל בלבד» as one flat grid -->
			<div class="flex flex-wrap items-center justify-between gap-2">
				<h3 class="text-sm font-semibold text-slate-300">הרכבים</h3>
				<div class="flex gap-1">
					{#each [{ key: 'all', label: 'כל המצבים' }, { key: 'constrained', label: 'מוגבל בלבד' }] as v (v.key)}
						<button
							type="button"
							onclick={() => (pickView = v.key as PickView)}
							class="rounded-lg px-2.5 py-1 text-xs {pickView === v.key
								? 'bg-sky-500/20 text-sky-300'
								: 'bg-slate-800 text-slate-400'}">{v.label}</button
						>
					{/each}
				</div>
			</div>

			{#if pickView === 'constrained'}
				<p class="text-xs text-slate-500">
					הבחירה שלך + ההרכב של כל שיטה במצב «מוגבל» (מכבד את «לשחרר», «עדיף לא להוציא» ו«חייבים להיכנס»).
				</p>
				<div class="grid grid-cols-1 gap-5 lg:grid-cols-2 xl:grid-cols-3">
					{#each constrainedPicks as p (p.strategy)}
						{@render pickCard(p)}
					{/each}
				</div>
			{:else}
			<!-- One collapsible row per strategy; its 3 modes side by side from xl (≈ /options card width at full page width) -->
			<div class="space-y-3">
				{#each pickGroups as g (g.key)}
					{@const open = isRowOpen(g.key)}
					<div class="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/40">
						<button
							type="button"
							onclick={() => toggleRow(g.key)}
							aria-expanded={open}
							class="flex w-full flex-wrap items-center justify-between gap-2 px-4 py-3 text-right hover:bg-slate-800/50"
						>
							<span class="flex min-w-0 flex-1 flex-col gap-0.5">
								<span class="flex items-center gap-2 text-xl font-bold text-slate-100">
									<span class="inline-block h-3 w-3 rounded-full" style="background:{colorOf(g.key)}"></span>
									{g.label}
								</span>
							</span>
							<span class="flex items-center gap-2">
								{#if g.picks.some((p) => p.violations.length)}
									<span
										class="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs text-amber-300"
										title={g.picks
											.filter((p) => p.violations.length)
											.map((p) => `${p.modeLabel}:\n${warnTitle(p.violations)}`)
											.join('\n\n')}>⚠</span
									>
								{/if}
								{#each g.picks as p (p.strategy)}
									{#if p.points != null}
										<span class="rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-300">
											{p.modeLabel ? `${p.modeLabel} ` : ''}<span class="font-semibold text-white">{p.points}</span>
										</span>
									{/if}
								{/each}
								<span class="text-slate-500">{open ? '▾' : '▸'}</span>
							</span>
						</button>
						{#if open}
							{#if HOW[g.key]}
								<div class="mx-3 mt-3 rounded-lg border border-slate-700/60 bg-slate-800/40 px-3 py-2 text-xs leading-relaxed text-slate-300">
									<span class="font-semibold text-slate-200">איך זה מחושב:</span>
									{HOW[g.key]}
									{#if g.key !== 'actual'}<span class="block pt-1 text-slate-500">{HOW_COMMON}</span>{/if}
								</div>
							{/if}
							<div class="grid grid-cols-1 gap-5 p-3 xl:grid-cols-3">
								{#each g.picks as p (p.strategy)}
									{@render pickCard(p)}
								{/each}
							</div>
						{/if}
					</div>
				{/each}
			</div>
			{/if}
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
			<div class="mb-2 flex flex-wrap items-center justify-between gap-2">
				<h2 class="text-sm font-semibold text-slate-300">
					דירוג — כל הגרסאות מול הבחירה שלך
					<span class="font-normal text-slate-500"
						>· {boardView === 'total'
							? `סה״כ ${scoredGws.length} ${scoredGws.length === 1 ? 'מחזור' : 'מחזורים'}`
							: `מחזור ${boardGw}`}</span
					>
				</h2>
				<div class="flex flex-wrap items-center gap-2">
					<div class="flex gap-1">
						<button
							type="button"
							onclick={() => (boardView = 'total')}
							class="rounded-lg px-2.5 py-1 text-xs {boardView === 'total'
								? 'bg-sky-500/20 text-sky-300'
								: 'bg-slate-800 text-slate-400'}">סה״כ עונה</button
						>
						<button
							type="button"
							onclick={() => (boardView = 'gw')}
							class="rounded-lg px-2.5 py-1 text-xs {boardView === 'gw'
								? 'bg-sky-500/20 text-sky-300'
								: 'bg-slate-800 text-slate-400'}">לפי מחזור</button
						>
					</div>
					{#if boardView === 'gw'}
						<div class="flex items-center gap-1">
							<button
								type="button"
								disabled={boardPrev == null}
								onclick={() => (boardGwPick = boardPrev)}
								aria-label="מחזור קודם"
								class="rounded-lg bg-slate-800 px-2 py-1 text-xs text-slate-200 disabled:bg-slate-900 disabled:text-slate-600"
								>→</button
							>
							<span class="min-w-14 text-center text-xs text-slate-300">מחזור {boardGw}</span>
							<button
								type="button"
								disabled={boardNext == null}
								onclick={() => (boardGwPick = boardNext)}
								aria-label="מחזור הבא"
								class="rounded-lg bg-slate-800 px-2 py-1 text-xs text-slate-200 disabled:bg-slate-900 disabled:text-slate-600"
								>←</button
							>
						</div>
					{/if}
				</div>
			</div>
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
						{@const pts = boardPts(s)}
						{@const d = pts == null ? null : pts - actualOver(s)}
						<tr class="border-t border-slate-800 {s.key === boardLeader ? 'bg-emerald-500/10' : ''}">
							<td class="py-1.5 pl-2 text-slate-500">{i + 1}</td>
							<td class="py-1.5">
								<span class="flex items-center gap-1.5">
									<span class="inline-block h-2.5 w-2.5 rounded-full" style="background:{colorOf(s.objective)}"></span>
									<span class="text-slate-200">{s.label}</span>
									{#if boardView === 'total' && s.partial && s.fromGw != null}
										<span
											class="text-[10px] text-slate-500"
											title="השיטה נוספה מאוחר יותר — הסה״כ וההפרש מולך מחושבים רק על המחזורים שיש לה נתונים"
											>מ־מחזור {s.fromGw}</span
										>
									{/if}
								</span>
							</td>
							<td class="px-2 py-1.5 text-center">
								{#if s.modeLabel}
									<span class="rounded-full bg-slate-800 px-2 py-0.5 text-[11px] text-slate-300">{s.modeLabel}</span>
								{:else}
									<span class="text-[11px] text-slate-500">—</span>
								{/if}
							</td>
							<td class="px-2 py-1.5 text-center font-semibold {pts == null ? 'text-slate-500' : 'text-white'}"
								>{pts ?? '—'}</td
							>
							<td class="px-2 py-1.5 text-center">
								{#if s.key === 'actual'}
									<span class="text-[11px] text-slate-500">הבחירה שלך</span>
								{:else if d == null}
									<span class="text-[11px] text-slate-500">—</span>
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
			{#if boardView === 'total' && st.series.some((s) => s.partial)}
				<p class="mt-2 text-[11px] text-slate-500">
					«מ־מחזור N» — שיטה שנוספה מאוחר יותר: הסה״כ שלה כולל רק את המחזורים שיש לה נתונים, וההפרש מולך
					מחושב רק על אותם מחזורים.
				</p>
			{/if}
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
				{/each}
				{#each chartSeries as s (s.key)}
					{#each s.perGw as p, i}
						{#if p.cumulative != null}
						{@const v = Math.round(p.cumulative)}
						{@const y = labelY.get(s.key)?.[i] ?? yFor(p.cumulative)}
						{@const w = labelW(s.label, v)}
						{@const x = labelX(xFor(i), w)}
						<g>
							<rect
								x={x - w / 2}
								y={y - LABEL_H / 2}
								width={w}
								height={LABEL_H}
								rx="7"
								fill={colorOf(s.objective)}
								stroke="#0f172a"
								stroke-width="1.5"
							/>
							<text x={x} y={y + 3.5} text-anchor="middle" direction="rtl" font-size="10" fill="#0f172a"
								>{s.label} · <tspan font-weight="700">{v}</tspan></text
							>
						</g>
						{/if}
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
