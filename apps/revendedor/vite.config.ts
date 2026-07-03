import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import legacy from '@vitejs/plugin-legacy';

export default defineConfig({
    plugins: [
        react(),
        legacy({
            targets: ['chrome >= 51', 'android >= 7'],
        }),
    ],
    clearScreen: false,
    server: { port: 3002, strictPort: true },
    envPrefix: ['VITE_'],
    build: {
        target: 'es2015',
        minify: 'terser',
        sourcemap: !!process.env.TAURI_DEBUG,
    },
});
