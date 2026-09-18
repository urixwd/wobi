<script lang="ts">
	import { page } from '$app/stores';

	/** RTL: first = right, last = leftmost */
	const links = [
		{ href: '/squad', label: 'הקבוצה שלי' },
		{ href: '/sketches', label: 'סקיצות' },
		{ href: '/watchlist', label: 'מעקב' },
		/** Visual only — still clickable */
		{ href: '/options', label: 'אפשרויות קבוצה', looksDisabled: true },
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
				{@const muted = Boolean(link.looksDisabled) && !active}
				<a
					href={link.href}
					aria-current={active ? 'page' : undefined}
					title={link.looksDisabled ? 'זמין ללחיצה (נראה כבוי)' : undefined}
					class="inline-flex items-center rounded-lg px-3 py-1.5 text-sm font-bold no-underline transition"
					style={active
						? 'background:#064e3b;color:#a7f3d0;border:1px solid #34d399;opacity:1;cursor:pointer'
						: muted
							? 'background:#1e293b;color:#64748b;border:1px solid #334155;opacity:0.55;cursor:pointer'
							: 'background:#334155;color:#ffffff;border:1px solid #94a3b8;opacity:1;cursor:pointer'}
				>
					{link.label}
				</a>
			{/each}
		</nav>
	</div>
</header>
