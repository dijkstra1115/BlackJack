import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true, // allow LAN access so friends can join via your IP
  },
  build: {
    target: 'es2022',
  },
});
