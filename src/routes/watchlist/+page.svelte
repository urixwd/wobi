<script lang="ts">
	import PlayerRow from '$lib/components/PlayerRow.svelte';
	import { enhance } from '$app/forms';

	let { data } = $props();
	let q = $state('');
	let list: 'permanent' | 'round' = $state('permanent');

	const filtered = $derived(
		data.allPlayers.filter(
			(r) => !q.trim() || r.player.name.includes(q.trim()) || (r.teamName ?? '').includes(q.trim())
		)
	);
</script>

<section class="space-y-6">
	<div>
		<h1 class="text-2xl font-bold">מעקב</h1>
		<p class="text-sm text-slate-400">רשימה קבועה + רשימה רלוונטית למחזור הנוכחי.</p>
	</div>

	<div class="grid gap-6 lg:grid-cols-2">
		<div class="space-y-4">
			<div>
				<h2 class="mb-2 font-semibold text-emerald-300">מעקב קבוע</h2>
				<div class="space-y-2">
					{#each data.permanent as item}
						<div class="flex items-start gap-2">
							<div class="flex-1">
								<PlayerRow
									name={item.player.name}
									teamName={item.teamName}
									position={item.player.position}
									price={item.player.price}
									logoPath={item.teamLogo ?? item.player.teamLogoPath}
									difficulty={item.difficulty}
									injured={item.player.injuredStatus}
									expelled={item.player.expelledStatus}
									missing={item.player.missingStatus}
								/>
							</div>
							<form method="POST" action="?/removePermanent" use:enhance>
								<input type="hidden" name="id" value={item.row.id} />
								<button class="rounded-lg bg-slate-800 px-2 py-1 text-xs text-red-300" type="submit"
									>הסר</button
								>
							</form>
						</div>
					{:else}
						<p class="text-sm text-slate-500">אין עדיין שחקנים במעקב הקבוע.</p>
					{/each}
				</div>
			</div>

			<div>
				<h2 class="mb-2 font-semibold text-sky-300">רלוונטי למחזור</h2>
				<div class="space-y-2">
					{#each data.round as item}
						<div class="flex items-start gap-2">
							<div class="flex-1">
								<PlayerRow
									name={item.player.name}
									teamName={item.teamName}
									position={item.player.position}
									price={item.player.price}
									logoPath={item.teamLogo ?? item.player.teamLogoPath}
									difficulty={item.difficulty}
									injured={item.player.injuredStatus}
									expelled={item.player.expelledStatus}
									missing={item.player.missingStatus}
								/>
							</div>
							<form method="POST" action="?/removeRound" use:enhance>
								<input type="hidden" name="id" value={item.row.id} />
								<button class="rounded-lg bg-slate-800 px-2 py-1 text-xs text-red-300" type="submit"
									>הסר</button
								>
							</form>
						</div>
					{:else}
						<p class="text-sm text-slate-500">אין שחקנים ברשימת המחזור.</p>
					{/each}
				</div>
			</div>
		</div>

		<div class="space-y-3">
			<div class="flex flex-wrap gap-2">
				<input
					bind:value={q}
					placeholder="חיפוש להוספה"
					class="flex-1 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
				/>
				<button
					type="button"
					class="rounded-lg px-3 py-1 text-sm {list === 'permanent'
						? 'bg-emerald-500/20 text-emerald-300'
						: 'bg-slate-800'}"
					onclick={() => (list = 'permanent')}>קבוע</button
				>
				<button
					type="button"
					class="rounded-lg px-3 py-1 text-sm {list === 'round' ? 'bg-sky-500/20 text-sky-300' : 'bg-slate-800'}"
					onclick={() => (list = 'round')}>מחזור</button
				>
			</div>
			<div class="max-h-[70vh] space-y-2 overflow-y-auto">
				{#each filtered.slice(0, 60) as r}
					<div class="flex items-start gap-2">
						<div class="flex-1">
							<PlayerRow
								name={r.player.name}
								teamName={r.teamName}
								position={r.player.position}
								price={r.player.price}
								logoPath={r.teamLogo ?? r.player.teamLogoPath}
								difficulty={r.difficulty}
								injured={r.player.injuredStatus}
								expelled={r.player.expelledStatus}
								missing={r.player.missingStatus}
							/>
						</div>
						<form
							method="POST"
							action={list === 'permanent' ? '?/addPermanent' : '?/addRound'}
							use:enhance
						>
							<input type="hidden" name="playerId" value={r.player.id} />
							<button class="rounded-lg bg-emerald-500/20 px-2 py-1 text-xs text-emerald-300" type="submit"
								>+</button
							>
						</form>
					</div>
				{/each}
			</div>
		</div>
	</div>
</section>
