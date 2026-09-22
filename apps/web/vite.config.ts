import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-charts': ['recharts'],
          'vendor-markdown': ['react-markdown', 'katex', 'rehype-katex', 'remark-gfm', 'prismjs'],
        },
      },
    },
  },
  server: {
    host: '0.0.0.0',
    port: 3070,
    proxy: {
      '/api': {
        target: 'http://localhost:3333',
        changeOrigin: true,
        secure: false,
        ws: true,
      },
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 3070,
    proxy: {
      '/api': {
        target: 'http://localhost:3333',
        changeOrigin: true,
        secure: false,
        ws: true,
      },
    },
  },
});

