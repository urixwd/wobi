/** Prices are stored as millions (e.g. 5.5 → 5.5m). */
export function formatPrice(price: number): string {
	if (!Number.isFinite(price)) return '—';
	const rounded = Math.round(price * 10) / 10;
	return Number.isInteger(rounded) ? `${rounded}m` : `${rounded.toFixed(1)}m`;
}
