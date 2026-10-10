<script lang="ts">
	import type { WatchList } from './watchlist';

	type Props = {
		permanent: boolean;
		round: boolean;
		currentGw: number;
		/** Which list (if any) has a request in flight for this player. */
		pending?: WatchList | null;
		onToggle: (list: WatchList) => void;
	};

	let { permanent, round, currentGw, pending = null, onToggle }: Props = $props();

	const base =
		'inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium transition disabled:cursor-wait disabled:opacity-50';
</script>

<div class="flex flex-nowrap items-center gap-1">
	<button
		type="button"
		class="{base} {permanent
			? 'bg-emerald-500/25 text-emerald-200 ring-1 ring-emerald-400/60 hover:bg-red-500/20 hover:text-red-200 hover:ring-red-400/60'
			: 'border border-dashed border-slate-600 text-slate-400 hover:border-emerald-400 hover:text-emerald-300'}"
		title={permanent ? 'במעקב הקבוע · לחיצה = הסרה' : 'הוספה למעקב הקבוע'}
		aria-pressed={permanent}
		disabled={pending === 'permanent'}
		onclick={(e) => {
			e.stopPropagation();
			onToggle('permanent');
		}}
	>
		{permanent ? '✓' : '+'} קבוע
	</button>
	<button
		type="button"
		class="{base} {round
			? 'bg-sky-500/25 text-sky-200 ring-1 ring-sky-400/60 hover:bg-red-500/20 hover:text-red-200 hover:ring-red-400/60'
			: 'border border-dashed border-slate-600 text-slate-400 hover:border-sky-400 hover:text-sky-300'}"
		title={round
			? `ברשימת מחזור ${currentGw} · לחיצה = הסרה`
			: `הוספה לרשימת מחזור ${currentGw} (המאגר של האסטרטגיות)`}
		aria-pressed={round}
		disabled={pending === 'round'}
		onclick={(e) => {
			e.stopPropagation();
			onToggle('round');
		}}
	>
		{round ? '✓' : '+'} מחזור {currentGw}
	</button>
</div>
