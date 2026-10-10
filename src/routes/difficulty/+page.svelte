<script lang="ts">
	import { enhance } from '$app/forms';
	import { DIFFICULTY_LABEL, DIFFICULTY_LEVELS } from '$lib/difficulty';
	import type { FixtureDifficulty } from '$lib/server/db/schema';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	// Matchday navigation (prev/next across rated matchdays), as on /strategies.
	const gwList = $derived(data.gameweeksAvailable ?? []);
	const gwIdx = $derived(gwList.indexOf(data.selectedGw));
	const prevGw = $derived(gwIdx > 0 ? gwList[gwIdx - 1] : null);
	const nextGw = $derived(gwIdx >= 0 && gwIdx < gwList.length - 1 ? gwList[gwIdx + 1] : null);

	type Field = 'overall' | 'vsDef' | 'vsAtt';
	const COLUMNS: { field: Field; label: string; hint: string }[] = [
		{ field: 'overall', label: 'כללי', hint: 'ברמת קבוצה, בלי עמדה' },
		{ field: 'vsDef', label: 'לשוער ולהגנה שלי', hint: 'לפי כוח ההתקפה שלה' },
		{ field: 'vsAtt', label: 'לקישור ולהתקפה שלי', hint: 'לפי כוח ההגנה שלה' }
	];

	const DOT: Record<FixtureDifficulty, string> = {
		green: 'bg-emerald-500',
		yellow: 'bg-yellow-400',
		red: 'bg-red-500'
	};
	const DOT_RING: Record<FixtureDifficulty, string> = {
		green: 'ring-emerald-300',
		yellow: 'ring-yellow-200',
		red: 'ring-red-300'
	};
</script>

<svelte:head>
	<title>קושי יריבים · WOBI</title>
</svelte:head>

<section class="space-y-4">
	<div class="flex flex-wrap items-start justify-between gap-3">
		<div>
			<h1 class="text-2xl font-bold text-slate-100">
				קושי יריבים · מחזור {data.selectedGw}
				{#if data.editable}
					<span class="text-sm font-normal text-sky-300">· מחזור פתוח — ניתן לעריכה</span>
				{:else}
					<span class="text-sm font-normal text-slate-500">· לקריאה בלבד</span>
				{/if}
			</h1>
			<p class="text-sm text-slate-400">
				{#if data.editable}
					לחיצה על עיגול שומרת מיד. הדירוג נשמר למחזור הזה ועובר אוטומטית למחזור הבא.
				{:else}
					הדירוגים שהיו בתוקף בזמן תכנון המחזור הזה.
					<a href="?gw={data.currentGw}" class="underline">למחזור הפתוח ({data.currentGw})</a>
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

	<div class="rounded-lg border border-slate-700/60 bg-slate-800/40 px-3 py-2 text-xs leading-relaxed text-slate-300">
		<span class="font-semibold text-slate-200">מה זה אומר:</span>
		כל שורה היא <b>קבוצה יריבה</b>. הצבע שתבחר הוא הצבע שיקבל <b>שחקן שלך במשחק נגדה</b> — ירוק = משחק
		קל בשבילו, אדום = קשה.
		<span class="block pt-1">
			<b class="text-slate-200">לשוער ולהגנה שלי</b> — הצבע של השוערים והמגינים שלך כשהם פוגשים את
			הקבוצה הזו. תלוי בכמה ההתקפה שלה מסוכנת (סיכוי לשער נקי).
		</span>
		<span class="block">
			<b class="text-slate-200">לקישור ולהתקפה שלי</b> — הצבע של הקשרים והחלוצים שלך כשהם פוגשים את
			הקבוצה הזו. תלוי בכמה ההגנה שלה חזקה (סיכוי לכבוש ולבשל).
		</span>
		<span class="block">
			<b class="text-slate-200">כללי</b> — כשאין שחקן מסוים, למשל ברשימת «משחקי מחזור» ב־/squad.
		</span>
		<span class="block pt-1">
			לדוגמה: התקפה חזקה והגנה חלשה → <span class="text-red-300">אדום</span> לשוער ולהגנה שלי,
			<span class="text-emerald-300">ירוק</span> לקישור ולהתקפה שלי.
		</span>
		<span class="block pt-1 text-slate-500">
			כל המשחקים הקרובים נצבעים לפי הדירוג של המחזור המתוכנן (לא של מחזור המשחק עצמו).
		</span>
	</div>

	{#if form && 'message' in form && form.message}
		<p class="rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-300">{form.message}</p>
	{/if}

	<div class="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/40">
		<table class="w-full text-sm">
			<thead>
				<tr class="border-b border-slate-800 text-xs text-slate-400">
					<th class="px-2 py-2 text-right font-medium sm:px-3">קבוצה</th>
					{#each COLUMNS as c (c.field)}
						<th class="px-1 py-2 text-center font-medium sm:px-3">
							<div class="text-slate-200">{c.label}</div>
							<div class="text-[10px] text-slate-500">{c.hint}</div>
						</th>
					{/each}
				</tr>
			</thead>
			<tbody>
				{#each data.rows as row (row.id)}
					<tr class="border-b border-slate-800/70 last:border-0">
						<td class="px-2 py-2 sm:px-3">
							<div class="flex items-center gap-2">
								<div class="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white">
									{#if row.logoPath}
										<img src={row.logoPath} alt="" class="h-6 w-6 object-contain" />
									{:else}
										<span class="text-[8px] text-slate-500">⚽</span>
									{/if}
								</div>
								<span class="text-xs text-slate-100 sm:text-sm">{row.name}</span>
							</div>
						</td>
						{#each COLUMNS as c (c.field)}
							{@const current = row[c.field]}
							<td class="px-1 py-2 text-center sm:px-3">
								{#if data.editable}
									<form method="POST" action="?/set" use:enhance class="inline-flex gap-1 sm:gap-1.5">
										<input type="hidden" name="teamId" value={row.id} />
										<input type="hidden" name="field" value={c.field} />
										{#each DIFFICULTY_LEVELS as level (level)}
											{@const on = current === level}
											<button
												type="submit"
												name="value"
												value={level}
												title="{c.label}: {DIFFICULTY_LABEL[level]}"
												aria-pressed={on}
												class="h-5 w-5 rounded-full transition sm:h-6 sm:w-6 {DOT[level]} {on
													? `ring-2 ring-offset-2 ring-offset-slate-900 ${DOT_RING[level]}`
													: 'opacity-25 hover:opacity-70'}"
											></button>
										{/each}
									</form>
								{:else}
									<span class="inline-flex items-center gap-1.5 text-xs text-slate-300">
										<span class="inline-block h-4 w-4 rounded-full {DOT[current]}"></span>
										{DIFFICULTY_LABEL[current]}
									</span>
								{/if}
							</td>
						{/each}
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</section>
