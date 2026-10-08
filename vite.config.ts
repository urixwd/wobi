import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	// Fixed port so dev/kill-ports.sh only ever touches WOBI's server.
	server: { port: 5174, strictPort: true }
});
