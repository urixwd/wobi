<script lang="ts">
	import FixtureStrip from '$lib/components/FixtureStrip.svelte';
	import PriceRangeSlider from '$lib/components/PriceRangeSlider.svelte';
	import PlayerStatsPanel from '$lib/components/PlayerStatsPanel.svelte';
	import { positionLabel } from '$lib/positions';
	import { formatPrice } from '$lib/format';
	import { formatPointsLabel, lastRoundPoints, playerStatLines, seasonPoints } from '$lib/stats';
	import {
		DIFFICULTY_BG,
		DIFFICULTY_LABEL,
		DIFFICULTY_RING,
		fixtureRunAverage,
		fixtureRunBucket,
		formatFixtureRun
	} from '$lib/difficulty';
	import type { FixtureDifficulty } from '$lib/server/db/schema';
	import { enhance } from '$app/forms';
	import { BUDGET_TOTAL, canAddToBench, canAddToXi, canFitInSquad } from '$lib/squadRules';
	import { writeSquadDraft } from '$lib/squadDraft';
	import { buildPointsDeciles, formatVlfm, vlfm } from '$lib/playerMetrics';

	let { data, form } = $props();

	/** Working (possibly staged) XI/bench — not written until שמור קבוצה */
	let xi = $state<number[]>([...(data.staged?.xi ?? data.squad.xiPlayerIds)]);
	let bench = $state<number[]>([...(data.staged?.bench ?? data.squad.benchPlayerIds)]);
	let freeTransfers = $state(data.squad.freeTransfers);
	let viewGw = $state(data.currentGw);

	$effect(() => {
		writeSquadDraft(xi, bench);
	});

	function formatKickoff(raw: string | Date | null | undefined): {
		day: string;
		date: string;
		time: string;
		dayKey: string;
	} {
		if (!raw) return { day: 'ללא תאריך', date: '—', time: '—', dayKey: 'none' };
		const d = new Date(raw);
		if (Number.isNaN(d.getTime())) return { day: 'ללא תאריך', date: '—', time: '—', dayKey: 'none' };
		const day = d.toLocaleDateString('he-IL', { weekday: 'long' });
		const date = d.toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric', year: 'numeric' });
		const time = d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
		const dayKey = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
		return { day, date, time, dayKey };
	}

	const fixturesForView = $derived(
		(data.gwFixtures ?? [])
			.filter((f) => f.gwNumber === viewGw)
			.slice()
			.sort((a, b) => {
				const ta = a.kickoff ? new Date(a.kickoff).getTime() : Number.POSITIVE_INFINITY;
				const tb = b.kickoff ? new Date(b.kickoff).getTime() : Number.POSITIVE_INFINITY;
				return ta - tb || a.id - b.id;
			})
	);

	const fixturesByDay = $derived.by(() => {
		const groups: {
			dayKey: string;
			day: string;
			date: string;
			rows: typeof fixturesForView;
		}[] = [];
		const index = new Map<string, number>();
		for (const row of fixturesForView) {
			const when = formatKickoff(row.kickoff);
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
	/** Last saved in DB — transfer diff baseline */
	let savedXi = $state<number[]>([...data.squad.xiPlayerIds]);
	let savedBench = $state<number[]>([...data.squad.benchPlayerIds]);
	let q = $state('');
	/** Treat geresh/apostrophe variants (`, ׳, ', ’, ‘) as the same so "ג׳יימס" finds "ג`יימס". */
	function normalizeSearch(s: string): string {
		return s.replace(/[`'׳’‘"״“”]/g, '').trim();
	}
	const normQuery = $derived(normalizeSearch(q));
	let posFilter = $state<number | 0>(0);
	let teamFilters = $state<number[]>([]);
	let target: 'xi' | 'bench' = $state('xi');
	let sortCol = $state<'name' | 'team' | 'position' | 'price' | 'points' | 'vlfm' | 'decile' | 'nextDiff' | 'runDiff'>('points');
	let sortDir = $state<'asc' | 'desc'>('desc');
	let priceMin = $state(3);
	let priceMax = $state(15);
	let oppDiffFilters = $state<FixtureDifficulty[]>([]);
	let runDiffFilters = $state<FixtureDifficulty[]>([]);

	const byId = $derived(new Map(data.allPlayers.map((r) => [r.player.id, r])));

	const transferSummary = $derived.by(() => {
		const saved = new Set([...savedXi, ...savedBench]);
		const current = new Set([...xi, ...bench]);
		const outIds = [...saved].filter((id) => !current.has(id));
		const inIds = [...current].filter((id) => !saved.has(id));
		return {
			out: outIds.map((id) => byId.get(id)).filter(Boolean) as typeof data.allPlayers,
			in: inIds.map((id) => byId.get(id)).filter(Boolean) as typeof data.allPlayers
		};
	});

	const spentBudget = $derived(
		[...xi, ...bench].reduce((sum, id) => sum + (byId.get(id)?.player.price ?? 0), 0)
	);
	const remainingBudget = $derived(BUDGET_TOTAL - spentBudget);

	const teamOptions = $derived(
		[...new Map(
			data.allPlayers
				.filter((r) => r.teamName)
				.map((r) => [
					r.player.teamId,
					{
						id: r.player.teamId,
						name: r.teamName as string,
						logo: (r.teamLogo ?? r.player.teamLogoPath) as string | null,
						difficulty: (r.difficulty ?? 'green') as FixtureDifficulty
					}
				])
		).values()].sort((a, b) => a.name.localeCompare(b.name, 'he'))
	);

	const TEAM_DIFF_GROUPS: { key: FixtureDifficulty; title: string }[] = [
		{ key: 'red', title: 'קשה' },
		{ key: 'yellow', title: 'בינוני' },
		{ key: 'green', title: 'קל' }
	];


	function toggleTeam(id: number) {
		teamFilters = teamFilters.includes(id)
			? teamFilters.filter((x) => x !== id)
			: [...teamFilters, id];
	}

	const poolPlayers = $derived(
		data.allPlayers.filter((r) => {
			if (r.player.missingStatus === 2) return false;
			const pts = seasonPoints(r.player) ?? 0;
			// Hide 0-point players from the table/deciles, unless already in the squad.
			if (pts <= 0 && !xi.includes(r.player.id) && !bench.includes(r.player.id)) return false;
			return true;
		})
	);

	const DIFF_ORDER: FixtureDifficulty[] = ['green', 'yellow', 'red'];

	/** One row per team with next-opp + 5-game run difficulty (from any player on that team). */
	const teamsWithFixtures = $derived.by(() => {
		const map = new Map<
			number,
			(typeof teamOptions)[number] & {
				nextOpp: FixtureDifficulty | null;
				run: FixtureDifficulty | null;
				runAvg: number | null;
			}
		>();
		for (const r of poolPlayers) {
			const id = r.player.teamId;
			if (map.has(id)) continue;
			const base = teamOptions.find((t) => t.id === id);
			if (!base) continue;
			const avg = fixtureRunAverage(r.upcomingFixtures, 5);
			map.set(id, {
				...base,
				nextOpp: r.upcomingFixtures?.[0]?.difficulty ?? null,
				run: fixtureRunBucket(avg),
				runAvg: avg
			});
		}
		return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'he'));
	});

	function teamsForNextOpp(d: FixtureDifficulty) {
		return teamsWithFixtures.filter((t) => t.nextOpp === d);
	}

	function teamsForRun(d: FixtureDifficulty) {
		return teamsWithFixtures.filter((t) => t.run === d);
	}

	function toggleTeamsInList(ids: number[]) {
		const allOn = ids.length > 0 && ids.every((id) => teamFilters.includes(id));
		if (allOn) {
			teamFilters = teamFilters.filter((id) => !ids.includes(id));
		} else {
			const set = new Set(teamFilters);
			for (const id of ids) set.add(id);
			teamFilters = [...set];
		}
	}

	const pointsDeciles = $derived(buildPointsDeciles(poolPlayers.map((r) => r.player)));

	const DIFF_RANK: Record<FixtureDifficulty, number> = { green: 1, yellow: 2, red: 3 };

	function nextOppDiff(r: (typeof data.allPlayers)[number]): FixtureDifficulty | null {
		return r.upcomingFixtures?.[0]?.difficulty ?? null;
	}

	function runAvg(r: (typeof data.allPlayers)[number]): number | null {
		return fixtureRunAverage(r.upcomingFixtures, 5);
	}

	function runDiff(r: (typeof data.allPlayers)[number]): FixtureDifficulty | null {
		return fixtureRunBucket(runAvg(r));
	}

	function toggleOppDiff(d: FixtureDifficulty) {
		oppDiffFilters = oppDiffFilters.includes(d)
			? oppDiffFilters.filter((x) => x !== d)
			: [...oppDiffFilters, d];
	}

	function toggleRunDiff(d: FixtureDifficulty) {
		runDiffFilters = runDiffFilters.includes(d)
			? runDiffFilters.filter((x) => x !== d)
			: [...runDiffFilters, d];
	}

	function toggleSort(col: typeof sortCol) {
		if (sortCol === col) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
		else {
			sortCol = col;
			sortDir = col === 'name' || col === 'team' || col === 'position' ? 'asc' : 'desc';
		}
	}

	function sortMark(col: typeof sortCol) {
		if (sortCol !== col) return '';
		return sortDir === 'asc' ? ' ↑' : ' ↓';
	}

	const filtered = $derived(
		poolPlayers
			.filter((r) => {
				if (posFilter && r.player.position !== posFilter) return false;
				if (teamFilters.length && !teamFilters.includes(r.player.teamId)) return false;
				const price = r.player.price;
				if (price < priceMin || price > priceMax) return false;
				if (oppDiffFilters.length) {
					const d = nextOppDiff(r);
					if (!d || !oppDiffFilters.includes(d)) return false;
				}
				if (runDiffFilters.length) {
					const d = runDiff(r);
					if (!d || !runDiffFilters.includes(d)) return false;
				}
				if (!normQuery) return true;
				return (
					normalizeSearch(r.player.name).includes(normQuery) ||
					normalizeSearch(r.teamName ?? '').includes(normQuery)
				);
			})
			.slice()
			.sort((a, b) => {
				const dir = sortDir === 'asc' ? 1 : -1;
				let cmp = 0;
				if (sortCol === 'name') cmp = a.player.name.localeCompare(b.player.name, 'he');
				else if (sortCol === 'team')
					cmp = (a.teamName ?? '').localeCompare(b.teamName ?? '', 'he');
				else if (sortCol === 'position') cmp = a.player.position - b.player.position;
				else if (sortCol === 'price') cmp = a.player.price - b.player.price;
				else if (sortCol === 'points')
					cmp = (seasonPoints(a.player) ?? 0) - (seasonPoints(b.player) ?? 0);
				else if (sortCol === 'vlfm') {
					cmp = (vlfm(a.player) ?? -1) - (vlfm(b.player) ?? -1);
				} else if (sortCol === 'decile') {
					cmp =
						(pointsDeciles.get(a.player.id)?.decile ?? 0) -
						(pointsDeciles.get(b.player.id)?.decile ?? 0);
				} else if (sortCol === 'nextDiff') {
					const da = nextOppDiff(a);
					const db = nextOppDiff(b);
					cmp = (da ? DIFF_RANK[da] : 0) - (db ? DIFF_RANK[db] : 0);
				} else if (sortCol === 'runDiff') {
					cmp = (runAvg(a) ?? 99) - (runAvg(b) ?? 99);
				}
				if (cmp !== 0) return cmp * dir;
				return a.player.name.localeCompare(b.player.name, 'he');
			})
	);

	/** Fantasy view: GK top → attack bottom */
	const PITCH_ROWS = [
		{ pos: 1, label: 'שוער' },
		{ pos: 2, label: 'הגנה' },
		{ pos: 3, label: 'קישור' },
		{ pos: 4, label: 'התקפה' }
	] as const;

	/** Bench LTR-of-RTL: GK on the right, then DEF, MID, FWD */
	const BENCH_SLOTS = [
		{ pos: 1, label: 'שוער' },
		{ pos: 2, label: 'הגנה' },
		{ pos: 3, label: 'קישור' },
		{ pos: 4, label: 'התקפה' }
	] as const;

	function benchForPos(pos: number) {
		const id = bench.find((bid) => byId.get(bid)?.player.position === pos);
		return id != null ? byId.get(id) : null;
	}

	function playersInRow(pos: number) {
		const ids = xi.filter((id) => byId.get(id)?.player.position === pos);
		// keep XI array order; tie-break by name if needed
		return ids
			.map((id) => byId.get(id))
			.filter(Boolean) as typeof data.allPlayers;
	}

	function posOf(id: number) {
		return byId.get(id)?.player.position;
	}

	function canAddPosition(pos: number): boolean {
		const fakeId = -pos;
		return canAddToXi(xi, fakeId, pos, posOf).ok || canAddToBench(bench, fakeId, pos, posOf).ok;
	}

	function filterByPosition(pos: number) {
		posFilter = pos;
		target = 'xi';
		dropHint = null;
	}

	let dragId = $state<number | null>(null);
	let dropHint = $state<string | null>(null);
	let dropTarget = $state<'xi' | 'bench' | null>(null);
	let openStatsId = $state<number | null>(null);
	let statsPanelPos = $state<{ top: number; left: number } | null>(null);
	let helpTip = $state<
		null | { key: 'vlfm' | 'decile' | 'run'; top: number; left: number; pinned?: boolean }
	>(null);

	function showHelp(key: 'vlfm' | 'decile' | 'run', el: HTMLElement, pinned = false) {
		const rect = el.getBoundingClientRect();
		const width = key === 'run' ? 280 : key === 'vlfm' ? 220 : 230;
		helpTip = {
			key,
			top: rect.bottom + 6,
			left: Math.max(8, rect.right - width),
			pinned
		};
	}

	function toggleHelp(key: 'vlfm' | 'decile' | 'run', el: HTMLElement) {
		if (helpTip?.key === key && helpTip.pinned) {
			helpTip = null;
			return;
		}
		showHelp(key, el, true);
	}

	function openTableStats(id: number, el: HTMLElement) {
		const rect = el.getBoundingClientRect();
		// place panel to the visual left of the cell
		const width = 256; // 16rem
		statsPanelPos = {
			top: Math.min(rect.top, window.innerHeight - 280),
			left: Math.max(8, rect.left - width - 8)
		};
		openStatsId = openStatsId === id ? null : id;
		if (openStatsId == null) statsPanelPos = null;
	}

	function toggleStats(id: number) {
		openStatsId = openStatsId === id ? null : id;
		if (openStatsId == null) statsPanelPos = null;
		else statsPanelPos = null; // pitch cards keep relative panels; clear fixed
	}

	function removePlayer(id: number) {
		xi = xi.filter((x) => x !== id);
		bench = bench.filter((x) => x !== id);
	}

	function teamOf(id: number): number | undefined {
		return byId.get(id)?.player.teamId;
	}

	function priceOf(id: number): number {
		return byId.get(id)?.player.price ?? 0;
	}

	let hintTimer: ReturnType<typeof setTimeout> | null = null;
	function showHint(msg: string) {
		dropHint = msg;
		if (hintTimer) clearTimeout(hintTimer);
		hintTimer = setTimeout(() => {
			if (dropHint === msg) dropHint = null;
		}, 4500);
	}

	function tryAddToXi(id: number): boolean {
		const r = byId.get(id);
		if (!r) return false;
		const xiWithout = xi.filter((x) => x !== id);
		const benchWithout = bench.filter((x) => x !== id);
		const fit = canFitInSquad(
			[...xiWithout, ...benchWithout],
			id,
			r.player.teamId,
			r.player.price,
			teamOf,
			priceOf
		);
		if (!fit.ok) {
			showHint(fit.reason ?? 'לא ניתן להוסיף');
			return false;
		}
		const check = canAddToXi(xiWithout, id, r.player.position, posOf);
		if (!check.ok) {
			showHint(check.reason ?? 'לא ניתן להוסיף להרכב');
			return false;
		}
		bench = benchWithout;
		xi = [...xiWithout, id];
		dropHint = null;
		return true;
	}

	function tryAddToBench(id: number): boolean {
		const r = byId.get(id);
		if (!r) return false;
		const xiWithout = xi.filter((x) => x !== id);
		const benchWithout = bench.filter((x) => x !== id);
		const fit = canFitInSquad(
			[...xiWithout, ...benchWithout],
			id,
			r.player.teamId,
			r.player.price,
			teamOf,
			priceOf
		);
		if (!fit.ok) {
			showHint(fit.reason ?? 'לא ניתן להוסיף');
			return false;
		}
		const check = canAddToBench(benchWithout, id, r.player.position, posOf);
		if (!check.ok) {
			showHint(check.reason ?? 'לא ניתן להוסיף לספסל');
			return false;
		}
		xi = xiWithout;
		bench = [...benchWithout.filter((x) => posOf(x) !== r.player.position), id];
		dropHint = null;
		return true;
	}

	/** Preview whether + would succeed for current target (no mutation). */
	function canAddPlayer(id: number): boolean {
		if (xi.includes(id) || bench.includes(id)) return false;
		const r = byId.get(id);
		if (!r) return false;
		const xiWithout = xi.filter((x) => x !== id);
		const benchWithout = bench.filter((x) => x !== id);
		const fit = canFitInSquad(
			[...xiWithout, ...benchWithout],
			id,
			r.player.teamId,
			r.player.price,
			teamOf,
			priceOf
		);
		if (!fit.ok) return false;
		if (target === 'xi') {
			return canAddToXi(xiWithout, id, r.player.position, posOf).ok;
		}
		return canAddToBench(benchWithout, id, r.player.position, posOf).ok;
	}

	function addBlockedReason(id: number): string | null {
		if (xi.includes(id) || bench.includes(id)) return null;
		const r = byId.get(id);
		if (!r) return 'שחקן לא נמצא';
		const xiWithout = xi.filter((x) => x !== id);
		const benchWithout = bench.filter((x) => x !== id);
		const fit = canFitInSquad(
			[...xiWithout, ...benchWithout],
			id,
			r.player.teamId,
			r.player.price,
			teamOf,
			priceOf
		);
		if (!fit.ok) return fit.reason ?? 'לא ניתן להוסיף';
		if (target === 'xi') {
			const check = canAddToXi(xiWithout, id, r.player.position, posOf);
			return check.ok ? null : (check.reason ?? 'לא ניתן להוסיף להרכב');
		}
		const check = canAddToBench(benchWithout, id, r.player.position, posOf);
		return check.ok ? null : (check.reason ?? 'לא ניתן להוסיף לספסל');
	}

	function toggle(id: number) {
		const inXi = xi.includes(id);
		const inBench = bench.includes(id);
		if (inXi || inBench) {
			removePlayer(id);
			return;
		}
		if (target === 'xi') tryAddToXi(id);
		else tryAddToBench(id);
	}

	function onDragStart(e: DragEvent, id: number) {
		dragId = id;
		dropHint = null;
		e.dataTransfer?.setData('text/plain', String(id));
		if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
	}

	function onDragEnd() {
		dragId = null;
		dropTarget = null;
	}

	function onDragOver(e: DragEvent, where: 'xi' | 'bench') {
		e.preventDefault();
		dropTarget = where;
		if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
	}

	function onDropXi(e: DragEvent) {
		e.preventDefault();
		const id = Number(e.dataTransfer?.getData('text/plain') || dragId);
		dropTarget = null;
		if (Number.isFinite(id) && id > 0) tryAddToXi(id);
		dragId = null;
	}

	function onDropBench(e: DragEvent) {
		e.preventDefault();
		const id = Number(e.dataTransfer?.getData('text/plain') || dragId);
		dropTarget = null;
		if (Number.isFinite(id) && id > 0) tryAddToBench(id);
		dragId = null;
	}
</script>

<section class="space-y-6">
	{#if dropHint}
		<div
			class="fixed left-4 top-20 z-[200] max-w-sm rounded-xl border border-amber-400/70 bg-slate-950/95 px-4 py-3 text-sm font-medium text-amber-100 shadow-2xl backdrop-blur"
			role="status"
		>
			לא ניתן להוסיף: {dropHint}
		</div>
	{/if}
	{#if helpTip}
		<div
			class="fixed z-[210] w-56 rounded-lg border border-slate-600 bg-slate-950 px-2.5 py-2 text-[11px] leading-snug text-slate-200 shadow-xl"
			style="top: {helpTip.top}px; left: {helpTip.left}px;"
			role="tooltip"
		>
			{#if helpTip.key === 'vlfm'}
				<strong class="text-violet-300">vlfm</strong>
				= נקודות עונה ÷ מחיר (מיליונים). כמה נקודות מקבלים לכל מיליון.
			{:else if helpTip.key === 'decile'}
				<strong class="text-emerald-300">עשירון</strong>
				לפי נקודות עונה בלבד (לא vlfm). ממיינים את הפול מהנמוך לגבוה; 10 =
				עליון, 1 = תחתון. שחקנים עם 0 נק׳ לא נכנסים לחישוב.
			{:else}
				<strong class="text-amber-200">לוח (5)</strong>
				ממוצע קושי של 5 המשחקים הבאים של הקבוצה: ירוק=1, צהוב=2, אדום=3.
				<br />קל ≤ 1.5 · בינוני ≤ 2.25 · קשה מעל 2.25.
				<br />לחיצה על סמל בוחרת את הקבוצה בפילטר.
			{/if}
		</div>
	{/if}
	{#if openStatsId != null && statsPanelPos && byId.get(openStatsId)}
		{@const sp = byId.get(openStatsId)!}
		<div
			class="fixed z-[200] w-[16rem] overflow-hidden rounded-xl border border-slate-700 bg-slate-950 p-3 text-right shadow-2xl"
			style="top: {statsPanelPos.top}px; left: {statsPanelPos.left}px;"
		>
			<PlayerStatsPanel
				lines={playerStatLines(sp.player)}
				roundPoints={lastRoundPoints(sp.player)}
				seasonPts={seasonPoints(sp.player)}
			/>
		</div>
	{/if}

	<div class="flex flex-wrap items-end justify-between gap-3">
		<div>
			<h1 class="text-2xl font-bold">הקבוצה שלי</h1>
			<p class="text-sm text-slate-400">
				גררו שחקן להרכב/ספסל. X מסיר. לחיצה על כרטיס = פירוט נקודות.
			</p>
		</div>
		{#if form?.success && form?.sketchSaved}
			<span class="rounded-lg bg-emerald-500/20 px-3 py-1 text-sm text-emerald-300"
				>סקיצה נשמרה למחזור {form.sketchGw} ✓ · <a class="underline" href="/sketches?gw={form.sketchGw}">לסקיצות</a></span
			>
		{:else if form?.success}
			<span class="rounded-lg bg-emerald-500/20 px-3 py-1 text-sm text-emerald-300">נשמר ✓</span>
		{/if}
		{#if form?.message}
			<span class="rounded-lg bg-red-500/20 px-3 py-1 text-sm text-red-300">{form.message}</span>
		{/if}
	</div>

	<form
		method="POST"
		action="?/save"
		use:enhance={() => {
			return async ({ result, update }) => {
				await update();
				if (result.type === 'success') {
					savedXi = [...xi];
					savedBench = [...bench];
					// drop staged query params after persist
					if (typeof window !== 'undefined' && window.location.search.includes('staged=')) {
						history.replaceState({}, '', '/squad');
					}
				}
			};
		}}
		class="space-y-4"
	>
		<input type="hidden" name="xi" value={xi.join(',')} />
		<input type="hidden" name="bench" value={bench.join(',')} />
		<div class="flex flex-wrap items-center gap-3">
			<label class="text-sm text-slate-400">
				חילופים חופשיים
				<input
					type="number"
					name="freeTransfers"
					bind:value={freeTransfers}
					min="0"
					max="15"
					class="mr-2 w-16 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1"
				/>
			</label>
			<button
				type="submit"
				class="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400"
			>
				שמור קבוצה
			</button>
			<button
				type="submit"
				formaction="?/saveSketch"
				class="rounded-xl border border-emerald-400/60 bg-slate-900 px-4 py-2 text-sm font-semibold text-emerald-200 hover:bg-slate-800"
			>
				שמור כסקיצה
			</button>
			<input type="hidden" name="gameweekNumber" value={data.currentGw} />
			<input type="hidden" name="sketchName" value="סקיצה מחזור {data.currentGw}" />
			<div class="flex gap-2 text-sm">
				<button
					type="button"
					class="rounded-lg px-3 py-1 {target === 'xi' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-800'}"
					onclick={() => (target = 'xi')}>הוסף ל־XI</button
				>
				<button
					type="button"
					class="rounded-lg px-3 py-1 {target === 'bench' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-800'}"
					onclick={() => (target = 'bench')}>הוסף לספסל</button
				>
			</div>
			<span class="text-xs text-slate-500">XI {xi.length}/11</span>
		</div>
	</form>

	<div class="grid gap-6 lg:grid-cols-[minmax(20rem,32rem)_minmax(0,1fr)]">
		<div class="space-y-3 lg:max-w-[32rem]">
			<!-- Pitch -->
			<div
				role="region"
				aria-label="הרכב"
				class="relative overflow-visible rounded-2xl border border-emerald-700/40 p-3 shadow-inner transition
					{dropTarget === 'xi' ? 'ring-2 ring-emerald-400' : ''}"
				ondragover={(e) => onDragOver(e, 'xi')}
				ondragleave={() => { if (dropTarget === 'xi') dropTarget = null; }}
				ondrop={onDropXi}
				style="background:
					linear-gradient(180deg, rgba(16,185,129,0.15), transparent 40%),
					repeating-linear-gradient(
						0deg,
						#166534 0px,
						#166534 48px,
						#15803d 48px,
						#15803d 96px
					);"
			>
				<div
					class="absolute right-2 top-2 z-20 rounded-xl border border-white/15 bg-slate-950/85 px-2.5 py-1.5 text-right text-[11px] shadow-lg backdrop-blur-sm"
					title="תקציב הקבוצה (מיליונים)"
				>
					<div class="tabular-nums text-slate-100">
						<span class="font-semibold text-amber-300">{spentBudget}</span>
						<span class="text-slate-500"> / </span>
						<span class="text-slate-300">{BUDGET_TOTAL}</span>
					</div>
					<div
						class="tabular-nums {remainingBudget < 0
							? 'text-red-300'
							: remainingBudget === 0
								? 'text-slate-400'
								: 'text-emerald-300'}"
					>
						פנוי {remainingBudget}
					</div>
				</div>
				<div class="pointer-events-none absolute inset-x-8 top-1/2 h-px bg-white/20"></div>
				<div
					class="pointer-events-none absolute left-1/2 top-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/20"
				></div>

				<div class="relative flex min-h-[420px] flex-col justify-between gap-2 py-2">
					{#each PITCH_ROWS as row}
						{@const rowPlayers = playersInRow(row.pos)}
						<div class="flex flex-col items-center gap-1">
							<span class="text-[10px] font-medium uppercase tracking-wide text-white/50"
								>{row.label}</span
							>
							<div class="relative flex w-full min-h-[5.5rem] items-center justify-center px-9">
								{#if canAddPosition(row.pos)}
									<button
										type="button"
										class="absolute left-1 top-1/2 z-10 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-emerald-500 text-base font-bold leading-none text-slate-950 shadow-lg hover:bg-emerald-400"
										title="סנן לפי {row.label}"
										onclick={() => filterByPosition(row.pos)}
									>+</button
									>
								{/if}
								<div class="flex flex-wrap items-start justify-center gap-2">
									{#each rowPlayers as r}
									<div class="relative" class:z-[90]={openStatsId === r.player.id}>
										<button
											type="button"
											class="absolute -left-1 -top-1 z-20 flex h-5 w-5 items-center justify-center rounded-md bg-slate-700/90 text-sm font-medium text-slate-200 shadow hover:bg-slate-600 hover:text-white"
											title="הסרה"
											onclick={(e) => {
												e.stopPropagation();
												openStatsId = null;
												removePlayer(r.player.id);
											}}
										>×</button
										>
										<button
											type="button"
											draggable="true"
											class="group flex w-[6.5rem] cursor-grab flex-col items-center overflow-visible rounded-xl border border-white/10 bg-slate-950/75 px-1 py-1.5 text-center shadow-lg backdrop-blur-sm transition hover:border-emerald-400/50 active:cursor-grabbing"
											onclick={() => toggleStats(r.player.id)}
											ondragstart={(e) => onDragStart(e, r.player.id)}
											ondragend={onDragEnd}
											title="לחצו לפירוט · גררו להעברה"
										>
											<div class="mb-0.5 flex h-7 w-7 items-center justify-center overflow-hidden rounded-full bg-slate-800">
												{#if r.teamLogo ?? r.player.teamLogoPath}
													<img
														src={r.teamLogo ?? r.player.teamLogoPath}
														alt=""
														class="h-6 w-6 object-contain"
													/>
												{:else}
													<span class="text-[10px]">⚽</span>
												{/if}
											</div>
											<span class="line-clamp-2 w-full text-[10px] font-semibold leading-tight text-white"
												>{r.player.name}</span
											>
											<span class="text-[10px] font-semibold tabular-nums text-amber-300"
												>{formatPrice(r.player.price)}</span
											>
											<span class="text-[10px] tabular-nums text-slate-100"
												>{formatPointsLabel(r.player)}</span
											>
											<span class="text-[9px] tabular-nums text-violet-200"
												>{formatVlfm(vlfm(r.player))} vlfm</span
											>
											{#if pointsDeciles.get(r.player.id)}
												{@const d = pointsDeciles.get(r.player.id)!}
												<span class="rounded px-1 py-0.5 text-[9px] {d.className}">{d.label}</span>
											{/if}
											<div class="mt-1 w-full overflow-visible">
												<FixtureStrip fixtures={r.upcomingFixtures ?? []} slots={5} />
											</div>
										</button>
										{#if openStatsId === r.player.id}
											<div
												class="absolute left-1/2 top-full z-[100] mt-1 w-[16rem] max-w-[16rem] -translate-x-1/2 overflow-hidden rounded-xl border border-slate-700 bg-slate-950 p-3 text-right shadow-2xl"
											>
												<PlayerStatsPanel
													lines={playerStatLines(r.player)}
													roundPoints={lastRoundPoints(r.player)}
													seasonPts={seasonPoints(r.player)}
												/>
											</div>
										{/if}
									</div>
								{:else}
									<span class="rounded-lg border border-dashed border-white/20 px-3 py-2 text-[10px] text-white/40"
										>ריק</span
									>
								{/each}
								</div>
							</div>
						</div>
					{/each}
				</div>
			</div>

			<!-- Bench: GK right → DEF → MID → FWD; empty square if missing -->
			<div
				role="region"
				aria-label="ספסל"
				class="rounded-2xl border border-slate-800 bg-slate-900/60 p-3 transition
					{dropTarget === 'bench' ? 'ring-2 ring-sky-400' : ''}"
				ondragover={(e) => onDragOver(e, 'bench')}
				ondragleave={() => { if (dropTarget === 'bench') dropTarget = null; }}
				ondrop={onDropBench}
			>
				<h2 class="mb-2 font-semibold text-sky-300">ספסל ({bench.length}/4)</h2>
				<div class="flex flex-row justify-center gap-2" dir="rtl">
					{#each BENCH_SLOTS as slot}
						{@const r = benchForPos(slot.pos)}
						{#if r}
							<div class="relative" class:z-[90]={openStatsId === r.player.id}>
								<button
									type="button"
									class="absolute -left-1 -top-1 z-20 flex h-5 w-5 items-center justify-center rounded-md bg-slate-700/90 text-sm font-medium text-slate-200 shadow hover:bg-slate-600 hover:text-white"
									title="הסרה"
									onclick={(e) => {
										e.stopPropagation();
										openStatsId = null;
										removePlayer(r.player.id);
									}}
								>×</button
								>
								<button
									type="button"
									draggable="true"
									class="flex w-[6.5rem] cursor-grab flex-col items-center rounded-xl border border-slate-700 bg-slate-950/80 px-1.5 py-1.5 hover:border-emerald-400/50 active:cursor-grabbing"
									onclick={() => toggleStats(r.player.id)}
									ondragstart={(e) => onDragStart(e, r.player.id)}
									ondragend={onDragEnd}
									title="{slot.label} — לחצו לפירוט · גררו להעברה"
								>
									<span class="mb-0.5 text-[9px] text-slate-500">{slot.label}</span>
									{#if r.teamLogo ?? r.player.teamLogoPath}
										<img
											src={r.teamLogo ?? r.player.teamLogoPath}
											alt=""
											class="mb-0.5 h-6 w-6 object-contain"
										/>
									{/if}
									<span class="line-clamp-2 text-[10px] font-medium">{r.player.name}</span>
									<span class="text-[10px] font-semibold tabular-nums text-amber-300"
										>{formatPrice(r.player.price)}</span
									>
									<span class="text-[10px] tabular-nums text-slate-200"
										>{formatPointsLabel(r.player)}</span
									>
									<div class="mt-0.5 w-full overflow-visible">
										<FixtureStrip fixtures={r.upcomingFixtures ?? []} />
									</div>
								</button>
								{#if openStatsId === r.player.id}
									<div
										class="absolute left-1/2 top-full z-[100] mt-1 w-[16rem] max-w-[16rem] -translate-x-1/2 overflow-hidden rounded-xl border border-slate-700 bg-slate-950 p-3 text-right shadow-2xl"
									>
										<PlayerStatsPanel
											lines={playerStatLines(r.player)}
											roundPoints={lastRoundPoints(r.player)}
											seasonPts={seasonPoints(r.player)}
										/>
									</div>
								{/if}
							</div>
						{:else}
							<button
								type="button"
								class="flex h-[7.5rem] w-[6.5rem] flex-col items-center justify-center rounded-xl border border-dashed border-slate-600 bg-slate-950/40 transition hover:border-emerald-400/60 hover:bg-slate-900/80"
								title="סנן לפי {slot.label}"
								onclick={() => filterByPosition(slot.pos)}
							>
								<span class="text-[10px] text-slate-500">{slot.label}</span>
								<span class="mt-1 text-lg font-bold text-emerald-400">+</span>
								<span class="mt-0.5 text-[10px] text-slate-600">ריק</span>
							</button>
						{/if}
					{/each}
				</div>
			</div>

			<!-- Transfer summary vs last saved squad -->
			<div class="rounded-2xl border border-slate-800 bg-slate-900/60 p-3">
				<h2 class="mb-2 font-semibold text-amber-200">חילופים עד כה</h2>
				{#if transferSummary.out.length === 0 && transferSummary.in.length === 0}
					<p class="text-xs text-slate-500">אין חילופים מול ההרכב השמור</p>
				{:else}
					<div class="grid gap-3 sm:grid-cols-2">
						<div>
							<div class="mb-1 text-xs text-red-300">יוצאים ({transferSummary.out.length})</div>
							<ul class="space-y-1">
								{#each transferSummary.out as r}
									<li class="flex items-center justify-between gap-2 rounded-lg bg-red-500/10 px-2 py-1 text-xs">
										<span class="truncate font-medium">{r.player.name}</span>
										<span class="shrink-0 text-slate-400"
											>{positionLabel(r.player.position)} · {formatPrice(r.player.price)}</span
										>
									</li>
								{:else}
									<li class="text-xs text-slate-500">—</li>
								{/each}
							</ul>
						</div>
						<div>
							<div class="mb-1 text-xs text-emerald-300">נכנסים ({transferSummary.in.length})</div>
							<ul class="space-y-1">
								{#each transferSummary.in as r}
									<li class="flex items-center justify-between gap-2 rounded-lg bg-emerald-500/10 px-2 py-1 text-xs">
										<span class="truncate font-medium">{r.player.name}</span>
										<span class="shrink-0 text-slate-400"
											>{positionLabel(r.player.position)} · {formatPrice(r.player.price)}</span
										>
									</li>
								{:else}
									<li class="text-xs text-slate-500">—</li>
								{/each}
							</ul>
						</div>
					</div>
					<p class="mt-2 text-[11px] text-slate-500">
						{transferSummary.out.length} יוצאים · {transferSummary.in.length} נכנסים
						{#if Math.max(transferSummary.out.length, transferSummary.in.length) > freeTransfers}
							<span class="text-amber-300">· מעל מכסת החילופים החופשיים ({freeTransfers})</span>
						{/if}
					</p>
				{/if}
			</div>
		</div>

		<div class="flex min-h-0 flex-col gap-3">
			<div class="space-y-2 rounded-xl border border-slate-800 bg-slate-950/40 p-2 text-xs">
				<div class="text-slate-400" title="המשחק הקרוב ביותר">
					יריבה קרובה — לחיצה על סמל = בחירת קבוצה
				</div>
				{#each DIFF_ORDER as d}
					{@const teams = teamsForNextOpp(d)}
					<div class="flex flex-wrap items-center gap-1.5">
						<button
							type="button"
							class="shrink-0 rounded-lg px-2 py-1 font-medium {teams.length &&
							teams.every((t) => teamFilters.includes(t.id))
								? DIFFICULTY_BG[d] + ' ring-1 ring-white/20'
								: 'bg-slate-800 text-slate-300'}"
							title="בחר/בטל את כל הקבוצות עם יריבה {DIFFICULTY_LABEL[d]}"
							onclick={() => toggleTeamsInList(teams.map((t) => t.id))}
						>
							{DIFFICULTY_LABEL[d]}
							<span class="opacity-70">({teams.length})</span>
						</button>
						{#each teams as team}
							<button
								type="button"
								class="flex h-7 w-7 items-center justify-center overflow-hidden rounded-full bg-white ring-2 {teamFilters.includes(
									team.id
								)
									? DIFFICULTY_RING[d] + ' ring-offset-1 ring-offset-slate-950'
									: 'ring-slate-600'}"
								onclick={() => toggleTeam(team.id)}
								title="{team.name} · יריבה {DIFFICULTY_LABEL[d]}"
							>
								{#if team.logo}
									<img src={team.logo} alt={team.name} class="h-5 w-5 object-contain" />
								{:else}
									<span class="text-[8px] text-slate-700">{team.name.slice(0, 2)}</span>
								{/if}
							</button>
						{:else}
							<span class="text-slate-600">אין</span>
						{/each}
					</div>
				{/each}
			</div>

			<div class="space-y-2 rounded-xl border border-slate-800 bg-slate-950/40 p-2 text-xs">
				<div class="flex flex-wrap items-center gap-1.5 text-slate-400">
					<span title="ממוצע קושי 5 המשחקים הקרובים">לוח (5) — לחיצה על סמל = בחירת קבוצה</span>
					<button
						type="button"
						class="flex h-4 w-4 items-center justify-center rounded-full bg-slate-700 text-[10px] font-bold text-slate-200 hover:bg-slate-600"
						aria-label="איך מחושב לוח"
						onclick={(e) => {
							e.stopPropagation();
							toggleHelp('run', e.currentTarget);
						}}
						onmouseenter={(e) => showHelp('run', e.currentTarget, false)}
						onmouseleave={() => {
							if (helpTip?.key === 'run' && !helpTip.pinned) helpTip = null;
						}}
					>?</button
					>
				</div>
				{#each DIFF_ORDER as d}
					{@const teams = teamsForRun(d)}
					<div class="flex flex-wrap items-center gap-1.5">
						<button
							type="button"
							class="shrink-0 rounded-lg px-2 py-1 font-medium {teams.length &&
							teams.every((t) => teamFilters.includes(t.id))
								? DIFFICULTY_BG[d] + ' ring-1 ring-white/20'
								: 'bg-slate-800 text-slate-300'}"
							title="בחר/בטל את כל הקבוצות עם לוח {DIFFICULTY_LABEL[d]}"
							onclick={() => toggleTeamsInList(teams.map((t) => t.id))}
						>
							{DIFFICULTY_LABEL[d]}
							<span class="opacity-70">({teams.length})</span>
						</button>
						{#each teams as team}
							<button
								type="button"
								class="flex h-7 w-7 items-center justify-center overflow-hidden rounded-full bg-white ring-2 {teamFilters.includes(
									team.id
								)
									? DIFFICULTY_RING[d] + ' ring-offset-1 ring-offset-slate-950'
									: 'ring-slate-600'}"
								onclick={() => toggleTeam(team.id)}
								title="{team.name} · לוח {DIFFICULTY_LABEL[d]} ({formatFixtureRun(team.runAvg)})"
							>
								{#if team.logo}
									<img src={team.logo} alt={team.name} class="h-5 w-5 object-contain" />
								{:else}
									<span class="text-[8px] text-slate-700">{team.name.slice(0, 2)}</span>
								{/if}
							</button>
						{:else}
							<span class="text-slate-600">אין</span>
						{/each}
					</div>
				{/each}
			</div>

			<div class="rounded-xl border border-slate-800 bg-slate-950/50 p-2">
				<div class="mb-2 flex items-center justify-between text-xs text-slate-400">
					<span>קבוצות (בחירה מרובה)</span>
					{#if teamFilters.length}
						<button type="button" class="text-emerald-300" onclick={() => (teamFilters = [])}
							>נקה</button
						>
					{/if}
				</div>
				<div class="flex flex-wrap gap-1.5">
					{#each TEAM_DIFF_GROUPS as group}
						{#each teamOptions.filter((tm) => tm.difficulty === group.key) as team}
							<button
								type="button"
								class="flex items-center gap-1.5 rounded-full py-1 pl-2.5 pr-1 text-[11px] {teamFilters.includes(
									team.id
								)
									? 'bg-sky-500/30 text-sky-100 ring-2 ' + DIFFICULTY_RING[group.key]
									: 'bg-slate-800 text-slate-300 ring-1 ring-slate-700'}"
								onclick={() => toggleTeam(team.id)}
								title={team.name}
							>
								<span
									class="flex h-5 w-5 items-center justify-center overflow-hidden rounded-full bg-slate-900"
								>
									{#if team.logo}
										<img src={team.logo} alt="" class="h-4 w-4 object-contain" />
									{/if}
								</span>
								<span class="max-w-[7rem] truncate">{team.name}</span>
							</button>
						{/each}
					{/each}
				</div>
			</div>

			<PriceRangeSlider bind:minValue={priceMin} bind:maxValue={priceMax} min={3} max={15} />

			<div class="flex flex-wrap gap-2">
				<button
					type="button"
					class="rounded-lg px-2.5 py-1 text-xs {posFilter === 0 ? 'bg-emerald-500/25 text-emerald-200' : 'bg-slate-800 text-slate-300'}"
					onclick={() => (posFilter = 0)}>כל העמדות</button
				>
				{#each [1, 2, 3, 4] as pos}
					<button
						type="button"
						class="rounded-lg px-2.5 py-1 text-xs {posFilter === pos ? 'bg-emerald-500/25 text-emerald-200' : 'bg-slate-800 text-slate-300'}"
						onclick={() => (posFilter = pos)}>{positionLabel(pos)}</button
					>
				{/each}
			</div>


			<div class="relative">
				<input
					bind:value={q}
					placeholder="חיפוש שחקן"
					class="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 pl-9 text-sm"
				/>
				{#if q}
					<button
						type="button"
						onclick={() => (q = '')}
						aria-label="נקה חיפוש"
						title="נקה חיפוש"
						class="absolute left-2 top-1/2 -translate-y-1/2 flex h-6 w-6 items-center justify-center rounded-full bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white"
					>×</button
					>
				{/if}
			</div>

			<p class="text-xs text-slate-500">{filtered.length} מתוך {poolPlayers.length} שחקנים</p>

			<div
				class="h-[min(70vh,560px)] overflow-auto overscroll-contain rounded-xl border border-slate-800 bg-slate-950/40"
			>
				<table class="w-full min-w-[48rem] border-collapse text-right text-xs">
					<thead class="sticky top-0 z-10 bg-slate-900 text-slate-300 shadow">
						<tr>
							<th class="p-2 font-medium">
								<button type="button" class="hover:text-white" onclick={() => toggleSort('name')}
									>שם{sortMark('name')}</button
								>
							</th>
							<th class="p-2 font-medium">
								<button type="button" class="hover:text-white" onclick={() => toggleSort('team')}
									>קבוצה{sortMark('team')}</button
								>
							</th>
							<th class="p-2 font-medium">
								<button type="button" class="hover:text-white" onclick={() => toggleSort('position')}
									>עמדה{sortMark('position')}</button
								>
							</th>
							<th class="p-2 font-medium">
								<button type="button" class="hover:text-white" onclick={() => toggleSort('price')}
									>מחיר{sortMark('price')}</button
								>
							</th>
							<th class="p-2 font-medium">
								<button type="button" class="hover:text-white" onclick={() => toggleSort('points')}
									>נק׳{sortMark('points')}</button
								>
							</th>
							<th class="p-2 font-medium">
								<span class="inline-flex items-center gap-1">
									<button type="button" class="hover:text-white" onclick={() => toggleSort('vlfm')}
										>vlfm{sortMark('vlfm')}</button
									>
									<button
										type="button"
										class="flex h-4 w-4 items-center justify-center rounded-full bg-slate-700 text-[10px] font-bold text-slate-200 hover:bg-slate-600"
										aria-label="מה זה vlfm"
										onclick={(e) => {
											e.stopPropagation();
											toggleHelp('vlfm', e.currentTarget);
										}}
										onmouseenter={(e) => showHelp('vlfm', e.currentTarget, false)}
										onmouseleave={() => {
											if (helpTip?.key === 'vlfm' && !helpTip.pinned) helpTip = null;
										}}
									>?</button
									>
								</span>
							</th>
							<th class="p-2 font-medium">
								<span class="inline-flex items-center gap-1">
									<button type="button" class="hover:text-white" onclick={() => toggleSort('decile')}
										>עשירון{sortMark('decile')}</button
									>
									<button
										type="button"
										class="flex h-4 w-4 items-center justify-center rounded-full bg-slate-700 text-[10px] font-bold text-slate-200 hover:bg-slate-600"
										aria-label="מה זה עשירון"
										onclick={(e) => {
											e.stopPropagation();
											toggleHelp('decile', e.currentTarget);
										}}
										onmouseenter={(e) => showHelp('decile', e.currentTarget, false)}
										onmouseleave={() => {
											if (helpTip?.key === 'decile' && !helpTip.pinned) helpTip = null;
										}}
									>?</button
									>
								</span>
							</th>
							<th class="p-2 font-medium" title="היריבה במשחק הקרוב">
								<button type="button" class="hover:text-white" onclick={() => toggleSort('nextDiff')}
									>יריבה{sortMark('nextDiff')}</button
								>
							</th>
							<th class="p-2 font-medium" title="ממוצע קושי + 5 המשחקים הקרובים">
								<button type="button" class="hover:text-white" onclick={() => toggleSort('runDiff')}
									>לוח{sortMark('runDiff')}</button
								>
							</th>
						</tr>
					</thead>
					<tbody>
						{#each filtered as r (r.player.id)}
							{@const inSquad = xi.includes(r.player.id) || bench.includes(r.player.id)}
							<tr
								draggable="true"
								class="border-t border-slate-800/80 hover:bg-slate-800/40 {inSquad
									? 'bg-emerald-500/5'
									: ''} {openStatsId === r.player.id ? 'bg-slate-800/60' : ''} cursor-grab active:cursor-grabbing"
								ondragstart={(e) => onDragStart(e, r.player.id)}
								ondragend={onDragEnd}
							>
								<td class="relative max-w-[9rem] p-2">
									{#if inSquad}
										<button
											type="button"
											class="absolute left-1 top-1 z-20 flex h-4 w-4 items-center justify-center rounded bg-emerald-500/90 text-[11px] font-bold text-slate-950 shadow hover:bg-red-500 hover:text-white"
											title="{xi.includes(r.player.id) ? 'בהרכב' : 'בספסל'} · לחץ להסרה"
											onclick={(e) => {
												e.stopPropagation();
												openStatsId = null;
												removePlayer(r.player.id);
											}}>✓</button
										>
									{:else}
										{@const addOk = canAddPlayer(r.player.id)}
										{@const blocked = addBlockedReason(r.player.id)}
										<button
											type="button"
											class="absolute left-1 top-1 z-20 flex h-4 w-4 items-center justify-center rounded text-[11px] font-bold
												{addOk
													? 'bg-emerald-600 text-white hover:bg-emerald-500'
													: 'bg-slate-600/70 text-slate-300 hover:bg-slate-600'}"
											title={addOk
												? target === 'xi'
													? 'הוסף להרכב'
													: 'הוסף לספסל'
												: blocked ?? 'לא ניתן להוסיף'}
											onclick={(e) => {
												e.stopPropagation();
												openStatsId = null;
												if (!addOk && blocked) showHint(blocked);
												else toggle(r.player.id);
											}}>+</button
										>
									{/if}
									<button
										type="button"
										class="w-full truncate text-right font-medium hover:underline"
										onclick={(e) => openTableStats(r.player.id, e.currentTarget)}
										title={r.player.name}
									>
										{r.player.name}
									</button>
									{#if r.player.missingStatus === 1}
										<span class="text-[10px] text-yellow-300">נעדר</span>
									{/if}
								</td>
								<td class="p-2">
									<span
										class="mx-auto flex h-7 w-7 items-center justify-center overflow-hidden rounded-full bg-white"
										title={r.teamName ?? ''}
									>
										{#if r.teamLogo ?? r.player.teamLogoPath}
											<img
												src={r.teamLogo ?? r.player.teamLogoPath}
												alt={r.teamName ?? ''}
												class="h-5 w-5 object-contain"
											/>
										{:else}
											<span class="text-[9px] text-slate-500">—</span>
										{/if}
									</span>
								</td>
								<td class="whitespace-nowrap p-2 text-slate-400">{positionLabel(r.player.position)}</td>
								<td class="whitespace-nowrap p-2 tabular-nums">{formatPrice(r.player.price)}</td>
								<td class="whitespace-nowrap p-2 tabular-nums text-sky-200"
									>{formatPointsLabel(r.player)}</td
								>
								<td class="whitespace-nowrap p-2 tabular-nums text-violet-200"
									>{formatVlfm(vlfm(r.player))}</td
								>
								<td class="p-2">
									{#if pointsDeciles.get(r.player.id)}
										{@const d = pointsDeciles.get(r.player.id)!}
										<span class="rounded px-1.5 py-0.5 text-[10px] font-medium {d.className}"
											>{d.label}</span
										>
									{:else}
										—
									{/if}
								</td>
								<td class="p-2">
									{#if r.upcomingFixtures?.[0]}
										<FixtureStrip fixtures={[r.upcomingFixtures[0]]} slots={1} />
									{:else}
										<span class="text-slate-600">—</span>
									{/if}
								</td>
								<td class="p-2">
									<div class="flex flex-col items-end gap-1">
										{#if runDiff(r)}
											{@const bucket = runDiff(r)!}
											<span
												class="rounded px-1.5 py-0.5 text-[10px] font-medium {DIFFICULTY_BG[bucket]}"
												title="ממוצע קושי 5 משחקים: {formatFixtureRun(runAvg(r))} (1 קל – 3 קשה)"
											>
												{DIFFICULTY_LABEL[bucket]}
												<span class="opacity-70">({formatFixtureRun(runAvg(r))})</span>
											</span>
										{/if}
										<FixtureStrip fixtures={r.upcomingFixtures ?? []} slots={5} />
									</div>
								</td>
							</tr>
						{:else}
							<tr>
								<td colspan="9" class="p-6 text-center text-slate-500">אין שחקנים תואמים לפילטר</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</div>
	</div>

	<section class="mt-2 space-y-3 rounded-2xl border border-slate-800 bg-slate-900/40 p-4" aria-label="משחקי מחזור">
		<div class="flex flex-wrap items-center justify-between gap-3">
			<div>
				<h2 class="text-lg font-semibold text-emerald-300">משחקי מחזור {viewGw}</h2>
				<p class="text-xs text-slate-500">תאריך, יום ושעה · ניווט בין מחזורים</p>
			</div>
			<nav class="flex flex-wrap items-center gap-2 text-sm" aria-label="ניווט מחזורים במסך הקבוצה">
				<button
					type="button"
					class="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-slate-200 hover:border-emerald-500/50 disabled:cursor-not-allowed disabled:opacity-40"
					disabled={viewGw <= data.minGw}
					onclick={() => (viewGw = Math.max(data.minGw, viewGw - 1))}
				>
					→ מחזור קודם
				</button>
				<span class="rounded-lg bg-emerald-500/15 px-3 py-1.5 font-semibold text-emerald-300">
					מחזור {viewGw}
					{#if viewGw === data.currentGw}
						<span class="font-normal text-slate-400">· נוכחי</span>
					{/if}
				</span>
				<button
					type="button"
					class="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-slate-200 hover:border-emerald-500/50 disabled:cursor-not-allowed disabled:opacity-40"
					disabled={viewGw >= data.maxGw}
					onclick={() => (viewGw = Math.min(data.maxGw, viewGw + 1))}
				>
					מחזור הבא ←
				</button>
			</nav>
		</div>

		{#if fixturesByDay.length === 0}
			<p class="text-sm text-slate-500">אין משחקים במסד למחזור {viewGw}.</p>
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
							{#each group.rows as row (row.id)}
								{@const when = formatKickoff(row.kickoff)}
								<li class="rounded-xl border border-slate-800/80 bg-slate-950/50 px-3 py-2.5">
									<!-- time | home name | home logo | score | away logo | away name -->
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
											{#if row.homeScore != null && row.awayScore != null}
												{row.homeScore}:{row.awayScore}
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
	</section>
</section>
