import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
    plugins: [react()],
    clearScreen: false,
    server: { port: 3003, strictPort: true },
    envPrefix: ['VITE_'],
    build: {
        target: 'esnext',
        minify: !process.env.TAURI_DEBUG ? 'esbuild' : false,
        sourcemap: !!process.env.TAURI_DEBUG,
    },
});
