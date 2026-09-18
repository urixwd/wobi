<script lang="ts">
	import { page } from '$app/stores';

	/** RTL: first = right, last = leftmost */
	const links = [
		{ href: '/squad', label: 'הקבוצה שלי' },
		{ href: '/sketches', label: 'סקיצות' },
		{ href: '/watchlist', label: 'מעקב' },
		{ href: '/options', label: 'אפשרויות קבוצה' },
		{ href: '/strategies', label: 'אסטרטגיות' }
	];

	function isActive(pathname: string, href: string) {
		return pathname === href || (href !== '/' && pathname.startsWith(href + '/'));
	}
</script>

<header class="sticky top-0 z-40 border-b border-slate-800 bg-slate-900/90 backdrop-blur">
	<div class="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
		<a href="/" class="text-lg font-bold tracking-tight text-emerald-400">WOBI</a>
		<nav class="flex flex-wrap gap-2">
			{#each links as link}
				{@const active = isActive($page.url.pathname, link.href)}
				<a
					href={link.href}
					aria-current={active ? 'page' : undefined}
					class="inline-flex items-center rounded-lg px-3 py-1.5 text-sm font-bold no-underline transition"
					style={active
						? 'background:#064e3b;color:#a7f3d0;border:1px solid #34d399;opacity:1;cursor:pointer'
						: 'background:#334155;color:#ffffff;border:1px solid #94a3b8;opacity:1;cursor:pointer'}
				>
					{link.label}
				</a>
			{/each}
		</nav>
	</div>
</header>
