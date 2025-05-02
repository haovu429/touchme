import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
export default defineConfig({
  // server: {
  //   port: 3000, // thay 3001 bằng cổng bạn muốn
  // },
  plugins: [
    tailwindcss(),
  ],
})