<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import Nav from '$lib/components/Nav.svelte';
	import { page } from '$app/stores';

	let { children } = $props();

	const under = (r: string) => $page.url.pathname === r || $page.url.pathname.startsWith(`${r}/`);
	// /squad: edge to edge. /strategies: wide, but with breathing room on the sides.
	const fullWidth = $derived(under('/squad'));
	const wide = $derived(under('/strategies'));
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>WOBI — עזר לחילופים Dream Team</title>
</svelte:head>

<Nav />
<main
	class="py-6 {fullWidth
		? 'w-full max-w-none px-4'
		: wide
			? 'mx-auto max-w-[112rem] px-4 sm:px-8 lg:px-12'
			: 'mx-auto max-w-6xl px-4'}"
>
	{@render children()}
</main>
