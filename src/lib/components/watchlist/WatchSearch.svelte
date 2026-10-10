<script lang="ts">
	import { formatPrice } from '$lib/format';
	import { positionLabel } from '$lib/positions';
	import { seasonPoints } from '$lib/stats';
	import MembershipToggles from './MembershipToggles.svelte';
	import { normalizeSearch, type Membership, type PoolRow, type WatchList } from './watchlist';

	type Props = {
		players: PoolRow[];
		currentGw: number;
		membership: (playerId: number) => Membership;
		pendingFor: (playerId: number) => WatchList | null;
		onToggle: (playerId: number, list: WatchList) => void;
		/** Scroll to the player's row in the watchlist table. */
		onLocate: (playerId: number) => void;
	};

	let { players, currentGw, membership, pendingFor, onToggle, onLocate }: Props = $props();

	const LIMIT = 12;
	let q = $state('');
	let open = $state(false);
	let wrap: HTMLDivElement | undefined = $state();
	let input: HTMLInputElement | undefined = $state();

	const norm = $derived(normalizeSearch(q));

	const results = $derived.by(() => {
		if (!norm) return { rows: [] as PoolRow[], total: 0 };
		const scored: { r: PoolRow; score: number; pts: number }[] = [];
		for (const r of players) {
			const name = normalizeSearch(r.player.name);
			let score = -1;
			if (name.startsWith(norm)) score = 0;
			else if (name.split(/\s+/).some((w) => w.startsWith(norm))) score = 1;
			else if (name.includes(norm)) score = 2;
			else if (normalizeSearch(r.teamName ?? '').includes(norm)) score = 3;
			if (score < 0) continue;
			scored.push({ r, score, pts: seasonPoints(r.player) ?? 0 });
		}
		scored.sort((a, b) => a.score - b.score || b.pts - a.pts);
		return { rows: scored.slice(0, LIMIT).map((s) => s.r), total: scored.length };
	});

	function onWindowClick(e: MouseEvent) {
		if (open && wrap && !wrap.contains(e.target as Node)) open = false;
	}

	function onWindowKey(e: KeyboardEvent) {
		// "/" focuses the search from anywhere (unless already typing somewhere).
		const t = e.target as HTMLElement | null;
		const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
		if (e.key === '/' && !typing) {
			e.preventDefault();
			input?.focus();
		}
	}
</script>

<svelte:window onclick={onWindowClick} onkeydown={onWindowKey} />

<div class="relative w-full sm:w-80" bind:this={wrap}>
	<div class="relative">
		<span class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-500"
			>⌕</span
		>
		<input
			bind:this={input}
			bind:value={q}
			type="search"
			placeholder="חיפוש שחקן להוספה…  ( / )"
			aria-label="חיפוש שחקן להוספה למעקב"
			autocomplete="off"
			class="w-full rounded-xl border border-slate-700 bg-slate-900 py-1.5 pl-8 pr-8 text-sm placeholder:text-slate-500 focus:border-sky-500 focus:outline-none"
			onfocus={() => (open = true)}
			oninput={() => (open = true)}
			onkeydown={(e) => {
				if (e.key === 'Escape') {
					if (q) q = '';
					else input?.blur();
					open = false;
				}
			}}
		/>
		{#if q}
			<button
				type="button"
				onclick={() => {
					q = '';
					input?.focus();
				}}
				aria-label="נקה חיפוש"
				class="absolute left-2 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full bg-slate-800 text-xs text-slate-300 hover:bg-slate-700 hover:text-white"
				>×</button
			>
		{/if}
	</div>

	{#if open && norm}
		<div
			class="absolute left-0 top-full z-50 mt-1 w-[min(34rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-slate-700 bg-slate-950 shadow-2xl"
			role="listbox"
			aria-label="תוצאות חיפוש"
		>
			<div class="border-b border-slate-800 px-3 py-1.5 text-[11px] text-slate-500">
				✓ = כבר ברשימה (לחיצה מסירה) · + = הוספה
			</div>
			<ul class="max-h-[60vh] divide-y divide-slate-800/80 overflow-y-auto">
				{#each results.rows as r (r.player.id)}
					{@const m = membership(r.player.id)}
					{@const watched = m.permanent || m.round}
					<li
						class="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2 {watched
							? 'bg-slate-900/70'
							: ''}"
					>
						<span
							class="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white"
						>
							{#if r.teamLogo ?? r.player.teamLogoPath}
								<img src={r.teamLogo ?? r.player.teamLogoPath} alt="" class="h-5 w-5 object-contain" />
							{/if}
						</span>
						<div class="min-w-0 flex-1">
							<div class="flex items-center gap-1.5">
								<span class="truncate text-sm font-medium">{r.player.name}</span>
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
									<span class="text-[10px] text-yellow-300">נעדר</span>
								{/if}
							</div>
							<div class="truncate text-[11px] text-slate-400">
								{positionLabel(r.player.position)} · {r.teamName ?? '—'} · {formatPrice(r.player.price)} ·
								{seasonPoints(r.player) ?? 0} נק׳
							</div>
						</div>
						<div class="flex items-center gap-2">
							{#if watched}
								<button
									type="button"
									class="text-[11px] text-slate-400 underline-offset-2 hover:text-white hover:underline"
									title="הצג את השחקן בטבלת המעקב"
									onclick={() => {
										open = false;
										onLocate(r.player.id);
									}}>הצג ↓</button
								>
							{/if}
							<MembershipToggles
								permanent={m.permanent}
								round={m.round}
								{currentGw}
								pending={pendingFor(r.player.id)}
								onToggle={(list) => onToggle(r.player.id, list)}
							/>
						</div>
					</li>
				{:else}
					<li class="px-3 py-4 text-center text-sm text-slate-500">לא נמצאו שחקנים</li>
				{/each}
			</ul>
			{#if results.total > LIMIT}
				<div class="border-t border-slate-800 px-3 py-1.5 text-[11px] text-slate-500">
					מוצגים {LIMIT} מתוך {results.total} — המשיכו להקליד כדי לצמצם
				</div>
			{/if}
		</div>
	{/if}
</div>
