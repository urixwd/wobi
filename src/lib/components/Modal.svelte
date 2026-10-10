<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = {
		open: boolean;
		title: string;
		onclose: () => void;
		children: Snippet;
	};
	let { open, title, onclose, children }: Props = $props();
</script>

<svelte:window onkeydown={(e) => open && e.key === 'Escape' && onclose()} />

{#if open}
	<div
		class="fixed inset-0 z-[300] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
		role="presentation"
		onclick={(e) => e.target === e.currentTarget && onclose()}
	>
		<div
			class="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-4 text-right shadow-2xl"
			role="dialog"
			aria-modal="true"
			aria-label={title}
			dir="rtl"
		>
			<div class="mb-3 flex items-center justify-between gap-2">
				<h2 class="text-base font-semibold text-slate-100">{title}</h2>
				<button
					type="button"
					class="rounded-md px-2 text-lg text-slate-400 hover:bg-slate-800 hover:text-white"
					aria-label="סגור"
					onclick={onclose}>×</button
				>
			</div>
			{@render children()}
		</div>
	</div>
{/if}
