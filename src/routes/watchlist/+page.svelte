<script lang="ts">
	import { deserialize } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { tick } from 'svelte';
	import FixtureStrip from '$lib/components/FixtureStrip.svelte';
	import PlayerStatsPanel from '$lib/components/PlayerStatsPanel.svelte';
	import PriceRangeSlider from '$lib/components/PriceRangeSlider.svelte';
	import MembershipToggles from '$lib/components/watchlist/MembershipToggles.svelte';
	import WatchSearch from '$lib/components/watchlist/WatchSearch.svelte';
	import {
		type Membership,
		type PoolRow,
		type WatchList
	} from '$lib/components/watchlist/watchlist';
	import {
		DIFFICULTY_BG,
		DIFFICULTY_LABEL,
		DIFFICULTY_SCORE,
		difficultyFor,
		fixtureRunAverage,
		fixtureRunBucket,
		formatFixtureRun
	} from '$lib/difficulty';
	import { formatPrice } from '$lib/format';
	import { formatVlfm, vlfm } from '$lib/playerMetrics';
	import { POSITION_ORDER, positionLabel } from '$lib/positions';
	import type { FixtureDifficulty } from '$lib/server/db/schema';
	import { lastRoundPoints, playerStatLines, seasonPoints } from '$lib/stats';

	let { data } = $props();

	const PRICE_MIN = 3;
	const PRICE_MAX = 15;

	// ---------------------------------------------------------------- membership
	const permIds = $derived(new Set(data.permanent.map((r) => r.playerId)));
	const roundIds = $derived(new Set(data.round.map((r) => r.playerId)));
	const xiIds = $derived(new Set(data.squad.xi));
	const benchIds = $derived(new Set(data.squad.bench));

	/** Optimistic state while a toggle request is in flight: `${list}:${playerId}` → in list? */
	let overrides = $state<Record<string, boolean>>({});
	let pending = $state<Record<number, WatchList>>({});

	function membership(id: number): Membership {
		const p = overrides[`permanent:${id}`];
		const r = overrides[`round:${id}`];
		return {
			permanent: p ?? permIds.has(id),
			round: r ?? roundIds.has(id),
			squad: xiIds.has(id) ? 'xi' : benchIds.has(id) ? 'bench' : null
		};
	}
	const pendingFor = (id: number): WatchList | null => pending[id] ?? null;

	const byId = $derived(new Map(data.players.map((r) => [r.player.id, r])));

	// ---------------------------------------------------------------- UI prefs
	type ListFilter = 'all' | 'permanent' | 'round' | 'both' | 'permOnly' | 'roundOnly';
	type SquadFilter = 'all' | 'in' | 'out';
	type GroupBy = 'none' | 'position' | 'team' | 'list';
	type SortCol =
		| 'name'
		| 'team'
		| 'position'
		| 'price'
		| 'points'
		| 'lastRound'
		| 'vlfm'
		| 'nextDiff'
		| 'runDiff';

	let listFilter = $state<ListFilter>('all');
	let squadFilter = $state<SquadFilter>('all');
	let posFilter = $state<number>(0);
	let teamFilters = $state<number[]>([]);
	let priceMin = $state(PRICE_MIN);
	let priceMax = $state(PRICE_MAX);
	let availableOnly = $state(false);
	let groupBy = $state<GroupBy>('position');
	let sortCol = $state<SortCol>('points');
	let sortDir = $state<'asc' | 'desc'>('desc');
	let moreOpen = $state(false);

	const PREFS_KEY = 'wobi.watchlist.prefs.v1';
	let prefsLoaded = $state(false);
	$effect(() => {
		const prefs = {
			listFilter,
			squadFilter,
			posFilter,
			teamFilters,
			priceMin,
			priceMax,
			availableOnly,
			groupBy,
			sortCol,
			sortDir,
			moreOpen
		};
		if (!prefsLoaded) {
			prefsLoaded = true;
			try {
				const raw = localStorage.getItem(PREFS_KEY);
				const o = raw ? JSON.parse(raw) : null;
				if (o && typeof o === 'object') {
					if (typeof o.listFilter === 'string') listFilter = o.listFilter;
					if (typeof o.squadFilter === 'string') squadFilter = o.squadFilter;
					if (typeof o.posFilter === 'number') posFilter = o.posFilter;
					if (Array.isArray(o.teamFilters)) teamFilters = o.teamFilters.filter(Number.isFinite);
					if (typeof o.priceMin === 'number') priceMin = o.priceMin;
					if (typeof o.priceMax === 'number') priceMax = o.priceMax;
					if (typeof o.availableOnly === 'boolean') availableOnly = o.availableOnly;
					if (typeof o.groupBy === 'string') groupBy = o.groupBy;
					if (typeof o.sortCol === 'string') sortCol = o.sortCol;
					if (o.sortDir === 'asc' || o.sortDir === 'desc') sortDir = o.sortDir;
					if (typeof o.moreOpen === 'boolean') moreOpen = o.moreOpen;
				}
			} catch {
				/* storage unavailable — defaults are fine */
			}
			return;
		}
		try {
			localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
		} catch {
			/* ignore */
		}
	});

	const activeFilterCount = $derived(
		(listFilter !== 'all' ? 1 : 0) +
			(squadFilter !== 'all' ? 1 : 0) +
			(posFilter ? 1 : 0) +
			(teamFilters.length ? 1 : 0) +
			(priceMin !== PRICE_MIN || priceMax !== PRICE_MAX ? 1 : 0) +
			(availableOnly ? 1 : 0)
	);
	const moreFilterCount = $derived(
		(teamFilters.length ? 1 : 0) + (priceMin !== PRICE_MIN || priceMax !== PRICE_MAX ? 1 : 0)
	);

	function resetFilters() {
		listFilter = 'all';
		squadFilter = 'all';
		posFilter = 0;
		teamFilters = [];
		priceMin = PRICE_MIN;
		priceMax = PRICE_MAX;
		availableOnly = false;
	}

	function toggleTeam(id: number) {
		teamFilters = teamFilters.includes(id)
			? teamFilters.filter((x) => x !== id)
			: [...teamFilters, id];
	}

	// ---------------------------------------------------------------- derived rows
	const watchedRows = $derived(
		data.players.filter((r) => {
			const m = membership(r.player.id);
			return m.permanent || m.round;
		})
	);

	const counts = $derived.by(() => {
		let perm = 0,
			round = 0,
			both = 0,
			squad = 0;
		for (const r of watchedRows) {
			const m = membership(r.player.id);
			if (m.permanent) perm++;
			if (m.round) round++;
			if (m.permanent && m.round) both++;
			if (m.squad) squad++;
		}
		return { perm, round, both, squad, total: watchedRows.length };
	});

	const teamOptions = $derived(
		[
			...new Map(
				watchedRows.map((r) => [
					r.player.teamId,
					{
						id: r.player.teamId,
						name: r.teamName ?? '—',
						logo: r.teamLogo ?? r.player.teamLogoPath
					}
				])
			).values()
		].sort((a, b) => a.name.localeCompare(b.name, 'he'))
	);

	function nextDiff(r: PoolRow): FixtureDifficulty | null {
		const fx = r.upcomingFixtures?.[0];
		return fx ? difficultyFor(fx, r.player.position) : null;
	}
	function runAvg(r: PoolRow): number | null {
		return fixtureRunAverage(r.upcomingFixtures, 5, r.player.position);
	}
	function isUnavailable(r: PoolRow): boolean {
		return r.player.injuredStatus || r.player.expelledStatus || r.player.missingStatus !== 0;
	}

	function passesFilters(r: PoolRow): boolean {
		const m = membership(r.player.id);
		if (!m.permanent && !m.round) return false;
		if (listFilter === 'permanent' && !m.permanent) return false;
		if (listFilter === 'round' && !m.round) return false;
		if (listFilter === 'both' && !(m.permanent && m.round)) return false;
		if (listFilter === 'permOnly' && !(m.permanent && !m.round)) return false;
		if (listFilter === 'roundOnly' && !(m.round && !m.permanent)) return false;
		if (squadFilter === 'in' && !m.squad) return false;
		if (squadFilter === 'out' && m.squad) return false;
		if (posFilter && r.player.position !== posFilter) return false;
		if (teamFilters.length && !teamFilters.includes(r.player.teamId)) return false;
		if (r.player.price < priceMin || r.player.price > priceMax) return false;
		if (availableOnly && isUnavailable(r)) return false;
		return true;
	}

	const sortedRows = $derived(
		watchedRows.filter(passesFilters).sort((a, b) => {
			const dir = sortDir === 'asc' ? 1 : -1;
			let cmp = 0;
			if (sortCol === 'name') cmp = a.player.name.localeCompare(b.player.name, 'he');
			else if (sortCol === 'team') cmp = (a.teamName ?? '').localeCompare(b.teamName ?? '', 'he');
			else if (sortCol === 'position') cmp = a.player.position - b.player.position;
			else if (sortCol === 'price') cmp = a.player.price - b.player.price;
			else if (sortCol === 'points')
				cmp = (seasonPoints(a.player) ?? 0) - (seasonPoints(b.player) ?? 0);
			else if (sortCol === 'lastRound')
				cmp = (lastRoundPoints(a.player) ?? -99) - (lastRoundPoints(b.player) ?? -99);
			else if (sortCol === 'vlfm') cmp = (vlfm(a.player) ?? -1) - (vlfm(b.player) ?? -1);
			else if (sortCol === 'nextDiff') {
				const da = nextDiff(a);
				const db = nextDiff(b);
				cmp = (da ? DIFFICULTY_SCORE[da] : 9) - (db ? DIFFICULTY_SCORE[db] : 9);
			} else if (sortCol === 'runDiff') cmp = (runAvg(a) ?? 99) - (runAvg(b) ?? 99);
			if (cmp !== 0) return cmp * dir;
			return a.player.name.localeCompare(b.player.name, 'he');
		})
	);

	type Group = { key: string; title: string; tone: string; rows: PoolRow[] };

	const groups = $derived.by((): Group[] => {
		const rows = sortedRows;
		if (groupBy === 'none') return rows.length ? [{ key: 'all', title: '', tone: '', rows }] : [];
		if (groupBy === 'position') {
			return POSITION_ORDER.map((pos) => ({
				key: `p${pos}`,
				title: positionLabel(pos),
				tone: 'text-slate-200',
				rows: rows.filter((r) => r.player.position === pos)
			})).filter((g) => g.rows.length);
		}
		if (groupBy === 'team') {
			const map = new Map<number, Group>();
			for (const r of rows) {
				const g = map.get(r.player.teamId) ?? {
					key: `t${r.player.teamId}`,
					title: r.teamName ?? '—',
					tone: 'text-slate-200',
					rows: []
				};
				g.rows.push(r);
				map.set(r.player.teamId, g);
			}
			return [...map.values()].sort((a, b) => a.title.localeCompare(b.title, 'he'));
		}
		const both: PoolRow[] = [];
		const permOnly: PoolRow[] = [];
		const roundOnly: PoolRow[] = [];
		for (const r of rows) {
			const m = membership(r.player.id);
			if (m.permanent && m.round) both.push(r);
			else if (m.permanent) permOnly.push(r);
			else roundOnly.push(r);
		}
		return [
			{ key: 'both', title: `בשתי הרשימות`, tone: 'text-violet-200', rows: both },
			{ key: 'perm', title: 'קבוע בלבד', tone: 'text-emerald-300', rows: permOnly },
			{ key: 'round', title: `מחזור ${data.currentGw} בלבד`, tone: 'text-sky-300', rows: roundOnly }
		].filter((g) => g.rows.length);
	});

	function toggleSort(col: SortCol) {
		if (sortCol === col) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
		else {
			sortCol = col;
			sortDir = col === 'name' || col === 'team' || col === 'position' || col === 'nextDiff' || col === 'runDiff' ? 'asc' : 'desc';
		}
	}
	function sortMark(col: SortCol) {
		if (sortCol !== col) return '';
		return sortDir === 'asc' ? ' ↑' : ' ↓';
	}

	const SORT_OPTIONS: { value: SortCol; label: string }[] = [
		{ value: 'points', label: 'נקודות עונה' },
		{ value: 'lastRound', label: 'מחזור אחרון' },
		{ value: 'price', label: 'מחיר' },
		{ value: 'vlfm', label: 'vlfm' },
		{ value: 'nextDiff', label: 'יריבה קרובה' },
		{ value: 'runDiff', label: 'לוח 5 משחקים' },
		{ value: 'name', label: 'שם' },
		{ value: 'team', label: 'קבוצה' },
		{ value: 'position', label: 'עמדה' }
	];

	// ---------------------------------------------------------------- actions
	type Notice = { text: string; tone: 'ok' | 'warn' | 'err'; undo?: () => void; showAll?: boolean };
	let notice = $state<Notice | null>(null);
	let noticeTimer: ReturnType<typeof setTimeout> | undefined;
	function setNotice(n: Notice) {
		notice = n;
		clearTimeout(noticeTimer);
		noticeTimer = setTimeout(() => (notice = null), 7000);
	}

	let flashId = $state<number | null>(null);
	let flashTimer: ReturnType<typeof setTimeout> | undefined;
	function flash(id: number) {
		flashId = id;
		clearTimeout(flashTimer);
		flashTimer = setTimeout(() => (flashId = null), 2500);
	}

	const LIST_NAME = (list: WatchList) =>
		list === 'permanent' ? 'המעקב הקבוע' : `רשימת מחזור ${data.currentGw}`;

	async function toggle(playerId: number, list: WatchList) {
		if (pending[playerId]) return;
		const before = membership(playerId);
		const wasIn = list === 'permanent' ? before.permanent : before.round;
		const action = `${wasIn ? 'remove' : 'add'}${list === 'permanent' ? 'Permanent' : 'Round'}`;
		const key = `${list}:${playerId}`;
		const name = byId.get(playerId)?.player.name ?? 'השחקן';

		pending[playerId] = list;
		overrides[key] = !wasIn;
		try {
			const fd = new FormData();
			fd.set('playerId', String(playerId));
			const res = await fetch(`?/${action}`, {
				method: 'POST',
				body: fd,
				headers: { 'x-sveltekit-action': 'true', accept: 'application/json' }
			});
			const result = deserialize(await res.text());
			if (result.type !== 'success') throw new Error(action);
			await invalidateAll();
		} catch {
			delete overrides[key];
			delete pending[playerId];
			setNotice({ text: `שגיאה בעדכון ${name} — נסו שוב`, tone: 'err' });
			return;
		}
		delete overrides[key];
		delete pending[playerId];

		const after = membership(playerId);
		const undo = () => toggle(playerId, list);
		if (!wasIn) {
			const row = byId.get(playerId);
			const hidden = row ? !passesFilters(row) : false;
			flash(playerId);
			setNotice({
				text: `✓ ${name} נוסף ל${LIST_NAME(list)}${hidden ? ' — מוסתר כרגע בגלל הפילטרים' : ''}`,
				tone: hidden ? 'warn' : 'ok',
				undo,
				showAll: hidden
			});
		} else {
			const gone = !after.permanent && !after.round;
			setNotice({
				text: `${name} הוסר מ${LIST_NAME(list)}${gone ? ' (כבר לא במעקב בכלל)' : ''}`,
				tone: 'ok',
				undo
			});
		}
	}

	async function locate(playerId: number) {
		const row = byId.get(playerId);
		if (row && !passesFilters(row)) resetFilters();
		await tick();
		document
			.getElementById(`wl-${playerId}`)
			?.scrollIntoView({ block: 'center', behavior: 'smooth' });
		flash(playerId);
	}

	let expandedId = $state<number | null>(null);

	const COLS = 10;
	const seg = (on: boolean, tone = 'bg-emerald-500/25 text-emerald-200') =>
		`rounded-lg px-2.5 py-1 text-xs whitespace-nowrap ${on ? tone : 'bg-slate-800 text-slate-300 hover:text-white'}`;
</script>

<section class="space-y-4">
	<!-- Header: title + compact search -->
	<div class="flex flex-wrap items-start justify-between gap-3">
		<div class="min-w-0">
			<h1 class="text-2xl font-bold">מעקב</h1>
			<div class="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
				<span class="rounded-full bg-emerald-500/15 px-2 py-0.5 text-emerald-200"
					>קבוע · {counts.perm}</span
				>
				<span class="rounded-full bg-sky-500/15 px-2 py-0.5 text-sky-200"
					>מחזור {data.currentGw} · {counts.round}</span
				>
				<span class="rounded-full bg-violet-500/15 px-2 py-0.5 text-violet-200"
					>בשתיהן · {counts.both}</span
				>
				<span class="rounded-full bg-amber-500/15 px-2 py-0.5 text-amber-200"
					>בסגל שלי · {counts.squad}</span
				>
			</div>
			<p class="mt-1.5 text-xs text-slate-500">
				רשימת המחזור היא המאגר שממנו השיטות ב־<a href="/strategies" class="text-sky-300 underline"
					>אסטרטגיות</a
				> מכניסות שחקנים (שם גם ההרכבים המוצעים ומי חייב לצאת / להיכנס).
			</p>
		</div>
		<WatchSearch
			players={data.players}
			currentGw={data.currentGw}
			{membership}
			{pendingFor}
			onToggle={toggle}
			onLocate={locate}
		/>
	</div>

	{#if notice}
		<div
			class="flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2 text-sm {notice.tone ===
			'err'
				? 'border-red-500/40 bg-red-500/10 text-red-200'
				: notice.tone === 'warn'
					? 'border-amber-500/40 bg-amber-500/10 text-amber-100'
					: 'border-slate-700 bg-slate-900 text-slate-200'}"
			role="status"
		>
			<span class="flex-1">{notice.text}</span>
			{#if notice.showAll}
				<button
					type="button"
					class="rounded-lg bg-slate-800 px-2 py-0.5 text-xs hover:bg-slate-700"
					onclick={() => {
						resetFilters();
						notice = null;
					}}>נקה פילטרים</button
				>
			{/if}
			{#if notice.undo}
				{@const undo = notice.undo}
				<button
					type="button"
					class="rounded-lg bg-slate-800 px-2 py-0.5 text-xs hover:bg-slate-700"
					onclick={() => {
						notice = null;
						undo();
					}}>בטל</button
				>
			{/if}
			<button
				type="button"
				class="text-slate-400 hover:text-white"
				aria-label="סגור"
				onclick={() => (notice = null)}>×</button
			>
		</div>
	{/if}

	<!-- Filters / group / sort -->
	<div class="space-y-2.5 rounded-2xl border border-slate-800 bg-slate-900/40 p-3">
		<div class="flex flex-wrap items-center gap-x-4 gap-y-2">
			<div class="flex flex-wrap items-center gap-1" role="group" aria-label="רשימה">
				<button type="button" class={seg(listFilter === 'all')} onclick={() => (listFilter = 'all')}
					>כל המעקב</button
				>
				<button
					type="button"
					class={seg(listFilter === 'permanent')}
					onclick={() => (listFilter = 'permanent')}>קבוע</button
				>
				<button
					type="button"
					class={seg(listFilter === 'round', 'bg-sky-500/25 text-sky-200')}
					onclick={() => (listFilter = 'round')}>מחזור {data.currentGw}</button
				>
				<button
					type="button"
					class={seg(listFilter === 'both', 'bg-violet-500/25 text-violet-200')}
					onclick={() => (listFilter = 'both')}>בשתיהן</button
				>
				<button
					type="button"
					class={seg(listFilter === 'permOnly')}
					title="במעקב הקבוע אבל עוד לא ברשימת המחזור"
					onclick={() => (listFilter = 'permOnly')}>קבוע, לא במחזור</button
				>
				<button
					type="button"
					class={seg(listFilter === 'roundOnly', 'bg-sky-500/25 text-sky-200')}
					onclick={() => (listFilter = 'roundOnly')}>מחזור בלבד</button
				>
			</div>

			<div class="flex flex-wrap items-center gap-1" role="group" aria-label="עמדה">
				<button type="button" class={seg(posFilter === 0)} onclick={() => (posFilter = 0)}
					>כל העמדות</button
				>
				{#each POSITION_ORDER as pos}
					<button type="button" class={seg(posFilter === pos)} onclick={() => (posFilter = pos)}
						>{positionLabel(pos)}</button
					>
				{/each}
			</div>
		</div>

		<div class="flex flex-wrap items-center gap-x-4 gap-y-2">
			<div class="flex flex-wrap items-center gap-1" role="group" aria-label="סגל">
				<button type="button" class={seg(squadFilter === 'all')} onclick={() => (squadFilter = 'all')}
					>כולם</button
				>
				<button
					type="button"
					class={seg(squadFilter === 'out', 'bg-amber-500/25 text-amber-200')}
					title="מועמדים להכנסה — מי שעוד לא בסגל"
					onclick={() => (squadFilter = 'out')}>לא בסגל</button
				>
				<button
					type="button"
					class={seg(squadFilter === 'in', 'bg-amber-500/25 text-amber-200')}
					onclick={() => (squadFilter = 'in')}>בסגל שלי</button
				>
			</div>

			<label class="flex cursor-pointer items-center gap-1.5 text-xs text-slate-300">
				<input type="checkbox" bind:checked={availableOnly} class="accent-emerald-500" />
				זמינים בלבד
				<span class="text-slate-500">(בלי פצועים / מורחקים / נעדרים)</span>
			</label>

			<button
				type="button"
				class={seg(moreOpen || moreFilterCount > 0, 'bg-slate-700 text-slate-100')}
				aria-expanded={moreOpen}
				onclick={() => (moreOpen = !moreOpen)}
			>
				קבוצה ומחיר{moreFilterCount ? ` (${moreFilterCount})` : ''}
				{moreOpen ? '▴' : '▾'}
			</button>

			<div class="flex flex-wrap items-center gap-2 text-xs sm:ms-auto">
				<label class="flex items-center gap-1 text-slate-400">
					קיבוץ
					<select
						bind:value={groupBy}
						class="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-200"
					>
						<option value="position">עמדה</option>
						<option value="team">קבוצה</option>
						<option value="list">רשימה</option>
						<option value="none">ללא</option>
					</select>
				</label>
				<label class="flex items-center gap-1 text-slate-400">
					מיון
					<select
						bind:value={sortCol}
						class="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-200"
					>
						{#each SORT_OPTIONS as o}
							<option value={o.value}>{o.label}</option>
						{/each}
					</select>
				</label>
				<button
					type="button"
					class="rounded-lg bg-slate-800 px-2 py-1 text-slate-300 hover:text-white"
					title={sortDir === 'asc' ? 'עולה' : 'יורד'}
					onclick={() => (sortDir = sortDir === 'asc' ? 'desc' : 'asc')}
					>{sortDir === 'asc' ? '↑ עולה' : '↓ יורד'}</button
				>
				{#if activeFilterCount}
					<button type="button" class="text-emerald-300 hover:underline" onclick={resetFilters}
						>נקה פילטרים ({activeFilterCount})</button
					>
				{/if}
			</div>
		</div>

		{#if moreOpen}
			<div class="flex flex-wrap items-start gap-3 border-t border-slate-800 pt-2.5">
				<div class="min-w-0 flex-1 basis-80">
					<div class="mb-1.5 flex items-center gap-2 text-xs text-slate-400">
						<span>קבוצות (מתוך המעקב)</span>
						{#if teamFilters.length}
							<button type="button" class="text-emerald-300" onclick={() => (teamFilters = [])}
								>נקה</button
							>
						{/if}
					</div>
					<div class="flex flex-wrap gap-1.5">
						{#each teamOptions as team (team.id)}
							<button
								type="button"
								class="flex items-center gap-1.5 rounded-full py-0.5 pl-2.5 pr-0.5 text-[11px] {teamFilters.includes(
									team.id
								)
									? 'bg-sky-500/30 text-sky-100 ring-2 ring-sky-400'
									: 'bg-slate-800 text-slate-300 ring-1 ring-slate-700'}"
								onclick={() => toggleTeam(team.id)}
								title={team.name}
							>
								<span
									class="flex h-5 w-5 items-center justify-center overflow-hidden rounded-full bg-white"
								>
									{#if team.logo}<img src={team.logo} alt="" class="h-4 w-4 object-contain" />{/if}
								</span>
								<span class="max-w-[7rem] truncate">{team.name}</span>
							</button>
						{/each}
					</div>
				</div>
				<div class="w-full sm:w-64">
					<PriceRangeSlider
						bind:minValue={priceMin}
						bind:maxValue={priceMax}
						min={PRICE_MIN}
						max={PRICE_MAX}
					/>
				</div>
			</div>
		{/if}
	</div>

	<!-- Watchlist table -->
	{#if counts.total === 0}
		<div class="rounded-2xl border border-dashed border-slate-700 p-8 text-center text-sm text-slate-400">
			אין עדיין שחקנים במעקב. חפשו שחקן בתיבת החיפוש למעלה והוסיפו אותו ל<span
				class="text-emerald-300">קבוע</span
			>
			או ל<span class="text-sky-300">מחזור {data.currentGw}</span>.
		</div>
	{:else}
		<p class="text-xs text-slate-500">
			{sortedRows.length} מתוך {counts.total} שחקנים במעקב · לחיצה על שם = פירוט נקודות
		</p>
		<!-- No inner vertical scroll: the page scrolls. Phones keep a sideways scroll for the wide table;
		     on lg+ the header sticks under the sticky nav (59px tall there). -->
		<div class="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/40 lg:overflow-visible">
			<table class="w-full min-w-[60rem] border-collapse text-right text-xs">
				<thead class="z-10 bg-slate-900 text-slate-300 shadow lg:sticky lg:top-[59px]">
					<tr>
						<th class="p-2 font-medium">
							<button type="button" class="hover:text-white" onclick={() => toggleSort('name')}
								>שחקן{sortMark('name')}</button
							>
						</th>
						<th class="p-2 font-medium">רשימות</th>
						<th class="p-2 text-center font-medium">
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
								>נק׳ עונה{sortMark('points')}</button
							>
						</th>
						<th class="p-2 font-medium">
							<button
								type="button"
								class="hover:text-white"
								onclick={() => toggleSort('lastRound')}>מחזור אחרון{sortMark('lastRound')}</button
							>
						</th>
						<th class="p-2 font-medium" title="נקודות עונה למיליון">
							<button type="button" class="hover:text-white" onclick={() => toggleSort('vlfm')}
								>vlfm{sortMark('vlfm')}</button
							>
						</th>
						<th class="p-2 font-medium" title="היריבה במשחק הקרוב">
							<button type="button" class="hover:text-white" onclick={() => toggleSort('nextDiff')}
								>יריבה{sortMark('nextDiff')}</button
							>
						</th>
						<th class="p-2 font-medium" title="ממוצע קושי 5 המשחקים הקרובים">
							<button type="button" class="hover:text-white" onclick={() => toggleSort('runDiff')}
								>לוח (5){sortMark('runDiff')}</button
							>
						</th>
					</tr>
				</thead>
				<tbody>
					{#each groups as g (g.key)}
						{#if g.title}
							<tr class="bg-slate-900/80">
								<td colspan={COLS} class="px-2 py-1.5 font-semibold {g.tone}">
									{g.title}
									<span class="font-normal text-slate-500">· {g.rows.length}</span>
								</td>
							</tr>
						{/if}
						{#each g.rows as r (r.player.id)}
							{@const m = membership(r.player.id)}
							{@const nd = nextDiff(r)}
							{@const avg = runAvg(r)}
							{@const bucket = fixtureRunBucket(avg)}
							{@const lr = lastRoundPoints(r.player)}
							<tr
								id="wl-{r.player.id}"
								class="border-t border-slate-800/80 transition-colors hover:bg-slate-800/40 {flashId ===
								r.player.id
									? 'bg-amber-400/15'
									: m.squad
										? 'bg-amber-500/[0.04]'
										: ''} {expandedId === r.player.id ? 'bg-slate-800/60' : ''}"
							>
								<td class="max-w-[13rem] p-2">
									<div class="flex items-center gap-1.5">
										<button
											type="button"
											class="truncate text-right text-[13px] font-medium hover:underline"
											title="{r.player.name} · פירוט נקודות"
											onclick={() =>
												(expandedId = expandedId === r.player.id ? null : r.player.id)}
										>
											{r.player.name}
										</button>
										{#if m.squad}
											<span
												class="shrink-0 rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-medium text-amber-200"
												title={m.squad === 'xi' ? 'בהרכב שלי' : 'בספסל שלי'}
												>{m.squad === 'xi' ? 'בהרכב' : 'בספסל'}</span
											>
										{/if}
										{#if r.player.injuredStatus}<span title="פצוע">🤕</span>{/if}
										{#if r.player.expelledStatus}<span title="מורחק">🟥</span>{/if}
										{#if r.player.missingStatus === 1}
											<span
												class="shrink-0 rounded bg-yellow-500/20 px-1 py-0.5 text-[10px] text-yellow-200"
												>נעדר</span
											>
										{:else if r.player.missingStatus === 2}
											<span
												class="shrink-0 rounded bg-slate-700 px-1 py-0.5 text-[10px] text-slate-300"
												title="לא פעיל העונה">לא פעיל</span
											>
										{/if}
									</div>
								</td>
								<td class="p-2">
									<MembershipToggles
										permanent={m.permanent}
										round={m.round}
										currentGw={data.currentGw}
										pending={pendingFor(r.player.id)}
										onToggle={(list) => toggle(r.player.id, list)}
									/>
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
										{/if}
									</span>
								</td>
								<td class="whitespace-nowrap p-2 text-slate-400">{positionLabel(r.player.position)}</td>
								<td class="whitespace-nowrap p-2 tabular-nums">{formatPrice(r.player.price)}</td>
								<td class="whitespace-nowrap p-2 tabular-nums text-sky-200"
									>{seasonPoints(r.player) ?? 0}</td
								>
								<td class="whitespace-nowrap p-2 tabular-nums text-slate-300">{lr ?? '—'}</td>
								<td class="whitespace-nowrap p-2 tabular-nums text-violet-200"
									>{formatVlfm(vlfm(r.player))}</td
								>
								<td class="p-2">
									{#if r.upcomingFixtures?.[0]}
										<div class="flex items-center gap-1.5">
											<FixtureStrip fixtures={[r.upcomingFixtures[0]]} slots={1} position={r.player.position} />
											{#if nd}
												<span class="rounded px-1 py-0.5 text-[10px] {DIFFICULTY_BG[nd]}"
													>{DIFFICULTY_LABEL[nd]}</span
												>
											{/if}
										</div>
									{:else}
										<span class="text-slate-600">—</span>
									{/if}
								</td>
								<td class="p-2">
									<div class="flex items-center justify-end gap-2">
										{#if bucket}
											<span
												class="whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-medium {DIFFICULTY_BG[
													bucket
												]}"
												title="ממוצע קושי 5 משחקים: {formatFixtureRun(avg)} (1 קל – 3 קשה)"
											>
												{DIFFICULTY_LABEL[bucket]}
												<span class="opacity-70">({formatFixtureRun(avg)})</span>
											</span>
										{/if}
										<FixtureStrip fixtures={r.upcomingFixtures ?? []} slots={5} position={r.player.position} />
									</div>
								</td>
							</tr>
							{#if expandedId === r.player.id}
								<tr class="bg-slate-900/60">
									<td colspan={COLS} class="p-3">
										<PlayerStatsPanel
											lines={playerStatLines(r.player)}
											roundPoints={lr}
											seasonPts={seasonPoints(r.player)}
										/>
									</td>
								</tr>
							{/if}
						{/each}
					{:else}
						<tr>
							<td colspan={COLS} class="p-6 text-center text-slate-500">
								אין שחקנים תואמים לפילטרים ·
								<button type="button" class="text-emerald-300 hover:underline" onclick={resetFilters}
									>נקה פילטרים</button
								>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</section>
