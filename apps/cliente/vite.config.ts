import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
    plugins: [react()],

    // Required for Tauri
    clearScreen: false,
    server: {
        port: 3001,
        strictPort: true,
    },

    // Environment variable handling
    envPrefix: ['VITE_'],

    build: {
        // Tauri requires ES2021 target
        target: 'esnext',
        // Don't minify for debugging in development
        minify: !process.env.TAURI_DEBUG ? 'esbuild' : false,
        // Generate sourcemaps for debugging
        sourcemap: !!process.env.TAURI_DEBUG,
    },
});
