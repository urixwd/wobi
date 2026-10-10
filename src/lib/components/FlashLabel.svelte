<script lang="ts">
	/** Button label that cross-fades to ✓ while `done` (both stacked, so the width never jumps). */
	let { label, done = false }: { label: string; done?: boolean } = $props();
</script>

<span class="inline-grid place-items-center">
	<span
		class="col-start-1 row-start-1 transition-opacity duration-300 {done ? 'opacity-0' : 'opacity-100'}"
		aria-hidden={done}>{label}</span
	>
	<span
		class="col-start-1 row-start-1 text-base leading-none transition-opacity duration-300 {done
			? 'opacity-100'
			: 'opacity-0'}"
		aria-hidden={!done}>✓</span
	>
	{#if done}<span class="sr-only" role="status">נשמר</span>{/if}
</span>
