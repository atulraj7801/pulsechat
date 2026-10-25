import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: { rollupOptions: { output: { manualChunks: { react: ['react', 'react-dom', 'react-router-dom'], forms: ['react-hook-form', '@hookform/resolvers', 'zod'], data: ['@tanstack/react-query', 'socket.io-client', 'zustand'] } } } },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:4000',
      '/socket.io': { target: 'http://127.0.0.1:4000', ws: true },
    },
  },
  test: { environment: 'jsdom', setupFiles: ['./src/test/setup.js'] },
});
