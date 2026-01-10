import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: '../../web/dist',
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    // 如果使用环境变量配置了远程 API，则不需要代理
    // 如果需要代理，可以取消下面的注释
    // proxy: {
    //   '/api': {
    //     target: 'https://lzcmobile.ecat.heiyu.space',
    //     changeOrigin: true,
    //     secure: true,
    //   },
    // },
  },
});
