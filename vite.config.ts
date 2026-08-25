import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

/*
 * 브라우저는 항상 같은 오리진(/api)만 부르고, 서버가 백엔드로 넘긴다.
 * 백엔드 CORS 가 localhost:5173 만 허용하기 때문에 이 구조라야
 * 사내망 다른 PC(192.168.x.x)에서 열어도 막히지 않는다.
 *
 *   npm run dev      개발
 *   npm run preview  빌드 결과를 그대로 확인·공유 (사내 테스트용)
 *   Vercel 배포      같은 역할을 vercel.json 의 rewrites 가 한다
 *
 * 대상 주소는 .env 의 VITE_API_PROXY_TARGET.
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const target = env.VITE_API_PROXY_TARGET ?? 'http://112.146.55.78:3378/jagigo'

  const proxy = {
    '/api': {
      target,
      changeOrigin: true,
      rewrite: (path: string) => path.replace(/^\/api/, ''),
    },
  }

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      port: 5173,
      host: true, // 사내망 다른 PC에서 접속 확인용
      proxy,
    },
    preview: {
      port: 4173,
      host: true,
      proxy,
    },
  }
})
