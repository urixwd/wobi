<script lang="ts">
	import PlayerRow from '$lib/components/PlayerRow.svelte';
	import LineupCard from '$lib/components/LineupCard.svelte';
	import { enhance } from '$app/forms';
	import type { TransferCombo } from '$lib/server/matchdayTransfers';

	let { data, form } = $props();
	let q = $state('');
	let list: 'permanent' | 'round' = $state('round');

	const filtered = $derived(
		data.allPlayers.filter(
			(r) => !q.trim() || r.player.name.includes(q.trim()) || (r.teamName ?? '').includes(q.trim())
		)
	);

	const permIds = $derived(new Set(data.permanent.map((i) => i.player.id)));
	const roundIds = $derived(new Set(data.round.map((i) => i.player.id)));

	const transfers = $derived(data.transfers);
	type Obj = (typeof transfers)['byObjective'][number];
	type Variant = Obj['variants'][number];
	const outSet = $derived(new Set(data.forcedOut));
	const inSet = $derived(new Set(data.forcedIn));
	const MAX_OUT = 3;
	const MAX_IN = 3;
	const posLabel: Record<number, string> = { 1: 'שוער', 2: 'הגנה', 3: 'קישור', 4: 'התקפה' };

	// Both pickers persist server-side per matchday (forms below).

	// Mode filter (חופשי / יציאה בלבד / מוגבל), persisted locally.
	const allModes = $derived(
		transfers.byObjective[0]?.variants.map((v) => ({ key: v.mode, label: v.modeLabel })) ?? []
	);
	const MODES_KEY = 'wobi.watchlist.modes';
	let selectedModes = $state<string[]>(['constrained', 'out', 'free']);
	let modesLoaded = $state(false);
	$effect(() => {
		if (!modesLoaded) {
			modesLoaded = true;
			try {
				const raw = localStorage.getItem(MODES_KEY);
				if (raw) {
					const a = JSON.parse(raw);
					if (Array.isArray(a) && a.length) selectedModes = a;
				}
			} catch {
				/* ignore */
			}
			return;
		}
		try {
			localStorage.setItem(MODES_KEY, JSON.stringify(selectedModes));
		} catch {
			/* ignore */
		}
	});
	let modeMenuOpen = $state(false);
	function toggleMode(key: string) {
		if (selectedModes.includes(key)) {
			if (selectedModes.length === 1) return; // keep at least one
			selectedModes = selectedModes.filter((k) => k !== key);
		} else {
			selectedModes = [...selectedModes, key];
		}
	}
	const shownModes = $derived(allModes.filter((m) => selectedModes.includes(m.key)));
	const singleMode = $derived(shownModes.length === 1);

	// Per-objective collapse — default all collapsed, persisted locally.
	// A section is open only when its key is explicitly false.
	const COLLAPSE_KEY = 'wobi.watchlist.collapsed';
	let collapsed = $state<Record<string, boolean>>({});
	let collapseLoaded = $state(false);
	$effect(() => {
		if (!collapseLoaded) {
			collapseLoaded = true;
			try {
				const raw = localStorage.getItem(COLLAPSE_KEY);
				if (raw) {
					const o = JSON.parse(raw);
					if (o && typeof o === 'object') collapsed = o;
				}
			} catch {
				/* ignore */
			}
			return;
		}
		try {
			localStorage.setItem(COLLAPSE_KEY, JSON.stringify(collapsed));
		} catch {
			/* ignore */
		}
	});
	const isOpen = (key: string) => collapsed[key] === false;
	const toggleCollapse = (key: string) => (collapsed[key] = isOpen(key) ? true : false);

	function comboStats(c: TransferCombo) {
		return [
			{ label: 'הוצאה', value: `${c.spend} / 120`, tone: 'text-white' },
			{ label: 'פנוי', value: `${c.remaining}`, tone: 'text-emerald-300' },
			{ label: 'נק׳ הרכב', value: `${c.points}`, tone: 'text-sky-300' },
			{ label: 'vlfm', value: c.vlfm.toFixed(2), tone: 'text-violet-300' }
		];
	}

	const objSubtitle: Record<string, (c: TransferCombo) => string> = {
		points: (c) => `${c.points} נק׳ · מערך ${c.formation}`,
		vlfm: (c) => `vlfm ממוצע ${c.vlfm.toFixed(2)} · פנוי ${c.remaining}`,
		fixtures: (c) => `קלות לוח מחזור ${c.matchdayEase.toFixed(2)} · ${c.formation}`,
		fixtures5: (c) => `קלות לוח 5 מחזורים ${c.fixtureEase5.toFixed(2)} · ${c.formation}`,
		form: (c) => `${c.form} נק׳ במחזור האחרון · ${c.formation}`
	};
</script>

<section class="space-y-6">
	<div>
		<h1 class="text-2xl font-bold">מעקב</h1>
		<p class="text-sm text-slate-400">רשימה קבועה + רשימה רלוונטית למחזור הנוכחי.</p>
	</div>

	<div class="grid gap-6 lg:grid-cols-2">
		<div class="space-y-4">
			<div>
				<h2 class="mb-2 font-semibold text-emerald-300">מעקב קבוע</h2>
				<div class="space-y-2">
					{#each data.permanent as item}
						<div class="flex items-start gap-2">
							<div class="flex-1">
								<PlayerRow
									name={item.player.name}
									teamName={item.teamName}
									position={item.player.position}
									price={item.player.price}
									playerStats={item.player}
									logoPath={item.teamLogo ?? item.player.teamLogoPath}
									difficulty={item.difficulty}
									injured={item.player.injuredStatus}
									expelled={item.player.expelledStatus}
									missing={item.player.missingStatus === 1}
									upcomingFixtures={item.upcomingFixtures}
								/>
							</div>
							<div class="flex flex-col gap-1">
								{#if roundIds.has(item.player.id)}
									<span class="rounded-lg bg-slate-800 px-2 py-1 text-center text-xs text-slate-500"
										>✓ במחזור</span
									>
								{:else}
									<form method="POST" action="?/addRound" use:enhance>
										<input type="hidden" name="playerId" value={item.player.id} />
										<button
											class="w-full rounded-lg bg-sky-500/20 px-2 py-1 text-xs text-sky-300"
											type="submit"
											title="הוסף לרשימת המחזור">＋ למחזור</button
										>
									</form>
								{/if}
								<form method="POST" action="?/removePermanent" use:enhance>
									<input type="hidden" name="id" value={item.row.id} />
									<button class="rounded-lg bg-slate-800 px-2 py-1 text-xs text-red-300" type="submit"
										>הסר</button
									>
								</form>
							</div>
						</div>
					{:else}
						<p class="text-sm text-slate-500">אין עדיין שחקנים במעקב הקבוע.</p>
					{/each}
				</div>
			</div>

			<div>
				<h2 class="mb-2 font-semibold text-sky-300">רלוונטי למחזור</h2>
				<div class="space-y-2">
					{#each data.round as item}
						<div class="flex items-start gap-2">
							<div class="flex-1">
								<PlayerRow
									name={item.player.name}
									teamName={item.teamName}
									position={item.player.position}
									price={item.player.price}
									playerStats={item.player}
									logoPath={item.teamLogo ?? item.player.teamLogoPath}
									difficulty={item.difficulty}
									injured={item.player.injuredStatus}
									expelled={item.player.expelledStatus}
									missing={item.player.missingStatus === 1}
									upcomingFixtures={item.upcomingFixtures}
								/>
							</div>
							<div class="flex flex-col gap-1">
								{#if permIds.has(item.player.id)}
									<span class="rounded-lg bg-slate-800 px-2 py-1 text-center text-xs text-slate-500"
										>✓ בקבוע</span
									>
								{:else}
									<form method="POST" action="?/addPermanent" use:enhance>
										<input type="hidden" name="playerId" value={item.player.id} />
										<button
											class="w-full rounded-lg bg-emerald-500/20 px-2 py-1 text-xs text-emerald-300"
											type="submit"
											title="הוסף למעקב הקבוע">＋ לקבוע</button
										>
									</form>
								{/if}
								<form method="POST" action="?/removeRound" use:enhance>
									<input type="hidden" name="id" value={item.row.id} />
									<button class="rounded-lg bg-slate-800 px-2 py-1 text-xs text-red-300" type="submit"
										>הסר</button
									>
								</form>
							</div>
						</div>
					{:else}
						<p class="text-sm text-slate-500">אין שחקנים ברשימת המחזור.</p>
					{/each}
				</div>
			</div>
		</div>

		<div class="space-y-3">
			<div class="flex flex-wrap gap-2">
				<input
					bind:value={q}
					placeholder="חיפוש להוספה"
					class="flex-1 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
				/>
				<button
					type="button"
					class="rounded-lg px-3 py-1 text-sm {list === 'permanent'
						? 'bg-emerald-500/20 text-emerald-300'
						: 'bg-slate-800'}"
					onclick={() => (list = 'permanent')}>קבוע</button
				>
				<button
					type="button"
					class="rounded-lg px-3 py-1 text-sm {list === 'round' ? 'bg-sky-500/20 text-sky-300' : 'bg-slate-800'}"
					onclick={() => (list = 'round')}>מחזור</button
				>
			</div>
			<div class="max-h-[70vh] space-y-2 overflow-y-auto">
				{#each filtered.slice(0, 60) as r}
					<div class="flex items-start gap-2">
						<div class="flex-1">
							<PlayerRow
								name={r.player.name}
								teamName={r.teamName}
								position={r.player.position}
								price={r.player.price}
								playerStats={r.player}
								logoPath={r.teamLogo ?? r.player.teamLogoPath}
								difficulty={r.difficulty}
								injured={r.player.injuredStatus}
								expelled={r.player.expelledStatus}
								missing={r.player.missingStatus === 1}
								upcomingFixtures={r.upcomingFixtures}
							/>
						</div>
						<form
							method="POST"
							action={list === 'permanent' ? '?/addPermanent' : '?/addRound'}
							use:enhance
						>
							<input type="hidden" name="playerId" value={r.player.id} />
							<button class="rounded-lg bg-emerald-500/20 px-2 py-1 text-xs text-emerald-300" type="submit"
								>+</button
							>
						</form>
					</div>
				{/each}
			</div>
		</div>
	</div>

	<div class="space-y-4 border-t border-slate-800 pt-6">
		<div>
			<h2 class="text-xl font-bold">הצעות חילופים למחזור {data.currentGw}</h2>
			<p class="text-sm text-slate-400">
				עד 3 חילופים מהקבוצה השמורה, כשהנכנסים נלקחים <span class="text-slate-300">רק</span> מרשימת
				המחזור. שומר על הרכב חוקי, תקציב 120 ומקס׳ 2 מאותה קבוצה. מתעדכן אחרי כל שינוי.
			</p>
		</div>

		{#if form?.sketchSaved}
			<div class="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-200">
				סקיצה נשמרה למחזור {form.sketchGw} ✓ ·
				<a class="underline" href="/sketches?gw={form.sketchGw}">לסקיצות</a>
			</div>
		{/if}

		{#if transfers.hasSquad}
			<!-- Take-out picker -->
			<div class="rounded-xl border border-slate-700/70 bg-slate-900/50 p-3">
				<div class="mb-2 flex flex-wrap items-center justify-between gap-2">
					<h3 class="text-sm font-semibold text-slate-300">
						בחר עד 3 לשחרר מהקבוצה <span class="text-slate-500">({outSet.size}/{MAX_OUT})</span>
					</h3>
					{#if outSet.size}
						<form method="POST" action="?/clearMustOut" use:enhance>
							<button type="submit" class="text-xs text-slate-400 hover:text-white">נקה בחירה</button>
						</form>
					{/if}
				</div>
				<p class="mb-2 text-xs text-slate-500">
					נשמר למחזור. ההצעות יכריחו את מי שתבחר לצאת; בלי בחירה — יימצאו החילופים הכי משתלמים.
				</p>
				<div class="flex flex-wrap gap-1.5">
					{#each data.squadForPicker as p (p.id)}
						{@const on = outSet.has(p.id)}
						<form method="POST" action="?/toggleMustOut" use:enhance>
							<input type="hidden" name="playerId" value={p.id} />
							<button
								type="submit"
								disabled={!on && outSet.size >= MAX_OUT}
								class="rounded-lg border px-2 py-1 text-xs transition
									{on
									? 'border-red-500/60 bg-red-500/20 text-red-200'
									: 'border-slate-700 bg-slate-800/60 text-slate-300 hover:border-slate-500 disabled:opacity-40'}"
								title="{posLabel[p.position]} · {p.price}m · {p.points} נק׳"
							>
								{on ? '✕ ' : ''}{p.name}
								<span class="text-[10px] text-slate-500">{posLabel[p.position]}</span>
							</button>
						</form>
					{/each}
				</div>
			</div>

			<!-- Must-come-in picker (persisted per matchday; feeds the recorded what-if) -->
			<div class="rounded-xl border border-slate-700/70 bg-slate-900/50 p-3">
				<div class="mb-2 flex flex-wrap items-center justify-between gap-2">
					<h3 class="text-sm font-semibold text-slate-300">
						בחר עד 3 שחייבים להיכנס <span class="text-slate-500">({inSet.size}/{MAX_IN})</span>
					</h3>
					{#if inSet.size}
						<form method="POST" action="?/clearMustIn" use:enhance>
							<button type="submit" class="text-xs text-slate-400 hover:text-white">נקה בחירה</button>
						</form>
					{/if}
				</div>
				<p class="mb-2 text-xs text-slate-500">
					מרשימת המחזור. נשמר למחזור ומשפיע גם על מעקב האסטרטגיות — כל שיטה תכלול את מי שתסמן; היתר
					יימצא אוטומטית.
				</p>
				{#if data.inboundForPicker.length}
					<div class="flex flex-wrap gap-1.5">
						{#each data.inboundForPicker as p (p.id)}
							{@const on = inSet.has(p.id)}
							<form method="POST" action="?/toggleMustIn" use:enhance>
								<input type="hidden" name="playerId" value={p.id} />
								<button
									type="submit"
									disabled={!on && inSet.size >= MAX_IN}
									class="rounded-lg border px-2 py-1 text-xs transition
										{on
										? 'border-emerald-500/60 bg-emerald-500/20 text-emerald-200'
										: 'border-slate-700 bg-slate-800/60 text-slate-300 hover:border-slate-500 disabled:opacity-40'}"
									title="{posLabel[p.position]} · {p.price}m · {p.points} נק׳"
								>
									{on ? '✓ ' : ''}{p.name}
									<span class="text-[10px] text-slate-500">{posLabel[p.position]}</span>
								</button>
							</form>
						{/each}
					</div>
				{:else}
					<p class="text-xs text-slate-500">הוסף שחקנים לרשימת המחזור כדי לבחור מי חייב להיכנס.</p>
				{/if}
			</div>
		{/if}

		{#if !transfers.feasible}
			<div class="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
				<ul class="list-inside list-disc space-y-0.5">
					{#each transfers.notes as s}
						<li>{s}</li>
					{/each}
				</ul>
			</div>
		{:else}
			{#if transfers.capped}
				<p class="text-xs text-slate-500">הרשימה גדולה — מוצגות ההצעות הטובות ביותר מתוך חיפוש מוגבל.</p>
			{/if}

			<!-- Mode filter (persisted locally) -->
			<div class="flex flex-wrap items-center justify-between gap-2">
				<p class="text-xs text-slate-500">בחר אילו מצבי חילוף להציג.</p>
				<div class="relative">
					<button
						type="button"
						onclick={() => (modeMenuOpen = !modeMenuOpen)}
						class="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-200"
					>
						מצבים ({shownModes.length}) ▾
					</button>
					{#if modeMenuOpen}
						<div
							class="absolute left-0 z-20 mt-1 min-w-[10rem] rounded-lg border border-slate-700 bg-slate-900 p-1 shadow-lg"
						>
							{#each allModes as m (m.key)}
								<label
									class="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm text-slate-200 hover:bg-slate-800"
								>
									<input
										type="checkbox"
										checked={selectedModes.includes(m.key)}
										onchange={() => toggleMode(m.key)}
									/>
									{m.label}
								</label>
							{/each}
						</div>
					{/if}
				</div>
			</div>

			{#snippet card(title: string, o: Obj, v: Variant)}
				{#if v.combo}
					<LineupCard
						{title}
						subtitle={objSubtitle[o.key]?.(v.combo) ?? null}
						formation={v.combo.formation}
						transfersUsed={v.combo.transfersUsed}
						stats={comboStats(v.combo)}
						xi={v.combo.xi}
						bench={v.combo.bench}
						out={v.combo.out}
						inn={v.combo.in}
						actions
						sketchName={`${o.title} · ${v.modeLabel} · מחזור ${data.currentGw}`}
						gameweekNumber={data.currentGw}
					/>
				{:else}
					<div
						class="flex items-center justify-center rounded-2xl border border-slate-700/60 bg-slate-900/40 p-4 text-center text-xs text-slate-500"
					>
						{v.modeLabel}: אין הרכב חוקי במצב הזה
					</div>
				{/if}
			{/snippet}

			{#if singleMode}
				<div class="grid gap-5 lg:grid-cols-3">
					{#each transfers.byObjective as o (o.key)}
						{@const v = o.variants.find((x) => x.mode === shownModes[0].key)}
						{#if v}{@render card(o.title, o, v)}{/if}
					{/each}
				</div>
			{:else}
				{#each transfers.byObjective as o (o.key)}
					<div class="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/40">
						<button
							type="button"
							onclick={() => toggleCollapse(o.key)}
							class="flex w-full items-center justify-between gap-2 px-4 py-3 text-right text-xl font-bold text-slate-100 hover:bg-slate-800/50"
						>
							<span>{o.title}</span>
							<span class="text-slate-500">{isOpen(o.key) ? '▾' : '▸'}</span>
						</button>
						{#if isOpen(o.key)}
							<div class="grid gap-5 p-3 lg:grid-cols-3">
								{#each o.variants.filter((v) => selectedModes.includes(v.mode)) as v (v.mode)}
									{@render card(v.modeLabel, o, v)}
								{/each}
							</div>
						{/if}
					</div>
				{/each}
			{/if}
		{/if}
	</div>
</section>
