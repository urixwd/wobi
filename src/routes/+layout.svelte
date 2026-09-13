<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import Nav from '$lib/components/Nav.svelte';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>WOBI — עזר לחילופים Dream Team</title>
</svelte:head>

<Nav />
<main class="mx-auto max-w-6xl px-4 py-6">
	{@render children()}
</main>
