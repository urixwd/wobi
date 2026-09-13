<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import Nav from '$lib/components/Nav.svelte';
	import { page } from '$app/stores';

	let { children } = $props();

	const fullWidth = $derived($page.url.pathname === '/squad' || $page.url.pathname.startsWith('/squad/'));
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>WOBI — עזר לחילופים Dream Team</title>
</svelte:head>

<Nav />
<main class="px-4 py-6 {fullWidth ? 'w-full max-w-none' : 'mx-auto max-w-6xl'}">
	{@render children()}
</main>
