<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import LineupCard from '$lib/components/LineupCard.svelte';
	import { EASE_SCORE } from '$lib/difficulty';
	import { downloadCardsZip } from '$lib/lineupPng';
	import { formationLabel } from '$lib/positions';
	import { isExactSquad, readSquadDraft, type SquadDraft } from '$lib/squadDraft';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let draft = $state<SquadDraft | null>(null);

	onMount(() => {
		draft = readSquadDraft();
	});

	type Sketch = PageData['sketches'][number];

	/** One entry per distinct lineup: newer identical copies fold into the oldest. */
	const shown = $derived(data.sketches.filter((s) => !s.duplicateOf));
	const duplicateGroups = $derived(shown.filter((s) => s.duplicates.length > 0));
	/** Folded copies the user chose to look at anyway. */
	let expandedDup = $state<Set<number>>(new Set());

	/**
	 * Lineups already downloaded this matchday, by content (`lineupKey`): server marks plus the ones
	 * saved in this visit (shown at once, before the reload brings them back from the DB).
	 */
	let justDownloaded = $state<Set<string>>(new Set());
	const isDownloaded = (s: Sketch) => s.downloaded || justDownloaded.has(s.lineupKey);
	async function markDownloaded(keys: string[]) {
		if (!keys.length) return;
		justDownloaded = new Set([...justDownloaded, ...keys]);
		const body = new FormData();
		body.set('gameweekNumber', String(data.gw));
		for (const k of keys) body.append('lineupKey', k);
		await fetch('?/markDownloaded', { method: 'POST', body, headers: { 'x-sveltekit-action': 'true' } });
		await invalidateAll();
	}

	/** «הורד הכל»: every card on screen (folded identical copies skipped) as PNGs in one zip. */
	let downloadingAll = $state(false);
	async function downloadAll() {
		if (downloadingAll) return;
		downloadingAll = true;
		try {
			const cards = data.sketches.flatMap((s) => {
				const el = document.querySelector<HTMLElement>(`#sketch-${s.id} > article`);
				return el ? [{ el, name: `${s.name} · מחזור ${data.gw}`, key: s.lineupKey }] : [];
			});
			if (!cards.length) return;
			await downloadCardsZip(cards, `סקיצות · מחזור ${data.gw}`);
			await markDownloaded(cards.map((c) => c.key));
		} finally {
			downloadingAll = false;
		}
	}

	const hasTeamRules = $derived(data.teamRules.requiredTeamIds.length + data.teamRules.noInTeamIds.length > 0);
	const meetingRules = $derived(shown.filter((s) => s.teamRuleIssues.length === 0).length);

	const fmtWhen = (d: Date | string) =>
		new Date(d).toLocaleString('he-IL', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });
	type Ins = Sketch['insights'];

	const fmtEase = (n: number) => (n > 0 ? `+${n.toFixed(2)}` : n.toFixed(2));
	const riskCount = (i: Ins) => i.risks.reduce((n, r) => n + r.players.length, 0) + i.hardThisMatchday.length;

	/** Comparison columns: value, display, and which direction is better (for the «best» highlight). */
	const COLUMNS: { key: string; label: string; hint?: string; help?: string; get: (i: Ins) => number; show: (i: Ins) => string; better: 'high' | 'low' | 'none' }[] = [
		{ key: 'remaining', label: 'פנוי', get: (i) => i.remaining, show: (i) => `${i.remaining}`, better: 'high' },
		{ key: 'xiPoints', label: 'נק׳ עונה (XI)', get: (i) => i.xiPoints, show: (i) => `${i.xiPoints}`, better: 'high' },
		{ key: 'xiForm', label: 'מחזור אחרון (XI)', get: (i) => i.xiForm, show: (i) => `${i.xiForm}`, better: 'high' },
		{ key: 'xiVlfm', label: 'vlfm', get: (i) => i.xiVlfm, show: (i) => i.xiVlfm.toFixed(2), better: 'high' },
		{ key: 'easeMatchday', label: 'לוח מחזור', help: 'המשחק של המחזור הזה בלבד (אין משחק במחזור → המשחק הבא).', get: (i) => i.easeMatchday, show: (i) => fmtEase(i.easeMatchday), better: 'high' },
		{ key: 'ease3', label: 'לוח 3', help: 'לכל שחקן: ממוצע 3 המשחקים הקרובים, החל מהמחזור הזה.', get: (i) => i.ease3, show: (i) => fmtEase(i.ease3), better: 'high' },
		{ key: 'ease5', label: 'לוח 5', help: 'לכל שחקן: ממוצע 5 המשחקים הקרובים, החל מהמחזור הזה.', get: (i) => i.ease5, show: (i) => fmtEase(i.ease5), better: 'high' },
		{
			key: 'volatility',
			label: 'תנודתיות',
			hint: 'טווח צפוי (סטיית תקן) של סך נקודות ה־XI במחזור: פיזור הנקודות של כל שחקן, צמדים מאותה קבוצה שזזים יחד (מעלה), והגנה מול התקפה יריבה באותו משחק שמתקזזות (מוריד). גבוה = יותר סיכוי ויותר סיכון; לא טוב או רע כשלעצמו',
			get: (i) => i.volatility,
			show: (i) => `±${i.volatility}`,
			better: 'none'
		},
		{ key: 'risks', label: 'סיכונים', hint: 'פצועים/מורחקים, דקות נמוכות, «ספסל בלבד» בהרכב, ספסל שלא משחק, משחק קשה במחזור', get: riskCount, show: (i) => `${riskCount(i)}`, better: 'low' }
	];
	/** «?» on a column header: hover shows it, a click pins it (same as /squad). */
	const HELP_WIDTH = 256; // w-64
	let helpTip = $state<{ key: string; label: string; text: string; top: number; left: number; pinned: boolean } | null>(null);
	function showHelp(c: { key: string; label: string; help?: string }, el: HTMLElement, pinned = false) {
		const rect = el.getBoundingClientRect();
		helpTip = {
			key: c.key,
			label: c.label,
			text: c.help ?? '',
			top: rect.bottom + 6,
			left: Math.max(8, rect.right - HELP_WIDTH),
			pinned
		};
	}
	function toggleHelp(c: { key: string; label: string; help?: string }, el: HTMLElement) {
		if (helpTip?.key === c.key && helpTip.pinned) helpTip = null;
		else showHelp(c, el, true);
	}
	const signed = (n: number) => (n > 0 ? `+${n}` : `−${-n}`);

	/** Best value per column among the shown sketches (only when there's something to compare). */
	const best = $derived.by(() => {
		const out: Record<string, number> = {};
		if (shown.length < 2) return out;
		for (const c of COLUMNS) {
			if (c.better === 'none') continue; // e.g. volatility: lower isn't always better
			const vals = shown.map((s) => c.get(s.insights));
			out[c.key] = c.better === 'high' ? Math.max(...vals) : Math.min(...vals);
		}
		return out;
	});
	// Sortable comparison table. null = server order (newest first).
	type SortKey = 'name' | 'valid' | 'rules' | 'out' | 'in' | (typeof COLUMNS)[number]['key'];
	let sortKey = $state<SortKey | null>(null);
	let sortDir = $state<'asc' | 'desc'>('desc');
	function sortBy(key: SortKey) {
		if (sortKey === key) {
			sortDir = sortDir === 'asc' ? 'desc' : 'asc';
			return;
		}
		sortKey = key;
		// First click puts the «better» end on top (high for points/ease, low for risks…).
		const col = COLUMNS.find((c) => c.key === key);
		sortDir = key === 'name' || key === 'rules' || col?.better === 'low' ? 'asc' : 'desc';
	}
	const sortValue = (s: Sketch, key: SortKey): number | string => {
		if (key === 'name') return s.name;
		if (key === 'valid') return s.insights.valid ? 1 : 0;
		if (key === 'rules') return s.teamRuleIssues.length;
		if (key === 'out') return s.transfers.out.length;
		if (key === 'in') return s.transfers.in.length;
		return COLUMNS.find((c) => c.key === key)!.get(s.insights);
	};
	const sortedSketches = $derived.by(() => {
		if (!sortKey) return shown;
		const k = sortKey;
		const dir = sortDir === 'asc' ? 1 : -1;
		return [...shown].sort((a, b) => {
			const va = sortValue(a, k);
			const vb = sortValue(b, k);
			const cmp = typeof va === 'string' ? va.localeCompare(String(vb), 'he') : va - (vb as number);
			return cmp * dir || +new Date(b.updatedAt) - +new Date(a.updatedAt);
		});
	});
	const mark = (key: SortKey) => (sortKey === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '');

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
	{#if helpTip}
		<div
			class="fixed z-[210] w-64 rounded-lg border border-slate-600 bg-slate-950 px-2.5 py-2 text-[11px] leading-snug text-slate-200 shadow-xl"
			style="top: {helpTip.top}px; left: {helpTip.left}px;"
			role="tooltip"
		>
			<strong class="text-emerald-300">{helpTip.label}</strong>
			{helpTip.text}
			<br />כל משחק מקבל ציון לפי קושי היריב: ירוק {signed(EASE_SCORE.green)} · צהוב {signed(EASE_SCORE.yellow)} · אדום {signed(EASE_SCORE.red)}.
			<br />הקושי נקבע לפי העמדה: לשוער/הגנה לפי ההתקפה של היריב, לקישור/התקפה לפי ההגנה שלו.
			<br />התוצאה היא ממוצע 11 שחקני ההרכב (בלי הספסל). גבוה = קל.
		</div>
	{/if}
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
		{#if data.sketches.length}
			<button
				type="button"
				class="rounded-lg border border-slate-600 px-3 py-1.5 text-sm text-white hover:bg-slate-800 disabled:opacity-50"
				disabled={downloadingAll}
				onclick={downloadAll}
				title="הורד את כל ההרכבים במחזור כתמונות PNG (קובץ zip)"
			>
				{downloadingAll ? 'מוריד…' : 'הורד הכל'}
			</button>
		{/if}
	</header>

	{#snippet teamRuleRow(rule: 'required' | 'noIn', label: string, hint: string, selected: number[], onClass: string)}
		<form method="POST" action="?/toggleTeamRule" use:enhance class="space-y-1.5">
			<input type="hidden" name="gameweekNumber" value={data.gw} />
			<input type="hidden" name="rule" value={rule} />
			<p class="text-xs text-slate-300">{label} <span class="text-slate-500">· {hint}</span></p>
			<div class="flex flex-wrap gap-1.5">
				{#each data.teams as t (t.id)}
					{@const on = selected.includes(t.id)}
					<button
						type="submit"
						name="teamId"
						value={t.id}
						aria-pressed={on}
						class="flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs {on
							? onClass
							: 'border-slate-700 text-slate-400 hover:bg-slate-800'}"
					>
						{#if t.logo}<img src={t.logo} alt="" class="h-4 w-4 object-contain" />{/if}
						{t.name}
					</button>
				{/each}
			</div>
		</form>
	{/snippet}

	<section class="space-y-3 rounded-2xl border border-slate-700/80 bg-slate-900/70 p-3">
		<h2 class="text-sm font-semibold text-slate-300">
			אילוצי מחזור {data.gw}
			{#if hasTeamRules && shown.length}
				<span class="font-normal text-slate-500">· {meetingRules} מתוך {shown.length} סקיצות עומדות בהם</span>
			{/if}
		</h2>
		{@render teamRuleRow(
			'required',
			'לפחות שחקן אחד מ:',
			'בהרכב או בספסל',
			data.teamRules.requiredTeamIds,
			'border-emerald-500/60 bg-emerald-500/20 text-emerald-100'
		)}
		{@render teamRuleRow(
			'noIn',
			'לא להכניס שחקנים מ:',
			data.transferBaseGw != null ? `מי שכבר בקבוצה של מחזור ${data.transferBaseGw} יכול להישאר` : 'מי שכבר בקבוצה השמורה יכול להישאר',
			data.teamRules.noInTeamIds,
			'border-red-500/60 bg-red-500/20 text-red-100'
		)}
	</section>

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
					data-png-skip
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

		{#each duplicateGroups as s (s.id)}
			{@const copies = [s, ...s.duplicates]}
			{@const orderOnly = s.duplicates.some((d) => d.benchOrderDiffers)}
			<div class="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
				<p class="text-amber-100">
					<span class="font-semibold">{copies.length} סקיצות זהות</span>
					— אותם 11 בהרכב ואותם 4 בספסל{orderOnly ? ' (רק סדר הספסל שונה)' : ''}:
					{#each copies as c, k (c.id)}
						<button type="button" class="text-white underline decoration-amber-400/50 hover:text-amber-200" onclick={() => focusSketch(c.id)}
							>«{c.name}»</button
						>
						<span class="text-xs text-amber-200/70">{fmtWhen(c.updatedAt)}{k === 0 ? ' · הישנה' : ''}</span>{k < copies.length - 1 ? ' · ' : ''}
					{/each}
				</p>
				<form method="POST" action="?/deleteMany" use:enhance>
					<input type="hidden" name="ids" value={s.duplicates.map((d) => d.id).join(',')} />
					<button
						type="submit"
						class="rounded-xl border border-amber-400/50 px-3 py-1.5 text-sm font-medium text-amber-100 hover:bg-amber-500/20"
						title={orderOnly ? 'סדר הספסל קובע מי נכנס ראשון — השאר את הישנה רק אם הסדר שלה הוא הנכון' : undefined}
					>
						השאר את הישנה, מחק {s.duplicates.length === 1 ? 'את הכפולה' : `${s.duplicates.length} כפולות`}
					</button>
				</form>
			</div>
		{/each}

		{#if shown.length > 1}
			<!-- Side-by-side comparison; the best value per column is highlighted -->
			<div class="overflow-x-auto rounded-2xl border border-slate-700/80 bg-slate-900/70 p-3">
				<h2 class="mb-2 text-sm font-semibold text-slate-300">
					השוואה <span class="font-normal text-slate-500">· הירוק = הטוב ביותר בעמודה · לוח: גבוה = קל</span>
				</h2>
				<table class="w-full min-w-[56rem] text-right text-xs">
					<thead class="text-slate-400">
						<tr>
							<th class="py-1 pl-2 font-medium" aria-sort={sortKey === 'name' ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined}>
								<button type="button" class="hover:text-slate-200" onclick={() => sortBy('name')}>סקיצה{mark('name')}</button>
							</th>
							<th class="px-1.5 py-1 text-center font-medium">
								<button type="button" class="hover:text-slate-200" onclick={() => sortBy('valid')}>חוקי{mark('valid')}</button>
							</th>
							{#if hasTeamRules}
								<th class="px-1.5 py-1 text-center font-medium">
									<button type="button" class="hover:text-slate-200" title="אילוצי המחזור שהסקיצה מפרה" onclick={() => sortBy('rules')}
										>אילוצים{mark('rules')}</button
									>
								</th>
							{/if}
							<th class="px-1.5 py-1 font-medium">
								<button type="button" class="hover:text-slate-200" title="מספר היוצאים" onclick={() => sortBy('out')}
									>יוצאים{mark('out')}</button
								>
							</th>
							<th class="px-1.5 py-1 font-medium">
								<button type="button" class="hover:text-slate-200" title="מספר הנכנסים" onclick={() => sortBy('in')}
									>נכנסים{mark('in')}</button
								>
							</th>
							{#each COLUMNS as c (c.key)}
								<th
									class="px-1.5 py-1 text-center font-medium"
									aria-sort={sortKey === c.key ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined}
								>
									<span class="inline-flex items-center gap-1">
										<button type="button" class="hover:text-slate-200" title={c.hint} onclick={() => sortBy(c.key)}
											>{c.label}{mark(c.key)}</button
										>
										{#if c.help}
											<button
												type="button"
												class="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-slate-700 text-[10px] font-bold text-slate-200 hover:bg-slate-600"
												aria-label="איך מחושב {c.label}"
												onclick={(e) => toggleHelp(c, e.currentTarget)}
												onmouseenter={(e) => showHelp(c, e.currentTarget)}
												onmouseleave={() => {
													if (helpTip?.key === c.key && !helpTip.pinned) helpTip = null;
												}}>?</button
											>
										{/if}
									</span>
								</th>
							{/each}
							<th class="w-6 py-1"><span class="sr-only">מחיקה</span></th>
						</tr>
					</thead>
					<tbody>
						{#each sortedSketches as s (s.id)}
							<tr class="border-t border-slate-800">
								<td class="max-w-[16rem] truncate py-1.5 pl-2">
									{@render nameEditor(s, 'table')}
									{#if isDownloaded(s)}
										<span class="text-[10px] text-emerald-300" title="כבר הורד כתמונה">✓ הורד</span>
									{/if}
									{#if s.duplicates.length}
										<span
											class="rounded-full bg-amber-500/20 px-1.5 text-[10px] font-medium text-amber-200"
											title="זהה ל: {s.duplicates.map((d) => `«${d.name}»`).join(', ')}">×{s.duplicates.length + 1}</span
										>
									{/if}
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
								{#if hasTeamRules}
									<td
										class="px-1.5 text-center {s.teamRuleIssues.length ? 'text-red-300' : 'text-emerald-300'}"
										title={s.teamRuleIssues.join(' · ')}>{s.teamRuleIssues.length ? `✕ ${s.teamRuleIssues.length}` : '✓'}</td
									>
								{/if}
								<td class="max-w-[18rem] px-1.5 text-red-200">
									{#if s.transfers.out.length}
										{s.transfers.out.map((p) => p.name).join(', ')}
									{:else}
										<span class="text-slate-500">—</span>
									{/if}
								</td>
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
								<td class="px-1 text-center">
									<form method="POST" action="?/delete" use:enhance>
										<input type="hidden" name="id" value={s.id} />
										<button
											type="submit"
											class="rounded px-1 text-slate-500 hover:bg-red-500/15 hover:text-red-300"
											title="מחק את «{s.name}»"
											aria-label="מחק את {s.name}">✕</button
										>
									</form>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}

		<div class="grid gap-5 lg:grid-cols-2">
			{#each data.sketches as s (s.id)}
				{#if s.duplicateOf && !expandedDup.has(s.id)}
					<!-- Newer copy of an identical lineup: one line instead of a second, identical card -->
					<div
						id="sketch-{s.id}"
						class="flex scroll-mt-20 flex-wrap items-center justify-between gap-2 rounded-2xl border border-dashed border-slate-700 bg-slate-900/40 px-4 py-3 text-sm {blinkId === s.id ? 'ring-blink' : ''}"
						onanimationend={() => (blinkId = null)}
					>
						<p class="text-slate-400">
							<span class="text-slate-200">«{s.name}»</span>
							<span class="text-xs">{fmtWhen(s.updatedAt)}</span>
							{#if isDownloaded(s)}<span class="text-xs text-emerald-300">✓ הורד</span>{/if}
							— זהה ל־<button type="button" class="text-emerald-300 hover:underline" onclick={() => focusSketch(s.duplicateOf!.id)}
								>«{s.duplicateOf.name}»</button
							>{s.duplicateOf.benchOrderDiffers ? ' (סדר ספסל שונה)' : ''}
						</p>
						<div class="flex gap-2">
							<button
								type="button"
								class="rounded-lg border border-slate-600 px-2.5 py-1 text-xs text-slate-200 hover:bg-slate-800"
								onclick={() => (expandedDup = new Set([...expandedDup, s.id]))}>הצג</button
							>
							<form method="POST" action="?/delete" use:enhance>
								<input type="hidden" name="id" value={s.id} />
								<button type="submit" class="rounded-lg border border-slate-600 px-2.5 py-1 text-xs text-slate-200 hover:bg-red-500/15 hover:text-red-200"
									>מחק</button
								>
							</form>
						</div>
					</div>
				{:else}
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
						{ label: 'לוח 5', value: fmtEase(s.insights.ease5), tone: 'text-emerald-200' },
						{ label: 'תנודתיות', value: `±${s.insights.volatility} נק׳`, tone: 'text-amber-200' }
					]}
					formation={formationLabel(s.xiPlayers)}
					xi={s.xiPlayers}
					bench={s.benchPlayers}
					out={s.transfers.out}
					inn={s.transfers.in}
					diffLabel={data.transferBaseGw != null
						? `חילופים מול הקבוצה של מחזור ${data.transferBaseGw}`
						: 'חילופים מול הקבוצה השמורה'}
					actions
					sketchButton={false}
					downloadName={`${s.name} · מחזור ${data.gw}`}
					onDownloaded={() => markDownloaded([s.lineupKey])}
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
							{#if s.teamRuleIssues.length}
								<li class="text-red-300">✕ אילוצי מחזור: {s.teamRuleIssues.join(' · ')}</li>
							{:else if hasTeamRules}
								<li class="text-emerald-300">✓ עומד באילוצי המחזור</li>
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
							{#if i.linkedPairs.length}
								<li class="text-slate-300" title="שחקנים מאותה קבוצה משחקים באותו משחק — הנקודות שלהם עולות ויורדות יחד">
									🔗 זזים יחד:
									{#each i.linkedPairs as lp, k (k)}
										<span class="text-slate-200">{lp.players.join(' + ')}</span>
										<span class="text-slate-500"
											>({lp.kind === 'attack' ? 'התקפה' : lp.kind === 'defence' ? 'שער נקי' : 'חלש'})</span
										>{k < i.linkedPairs.length - 1 ? ' · ' : ''}
									{/each}
								</li>
							{/if}
							{#if i.hedgePairs.length}
								<li
									class="text-slate-300"
									title="שוער/מגן שלך מול חלוץ/קשר שלך מהקבוצה היריבה באותו משחק: כשהתוקף כובש, ההגנה מאבדת שער נקי — הנקודות מתקזזות"
								>
									⚖️ מתקזזים:
									<span class="text-slate-200">{i.hedgePairs.map((h) => h.players.join(' מול ')).join(' · ')}</span>
								</li>
							{/if}
							{#each i.risks as r (r.kind)}
								<li class="text-amber-300">⚠ {r.text}: <span class="text-amber-100">{r.players.join(', ')}</span></li>
							{/each}
						</ul>
					{/snippet}
					{#snippet badges()}
						{#if s.duplicateOf}
							<span class="rounded-full bg-amber-500/20 px-2.5 py-1 text-xs font-medium text-amber-200" title="אותם 11 + 4">
								= «{s.duplicateOf.name}»
							</span>
						{:else if s.duplicates.length}
							<span
								class="rounded-full bg-amber-500/20 px-2.5 py-1 text-xs font-medium text-amber-200"
								title="זהה ל: {s.duplicates.map((d) => `«${d.name}»`).join(', ')}"
							>
								×{s.duplicates.length + 1} זהות
							</span>
						{/if}
						{#if isDownloaded(s)}
							<span
								class="rounded-full bg-emerald-500/20 px-2.5 py-1 text-xs font-medium text-emerald-200"
								title="ההרכב הזה כבר הורד כתמונה (לפי השחקנים, גם אם הסקיצה נמחקה ונשמרה מחדש)"
								data-png-skip
							>
								✓ הורד
							</span>
						{/if}
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
				{/if}
			{/each}
		</div>
	{/if}
</div>
