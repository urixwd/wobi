<script lang="ts">
	import { page } from '$app/stores';

	const links = [
		{ href: '/squad', label: 'הקבוצה שלי' },
		{ href: '/watchlist', label: 'מעקב' },
		{ href: '/gameweek', label: 'מחזור' },
		{ href: '/transfers', label: 'הצעות חילופים' }
	];
</script>

<header class="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-40">
	<div class="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
		<a href="/" class="text-lg font-bold tracking-tight text-emerald-400">WOBI</a>
		<nav class="flex flex-wrap gap-1">
			{#each links as link}
				<a
					href={link.href}
					class="rounded-lg px-3 py-1.5 text-sm transition
						{$page.url.pathname === link.href
						? 'bg-emerald-500/20 text-emerald-300'
						: 'text-slate-300 hover:bg-slate-800 hover:text-white'}"
				>
					{link.label}
				</a>
			{/each}
		</nav>
	</div>
</header>
