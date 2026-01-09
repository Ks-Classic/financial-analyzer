import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');

  return {
    plugins: [react()],
    build: {
      outDir: 'dist',
    },
    assetsInclude: ['**/*.pdf'],
    define: {
      global: 'globalThis',
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
    },
    worker: {
      format: 'es'
    },
    server: {
      fs: {
        allow: [
          '.',
          './node_modules'
        ]
      },
      proxy: {
        '/api': {
          target: 'http://localhost:3001',
          changeOrigin: true,
          secure: false,
        }
      }
    },
    // resolve: {
    //   alias: {
    //     '@': path.resolve(__dirname, '.'),
    //   }
    // },
    optimizeDeps: {
      include: ['pdfjs-dist']
    }
  };
});
