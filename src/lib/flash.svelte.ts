/** Briefly marks one key as «done» (e.g. a button that just saved), then clears it. */
export class Flash {
	active = $state<string | null>(null);
	#timer: ReturnType<typeof setTimeout> | null = null;

	constructor(private ms = 1200) {}

	trigger(key: string) {
		this.active = key;
		if (this.#timer) clearTimeout(this.#timer);
		this.#timer = setTimeout(() => (this.active = null), this.ms);
	}

	is(key: string) {
		return this.active === key;
	}
}
