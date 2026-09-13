<script lang="ts">
	const cards = [
		{ href: '/squad', title: 'הקבוצה שלי', desc: 'עריכת XI + ספסל ושמירה' },
		{ href: '/watchlist', title: 'מעקב', desc: 'רשימה קבועה + רלוונטי למחזור' },
		{ href: '/gameweek', title: 'מחזור', desc: 'רמזור יריבות, מחיר, נקודות וזמינות' },
		{ href: '/transfers', title: 'הצעות חילופים', desc: 'עד 3 חילופים מומלצים' }
	];
</script>

<section class="space-y-6">
	<div>
		<h1 class="text-3xl font-bold text-white">WOBI</h1>
		<p class="mt-2 max-w-2xl text-slate-400">
			עזר לחילופים ב־Dream Team של Sport5. עברית מלאה, RTL, וקושי יריבות ברמזור.
		</p>
	</div>
	<div class="grid gap-4 sm:grid-cols-2">
		{#each cards as c}
			<a
				href={c.href}
				class="rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900 to-slate-950 p-5 transition hover:border-emerald-500/40"
			>
				<h2 class="text-xl font-semibold text-emerald-300">{c.title}</h2>
				<p class="mt-2 text-sm text-slate-400">{c.desc}</p>
			</a>
		{/each}
	</div>
</section>
