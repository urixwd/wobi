<script lang="ts">
	import { positionLabel } from '$lib/positions';
	import { formatPrice } from '$lib/format';
	import FixtureStrip from '$lib/components/FixtureStrip.svelte';

	let { data } = $props();
</script>

<section class="space-y-6">
	<div>
		<h1 class="text-2xl font-bold">הצעות חילופים</h1>
		<p class="text-sm text-slate-400">
			היוריסטיקה פשוטה (עד 3): זמינות, פורם מחזור אחרון, וקושי יריבה. חילופים חופשיים:
			<span class="text-emerald-300">{data.freeTransfers}</span>
		</p>
	</div>

	{#if data.playerCount === 0}
		<p class="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
			אין שחקנים במסד. הריצו <code>bun run db:import-players -- --gw=N ./dump.json</code>.
		</p>
	{:else if !data.squad || data.squad.xiPlayerIds.length === 0}
		<p class="rounded-xl border border-slate-700 bg-slate-900 p-4 text-sm text-slate-300">
			שמרו קבוצה ב־<a class="text-emerald-300 underline" href="/squad">הקבוצה שלי</a> כדי לקבל הצעות.
		</p>
	{:else if data.suggestions.length === 0}
		<p class="text-sm text-slate-400">לא נמצאו חילופים חזקים כרגע — נסו אחרי ייבוא משחקים / עדכון סטטוסים.</p>
	{:else}
		<ul class="space-y-4">
			{#each data.suggestions as s, i}
				<li class="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
					<div class="mb-2 text-xs text-slate-500">הצעה {i + 1} · ציון {s.score.toFixed(1)}</div>
					<div class="grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
						<div class="rounded-xl bg-red-500/10 p-3">
							<div class="text-xs text-red-300">יוצא</div>
							<div class="font-semibold">{s.outPlayer.name}</div>
							<div class="text-xs text-slate-400">
								{positionLabel(s.outPlayer.position)} · {s.outPlayer.teamName ?? ''} · {formatPrice(s.outPlayer.price)}
							</div>
							<div class="mt-2">
								<FixtureStrip fixtures={s.outUpcoming} />
							</div>
						</div>
						<div class="text-center text-emerald-400">→</div>
						<div class="rounded-xl bg-emerald-500/10 p-3">
							<div class="text-xs text-emerald-300">נכנס</div>
							<div class="font-semibold">{s.inPlayer.name}</div>
							<div class="text-xs text-slate-400">
								{positionLabel(s.inPlayer.position)} · {s.inPlayer.teamName ?? ''} · {formatPrice(s.inPlayer.price)}
							</div>
							<div class="mt-2">
								<FixtureStrip fixtures={s.inUpcoming} />
							</div>
						</div>
					</div>
					<p class="mt-3 text-sm text-slate-300">{s.reason}</p>
				</li>
			{/each}
		</ul>
	{/if}
</section>
