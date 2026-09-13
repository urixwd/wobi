<script lang="ts">
	type Props = {
		min?: number;
		max?: number;
		minValue: number;
		maxValue: number;
	};

	let { min = 3, max = 15, minValue = $bindable(), maxValue = $bindable() }: Props = $props();

	const span = $derived(Math.max(1, max - min));

	function pct(v: number) {
		return ((v - min) / span) * 100;
	}

	const leftPct = $derived(pct(minValue));
	const widthPct = $derived(Math.max(0, pct(maxValue) - pct(minValue)));
	/** Keep the active/near-max thumb on top so it stays grabable */
	const minOnTop = $derived(minValue > max - span * 0.35);

	function onMinInput(e: Event) {
		const v = Number((e.currentTarget as HTMLInputElement).value);
		minValue = Math.min(v, maxValue);
	}

	function onMaxInput(e: Event) {
		const v = Number((e.currentTarget as HTMLInputElement).value);
		maxValue = Math.max(v, minValue);
	}
</script>

<div class="rounded-xl border border-slate-800 bg-slate-950/50 px-3 py-3 text-xs text-slate-300">
	<div class="mb-2 flex items-center justify-between font-medium">
		<span>מחיר</span>
		<span class="tabular-nums text-sky-200">{minValue} – {maxValue}</span>
	</div>

	<!-- Force LTR: low left, high right — independent of page RTL -->
	<div class="relative mx-1 h-8" dir="ltr">
		<div class="absolute top-1/2 h-1.5 w-full -translate-y-1/2 rounded-full bg-slate-700"></div>
		<div
			class="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-emerald-400"
			style="left: {leftPct}%; width: {widthPct}%"
		></div>

		<input
			type="range"
			{min}
			{max}
			step="1"
			value={minValue}
			oninput={onMinInput}
			aria-label="מחיר מינימום"
			class="price-thumb absolute inset-0 m-0 h-8 w-full appearance-none bg-transparent"
			style="z-index: {minOnTop ? 40 : 20}"
		/>
		<input
			type="range"
			{min}
			{max}
			step="1"
			value={maxValue}
			oninput={onMaxInput}
			aria-label="מחיר מקסימום"
			class="price-thumb absolute inset-0 m-0 h-8 w-full appearance-none bg-transparent"
			style="z-index: {minOnTop ? 20 : 40}"
		/>
	</div>

	<div class="mt-0.5 flex justify-between text-[10px] text-slate-500" dir="ltr">
		<span>{min}</span>
		<span>{max}</span>
	</div>
</div>

<style>
	.price-thumb {
		pointer-events: none;
	}
	.price-thumb::-webkit-slider-thumb {
		pointer-events: auto;
		-webkit-appearance: none;
		appearance: none;
		height: 1.15rem;
		width: 1.15rem;
		border-radius: 9999px;
		background: #34d399;
		border: 2px solid #0f172a;
		cursor: grab;
		position: relative;
	}
	.price-thumb::-moz-range-thumb {
		pointer-events: auto;
		height: 1.15rem;
		width: 1.15rem;
		border-radius: 9999px;
		background: #34d399;
		border: 2px solid #0f172a;
		cursor: grab;
	}
	.price-thumb::-webkit-slider-runnable-track {
		background: transparent;
		height: 0.375rem;
	}
	.price-thumb::-moz-range-track {
		background: transparent;
		height: 0.375rem;
		border: none;
	}
	.price-thumb::-moz-range-progress {
		background: transparent;
	}
</style>
