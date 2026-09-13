<script lang="ts">
	import PlayerRow from '$lib/components/PlayerRow.svelte';
	import { DIFFICULTY_BG, DIFFICULTY_LABEL, DIFFICULTY_RING } from '$lib/difficulty';
	import { lastRoundPoints, seasonPoints } from '$lib/stats';

	let { data } = $props();
</script>

<section class="space-y-6">
	<div class="flex flex-wrap items-center justify-between gap-3">
		<div>
			<h1 class="text-2xl font-bold">מחזור {data.selectedGw}</h1>
			<p class="text-sm text-slate-400">
				רמזור יריבות, מחיר, נקודות וזמינות — להרכב + מעקב. ניווט מחזורים 4–26.
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

	<div class="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
		<h2 class="mb-3 font-semibold text-emerald-300">משחקי מחזור {data.selectedGw}</h2>
		{#if data.hasFixtures}
			<ul class="space-y-3">
				{#each data.fixtures as row}
					<li class="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-950/60 px-3 py-2">
						<div class="flex items-center gap-2">
							<div class="h-9 w-9 overflow-hidden rounded-full ring-2 {DIFFICULTY_RING[row.away.difficulty]}">
								{#if row.home.logoPath}
									<img src={row.home.logoPath} alt={row.home.name} class="h-full w-full object-contain" />
								{/if}
							</div>
							<span class="text-sm">{row.home.name}</span>
						</div>
						<span class="text-xs text-slate-500">נגד</span>
						<div class="flex items-center gap-2">
							<span class="text-sm">{row.away.name}</span>
							<div class="h-9 w-9 overflow-hidden rounded-full ring-2 {DIFFICULTY_RING[row.home.difficulty]}">
								{#if row.away.logoPath}
									<img src={row.away.logoPath} alt={row.away.name} class="h-full w-full object-contain" />
								{/if}
							</div>
						</div>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="text-sm text-slate-500">
				אין משחקים למחזור {data.selectedGw} במסד עדיין. הריצו
				<code class="text-emerald-300">bun run db:import-fixtures</code>
				(או מלאו את fixtures.json).
				<br />
				<span class="text-xs">TODO: scrape מ־dreamteam.sport5.co.il</span>
			</p>
		{/if}
		<div class="mt-4 flex flex-wrap gap-2 text-xs">
			<span class="rounded px-2 py-1 {DIFFICULTY_BG.red}">אדום = {DIFFICULTY_LABEL.red}</span>
			<span class="rounded px-2 py-1 {DIFFICULTY_BG.yellow}">צהוב = {DIFFICULTY_LABEL.yellow}</span>
			<span class="rounded px-2 py-1 {DIFFICULTY_BG.green}">ירוק = {DIFFICULTY_LABEL.green}</span>
		</div>
	</div>

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
			<p class="text-sm text-slate-500">שמרו קבוצה או הוסיפו למעקב כדי לראות כאן שחקנים.</p>
		{/each}
	</div>
</section>
