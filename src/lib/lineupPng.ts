/** PNG snapshots of lineup cards (client only). Anything marked `data-png-skip` is left out. */

export function safeFileName(name: string): string {
	return name.replace(/[\\/:*?"<>|]+/g, '-');
}

export async function cardToPng(card: HTMLElement): Promise<string> {
	const { toPng } = await import('html-to-image');
	return toPng(card, {
		pixelRatio: 2,
		backgroundColor: '#020617', // slate-950, the page behind the translucent card
		filter: (node) => !(node instanceof HTMLElement && node.dataset.pngSkip != null)
	});
}

export function downloadUrl(url: string, fileName: string) {
	const a = document.createElement('a');
	a.href = url;
	a.download = fileName;
	a.click();
}

/** Snapshot several cards into one zip (`${zipName}.zip`, one `${name}.png` per card). */
export async function downloadCardsZip(cards: { el: HTMLElement; name: string }[], zipName: string) {
	const { default: JSZip } = await import('jszip');
	const zip = new JSZip();
	const used = new Set<string>();
	for (const { el, name } of cards) {
		const dataUrl = await cardToPng(el);
		let file = safeFileName(name);
		for (let i = 2; used.has(file); i++) file = `${safeFileName(name)} (${i})`;
		used.add(file);
		zip.file(`${file}.png`, dataUrl.split(',')[1], { base64: true });
	}
	const blob = await zip.generateAsync({ type: 'blob' });
	const url = URL.createObjectURL(blob);
	downloadUrl(url, `${safeFileName(zipName)}.zip`);
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}
