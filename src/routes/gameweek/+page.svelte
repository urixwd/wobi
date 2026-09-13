<script lang="ts">
	import PlayerRow from '$lib/components/PlayerRow.svelte';
	import CompactPlayerCard from '$lib/components/CompactPlayerCard.svelte';
	import { enhance } from '$app/forms';
	import { positionLabel } from '$lib/positions';
	import { DIFFICULTY_BG, DIFFICULTY_LABEL, DIFFICULTY_RING } from '$lib/difficulty';
	import { seasonPoints } from '$lib/stats';
	import type { PageData } from './$types';

	let { data, form }: { data: PageData; form: any } = $props();

	type FocusRow = NonNullable<NonNullable<PageData['finalSquad']>['xi'][number]>;

	function formatKickoff(raw: string | Date | null | undefined): {
		day: string;
		date: string;
		time: string;
		dayKey: string;
	} {
		if (!raw) return { day: 'ללא תאריך', date: '—', time: '—', dayKey: 'none' };
		const d = new Date(raw);
		if (Number.isNaN(d.getTime())) return { day: 'ללא תאריך', date: '—', time: '—', dayKey: 'none' };
		return {
			day: d.toLocaleDateString('he-IL', { weekday: 'long' }),
			date: d.toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric', year: 'numeric' }),
			time: d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }),
			dayKey: `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
		};
	}

	const fixturesSorted = $derived(
		[...(data.fixtures ?? [])].sort((a, b) => {
			const ta = a.fixture.kickoff ? new Date(a.fixture.kickoff).getTime() : Number.POSITIVE_INFINITY;
			const tb = b.fixture.kickoff ? new Date(b.fixture.kickoff).getTime() : Number.POSITIVE_INFINITY;
			return ta - tb || a.fixture.id - b.fixture.id;
		})
	);

	const fixturesByDay = $derived.by(() => {
		const groups: {
			dayKey: string;
			day: string;
			date: string;
			rows: typeof fixturesSorted;
		}[] = [];
		const index = new Map<string, number>();
		for (const row of fixturesSorted) {
			const when = formatKickoff(row.fixture.kickoff);
			let i = index.get(when.dayKey);
			if (i == null) {
				i = groups.length;
				index.set(when.dayKey, i);
				groups.push({ dayKey: when.dayKey, day: when.day, date: when.date, rows: [] });
			}
			groups[i].rows.push(row);
		}
		return groups;
	});

	function byPos(rows: FocusRow[], pos: number) {
		return rows.filter((r) => r.player.position === pos);
	}

	function formationLabel(xi: FocusRow[]): string {
		const c = { 2: 0, 3: 0, 4: 0 };
		for (const r of xi) {
			if (r.player.position === 2 || r.player.position === 3 || r.player.position === 4) {
				c[r.player.position as 2 | 3 | 4]++;
			}
		}
		return `${c[2]}-${c[3]}-${c[4]}`;
	}

	const finalSpend = $derived.by(() => {
		if (!data.finalSquad) return 0;
		return [...data.finalSquad.xi, ...data.finalSquad.bench].reduce(
			(s, r) => s + (r.player.price ?? 0),
			0
		);
	});

	const finalPoints = $derived.by(() => {
		if (!data.finalSquad) return 0;
		return data.finalSquad.xi.reduce((s, r) => s + (seasonPoints(r.player) ?? 0), 0);
	});
</script>

<section class="space-y-6">
	<div class="flex flex-wrap items-center justify-between gap-3">
		<div>
			<h1 class="text-2xl font-bold">מחזור {data.selectedGw}</h1>
			<p class="text-sm text-slate-400">
				רמזור יריבות, מחיר, נקודות וזמינות — להרכב + מעקב. ניווט מחזורים 1–26 · שמירת הרכב סופי
				למחזור.
			</p>
		</div>
		<nav class="flex flex-wrap items-center gap-2 text-sm" aria-label="ניווט מחזורים">
			{#if data.prevGw != null}
				<a
					href="?gw={data.prevGw}"
					class="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-slate-200 hover:border-emerald-500/50"
					>← מחזור הקודם</a
				>
			{:else}
				<span class="rounded-lg border border-slate-800 px-3 py-1.5 text-slate-600">← מחזור הקודם</span>
			{/if}
			<span class="rounded-lg bg-emerald-500/15 px-3 py-1.5 font-semibold text-emerald-300"
				>מחזור {data.selectedGw}</span
			>
			{#if data.nextGw != null}
				<a
					href="?gw={data.nextGw}"
					class="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-slate-200 hover:border-emerald-500/50"
					>מחזור הבא →</a
				>
			{:else}
				<span class="rounded-lg border border-slate-800 px-3 py-1.5 text-slate-600">מחזור הבא →</span>
			{/if}
		</nav>
	</div>

	{#if form?.success}
		<p class="rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-3 py-2 text-sm text-emerald-200">
			נשמר הרכב סופי למחזור {form.savedGw} ✓
		</p>
	{/if}
	{#if form?.message}
		<p class="rounded-xl border border-red-500/40 bg-red-500/15 px-3 py-2 text-sm text-red-200">
			{form.message}
		</p>
	{/if}

	<section class="space-y-3 rounded-2xl border border-sky-500/30 bg-slate-900/60 p-4">
		<div class="flex flex-wrap items-start justify-between gap-3">
			<div>
				<h2 class="font-semibold text-sky-300">הרכב סופי · מחזור {data.selectedGw}</h2>
				<p class="text-xs text-slate-400">
					שומר את הקבוצה הנוכחית מ־<a class="text-emerald-300 underline" href="/squad">הקבוצה שלי</a>
					כצילום סופי למחזור הזה.
				</p>
			</div>
			<form method="POST" action="?/saveFinal" use:enhance>
				<input type="hidden" name="gameweekNumber" value={data.selectedGw} />
				<button
					type="submit"
					class="rounded-xl bg-sky-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-sky-400"
				>
					{data.finalSquad ? 'עדכן הרכב סופי מהקבוצה שלי' : 'שמור כהרכב סופי למחזור זה'}
				</button>
			</form>
		</div>

		{#if data.finalSquad}
			<p class="text-xs text-slate-500">
				עודכן {new Date(data.finalSquad.updatedAt).toLocaleString('he-IL')}
			</p>

			<div class="flex flex-wrap gap-1.5">
				<span class="rounded-full bg-slate-800 px-2.5 py-1 text-xs font-medium text-slate-200"
					>{formationLabel(data.finalSquad.xi)}</span
				>
				<span class="rounded-full bg-slate-800/80 px-2.5 py-1 text-xs text-slate-300"
					>{finalSpend} / 120</span
				>
				<span class="rounded-full bg-sky-500/15 px-2.5 py-1 text-xs text-sky-300"
					>{finalPoints} נק׳ הרכב</span
				>
			</div>

			<div class="space-y-2 rounded-xl bg-gradient-to-b from-emerald-950/40 to-slate-950/60 p-3">
				{#each [1, 2, 3, 4] as pos}
					<div class="flex flex-wrap justify-center gap-2">
						{#each byPos(data.finalSquad.xi, pos) as r}
							<CompactPlayerCard
								name={r.player.name}
								price={r.player.price}
								points={seasonPoints(r.player) ?? 0}
								logo={r.teamLogo ?? r.player.teamLogoPath}
								teamName={r.teamName}
								upcomingFixtures={r.upcomingFixtures ?? []}
							/>
						{/each}
					</div>
				{/each}
			</div>

			<div>
				<div class="mb-1 text-xs text-slate-500">ספסל</div>
				<div class="flex flex-wrap gap-2">
					{#each data.finalSquad.bench as r}
						<CompactPlayerCard
							variant="bench"
							name={r.player.name}
							price={r.player.price}
							points={seasonPoints(r.player) ?? 0}
							logo={r.teamLogo ?? r.player.teamLogoPath}
							teamName={r.teamName}
							positionLabel={positionLabel(r.player.position)}
						/>
					{/each}
				</div>
			</div>
		{:else}
			<p class="text-sm text-slate-500">עדיין אין הרכב סופי שמור למחזור {data.selectedGw}.</p>
		{/if}
	</section>

	<section class="space-y-3 rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
		<h2 class="font-semibold text-emerald-300">משחקי מחזור {data.selectedGw}</h2>
		{#if fixturesByDay.length === 0}
			<p class="text-sm text-slate-500">אין משחקים במסד למחזור {data.selectedGw}.</p>
		{:else}
			<div class="space-y-4">
				{#each fixturesByDay as group (group.dayKey)}
					<div class="space-y-2">
						<h3 class="flex flex-wrap items-baseline gap-2 border-b border-slate-800 pb-1 text-sm">
							<span class="font-semibold text-white">{group.day}</span>
							<span class="text-slate-400">{group.date}</span>
							<span class="text-[11px] text-slate-500">{group.rows.length} משחקים</span>
						</h3>
						<ul class="space-y-2">
							{#each group.rows as row (row.fixture.id)}
								{@const when = formatKickoff(row.fixture.kickoff)}
								<li class="rounded-xl border border-slate-800/80 bg-slate-950/50 px-3 py-2.5">
									<div
										class="grid grid-cols-[4.25rem_minmax(0,1fr)_2rem_3rem_2rem_minmax(0,1fr)] items-center gap-x-2"
									>
										<span class="tabular-nums text-sm font-semibold text-emerald-300">{when.time}</span>
										<span class="truncate text-left text-sm font-medium text-white" title={row.home.name}
											>{row.home.name}</span
										>
										<span
											class="mx-auto flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-white ring-2 {DIFFICULTY_RING[row.away.difficulty]}"
										>
											{#if row.home.logoPath}
												<img src={row.home.logoPath} alt="" class="h-6 w-6 object-contain" />
											{/if}
										</span>
										<span class="text-center text-sm font-bold tabular-nums text-white">
											{#if row.fixture.homeScore != null && row.fixture.awayScore != null}
												{row.fixture.homeScore}:{row.fixture.awayScore}
											{/if}
										</span>
										<span
											class="mx-auto flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-white ring-2 {DIFFICULTY_RING[row.home.difficulty]}"
										>
											{#if row.away.logoPath}
												<img src={row.away.logoPath} alt="" class="h-6 w-6 object-contain" />
											{/if}
										</span>
										<span class="truncate text-right text-sm font-medium text-white" title={row.away.name}
											>{row.away.name}</span
										>
									</div>
								</li>
							{/each}
						</ul>
					</div>
				{/each}
			</div>
		{/if}
		<div class="flex flex-wrap gap-2 text-xs">
			<span class="rounded px-2 py-1 {DIFFICULTY_BG.red}">אדום = {DIFFICULTY_LABEL.red}</span>
			<span class="rounded px-2 py-1 {DIFFICULTY_BG.yellow}">צהוב = {DIFFICULTY_LABEL.yellow}</span>
			<span class="rounded px-2 py-1 {DIFFICULTY_BG.green}">ירוק = {DIFFICULTY_LABEL.green}</span>
		</div>
	</section>

	<div class="space-y-2">
		<h2 class="font-semibold text-sky-300">הקבוצה + מעקב · קושי יריבה למחזור {data.selectedGw}</h2>
		{#each data.focusPlayers as r}
			<PlayerRow
				name={r.player.name}
				teamName={r.teamName}
				position={r.player.position}
				price={r.player.price}
				playerStats={r.player}
				logoPath={r.teamLogo ?? r.player.teamLogoPath}
				difficulty={r.opponentDifficulty ?? r.teamDifficulty}
				injured={r.player.injuredStatus}
				expelled={r.player.expelledStatus}
				missing={r.player.missingStatus === 1}
				upcomingFixtures={r.upcomingFixtures}
			/>
		{:else}
			<p class="text-sm text-slate-500">אין שחקנים בהרכב/מעקב עדיין.</p>
		{/each}
	</div>
</section>
