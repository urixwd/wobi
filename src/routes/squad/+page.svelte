<script lang="ts">
	import PlayerRow from '$lib/components/PlayerRow.svelte';
	import { positionLabel } from '$lib/positions';
	import { enhance } from '$app/forms';

	let { data, form } = $props();

	let xi = $state<number[]>([...data.squad.xiPlayerIds]);
	let bench = $state<number[]>([...data.squad.benchPlayerIds]);
	let freeTransfers = $state(data.squad.freeTransfers);
	let q = $state('');
	let posFilter = $state<number | 0>(0);
	let target: 'xi' | 'bench' = $state('xi');

	const byId = $derived(new Map(data.allPlayers.map((r) => [r.player.id, r])));

	const filtered = $derived(
		data.allPlayers.filter((r) => {
			if (posFilter && r.player.position !== posFilter) return false;
			if (!q.trim()) return true;
			return r.player.name.includes(q.trim()) || (r.teamName ?? '').includes(q.trim());
		})
	);

	function toggle(id: number) {
		const inXi = xi.includes(id);
		const inBench = bench.includes(id);
		if (inXi || inBench) {
			xi = xi.filter((x) => x !== id);
			bench = bench.filter((x) => x !== id);
			return;
		}
		if (target === 'xi') {
			if (xi.length >= 11) return;
			xi = [...xi, id];
		} else {
			bench = [...bench, id];
		}
	}
</script>

<section class="space-y-6">
	<div class="flex flex-wrap items-end justify-between gap-3">
		<div>
			<h1 class="text-2xl font-bold">הקבוצה שלי</h1>
			<p class="text-sm text-slate-400">בחרו XI (עד 11) וספסל, ואז שמרו.</p>
		</div>
		{#if form?.success}
			<span class="rounded-lg bg-emerald-500/20 px-3 py-1 text-sm text-emerald-300">נשמר ✓</span>
		{/if}
		{#if form?.message}
			<span class="rounded-lg bg-red-500/20 px-3 py-1 text-sm text-red-300">{form.message}</span>
		{/if}
	</div>

	<form method="POST" action="?/save" use:enhance class="space-y-4">
		<input type="hidden" name="xi" value={xi.join(',')} />
		<input type="hidden" name="bench" value={bench.join(',')} />
		<div class="flex flex-wrap items-center gap-3">
			<label class="text-sm text-slate-400">
				חילופים חופשיים
				<input
					type="number"
					name="freeTransfers"
					bind:value={freeTransfers}
					min="0"
					max="15"
					class="mr-2 w-16 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1"
				/>
			</label>
			<button
				type="submit"
				class="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400"
			>
				שמור קבוצה
			</button>
			<div class="flex gap-2 text-sm">
				<button
					type="button"
					class="rounded-lg px-3 py-1 {target === 'xi' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-800'}"
					onclick={() => (target = 'xi')}>הוסף ל־XI</button
				>
				<button
					type="button"
					class="rounded-lg px-3 py-1 {target === 'bench' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-800'}"
					onclick={() => (target = 'bench')}>הוסף לספסל</button
				>
			</div>
		</div>
	</form>

	<div class="grid gap-6 lg:grid-cols-2">
		<div class="space-y-3">
			<h2 class="font-semibold text-emerald-300">XI ({xi.length}/11)</h2>
			{#each xi as id}
				{@const r = byId.get(id)}
				{#if r}
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
						selected={true}
						onclick={() => toggle(id)}
					/>
				{/if}
			{/each}
			<h2 class="pt-2 font-semibold text-sky-300">ספסל ({bench.length})</h2>
			{#each bench as id}
				{@const r = byId.get(id)}
				{#if r}
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
						selected={true}
						onclick={() => toggle(id)}
					/>
				{/if}
			{/each}
		</div>

		<div class="space-y-3">
			<div class="flex flex-wrap gap-2">
				<input
					bind:value={q}
					placeholder="חיפוש שחקן / קבוצה"
					class="flex-1 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
				/>
				<select
					bind:value={posFilter}
					class="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
				>
					<option value={0}>כל העמדות</option>
					<option value={1}>{positionLabel(1)}</option>
					<option value={2}>{positionLabel(2)}</option>
					<option value={3}>{positionLabel(3)}</option>
					<option value={4}>{positionLabel(4)}</option>
				</select>
			</div>
			<div class="max-h-[70vh] space-y-2 overflow-y-auto pr-1">
				{#each filtered.slice(0, 80) as r}
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
						selected={xi.includes(r.player.id) || bench.includes(r.player.id)}
						onclick={() => toggle(r.player.id)}
					/>
				{/each}
			</div>
		</div>
	</div>
</section>
