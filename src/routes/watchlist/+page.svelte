<script lang="ts">
	import PlayerRow from '$lib/components/PlayerRow.svelte';
	import LineupCard from '$lib/components/LineupCard.svelte';
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
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
	const outSet = $derived(new Set(data.forcedOut));
	const inSet = $derived(new Set(data.forcedIn));
	const MAX_OUT = 3;
	const MAX_IN = 3;
	const posLabel: Record<number, string> = { 1: 'שוער', 2: 'הגנה', 3: 'קישור', 4: 'התקפה' };

	function navTo(outIds: Set<number>, inIds: Set<number>) {
		const params = new URLSearchParams();
		if (outIds.size) params.set('out', [...outIds].join(','));
		if (inIds.size) params.set('in', [...inIds].join(','));
		const qs = params.toString();
		goto(`/watchlist${qs ? `?${qs}` : ''}`, { invalidateAll: true, noScroll: true, keepFocus: true });
	}

	function toggleOut(id: number) {
		const cur = new Set(data.forcedOut);
		if (cur.has(id)) cur.delete(id);
		else {
			if (cur.size >= MAX_OUT) return;
			cur.add(id);
		}
		navTo(cur, new Set(data.forcedIn));
	}

	function toggleIn(id: number) {
		const cur = new Set(data.forcedIn);
		if (cur.has(id)) cur.delete(id);
		else {
			if (cur.size >= MAX_IN) return;
			cur.add(id);
		}
		navTo(new Set(data.forcedOut), cur);
	}

	function clearOut() {
		navTo(new Set(), new Set(data.forcedIn));
	}

	function clearIn() {
		navTo(new Set(data.forcedOut), new Set());
	}

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
		fixtures: (c) => `ממוצע קושי לוח ${c.matchdayEase.toFixed(2)} · ${c.formation}`,
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
						<button type="button" class="text-xs text-slate-400 hover:text-white" onclick={clearOut}
							>נקה בחירה</button
						>
					{/if}
				</div>
				<p class="mb-2 text-xs text-slate-500">
					ההצעות יכריחו את מי שתבחר לצאת. בלי בחירה — ההצעות ימצאו את החילופים הכי משתלמים.
				</p>
				<div class="flex flex-wrap gap-1.5">
					{#each data.squadForPicker as p (p.id)}
						{@const on = outSet.has(p.id)}
						<button
							type="button"
							onclick={() => toggleOut(p.id)}
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
					{/each}
				</div>
			</div>

			<!-- Must-come-in picker -->
			<div class="rounded-xl border border-slate-700/70 bg-slate-900/50 p-3">
				<div class="mb-2 flex flex-wrap items-center justify-between gap-2">
					<h3 class="text-sm font-semibold text-slate-300">
						בחר עד 3 שחייבים להיכנס <span class="text-slate-500">({inSet.size}/{MAX_IN})</span>
					</h3>
					{#if inSet.size}
						<button type="button" class="text-xs text-slate-400 hover:text-white" onclick={clearIn}
							>נקה בחירה</button
						>
					{/if}
				</div>
				<p class="mb-2 text-xs text-slate-500">
					מרשימת המחזור. כל הצעה תכלול את מי שתסמן; היתר יימצא אוטומטית.
				</p>
				{#if data.inboundForPicker.length}
					<div class="flex flex-wrap gap-1.5">
						{#each data.inboundForPicker as p (p.id)}
							{@const on = inSet.has(p.id)}
							<button
								type="button"
								onclick={() => toggleIn(p.id)}
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

			<div>
				<h3 class="mb-2 text-sm font-semibold text-slate-300">ההצעה הטובה ביותר לכל דירוג</h3>
				<div class="grid gap-5 lg:grid-cols-2">
					{#each transfers.best as b (b.key)}
						{#if b.combo}
							<LineupCard
								title={b.title}
								subtitle={objSubtitle[b.key]?.(b.combo) ?? null}
								formation={b.combo.formation}
								transfersUsed={b.combo.transfersUsed}
								stats={comboStats(b.combo)}
								xi={b.combo.xi}
								bench={b.combo.bench}
								out={b.combo.out}
								inn={b.combo.in}
								actions
								sketchName={`${b.title} · מחזור ${data.currentGw}`}
								gameweekNumber={data.currentGw}
							/>
						{/if}
					{/each}
				</div>
			</div>

			{#if transfers.topPoints.length}
				<div>
					<h3 class="mb-2 text-sm font-semibold text-slate-300">חמש ההצעות המובילות לפי נקודות</h3>
					<div class="grid gap-5 lg:grid-cols-2">
						{#each transfers.topPoints as c, i (c.id)}
							<LineupCard
								title={`דירוג נקודות #${i + 1}`}
								subtitle={`${c.points} נק׳ · vlfm ${c.vlfm.toFixed(2)}`}
								badge={`#${i + 1}`}
								formation={c.formation}
								transfersUsed={c.transfersUsed}
								stats={comboStats(c)}
								xi={c.xi}
								bench={c.bench}
								out={c.out}
								inn={c.in}
								actions
								sketchName={`דירוג נקודות #${i + 1} · מחזור ${data.currentGw}`}
								gameweekNumber={data.currentGw}
							/>
						{/each}
					</div>
				</div>
			{/if}
		{/if}
	</div>
</section>
