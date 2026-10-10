/** A player in a transfers list (out / in), with an optional short detail line. */
export type TransferPlayer = { id: number; name: string; position: number; detail?: string };

type Meta = { name: string; position: number; detail?: string };

/**
 * Who leaves and who joins going from `baseIds` to `nextIds`, each sorted by
 * position then name. Names come from `byId` (unknown ids show as `#id`).
 */
export function transferDiff(
	baseIds: number[],
	nextIds: number[],
	byId: Map<number, Meta>
): { out: TransferPlayer[]; in: TransferPlayer[] } {
	const base = new Set(baseIds);
	const next = new Set(nextIds);
	const pick = (id: number): TransferPlayer => {
		const m = byId.get(id);
		return { id, name: m?.name ?? `#${id}`, position: m?.position ?? 0, detail: m?.detail };
	};
	const byPosName = (a: TransferPlayer, b: TransferPlayer) =>
		a.position - b.position || a.name.localeCompare(b.name, 'he');
	return {
		out: baseIds.filter((id) => !next.has(id)).map(pick).sort(byPosName),
		in: nextIds.filter((id) => !base.has(id)).map(pick).sort(byPosName)
	};
}
