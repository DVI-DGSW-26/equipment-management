import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
// 사내망에서 CDN 이 막힐 수 있으므로 폰트는 npm 패키지로 번들한다
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
import './index.css';
import { ApiError } from '@/api/types';
import App from './App';

/**
 * 인증·권한 문제는 다시 물어도 답이 같다.
 *
 * 401 은 client 가 이미 토큰을 비우고 로그인으로 보낸다 — 한 번 더 부르면
 * 그 길에 요청이 하나 더 얹힌다. 403 은 롤이 없다는 뜻이라 재시도가 무의미하고,
 * 안내가 뜨는 것만 그만큼 늦어진다.
 */
const retryable = (e: unknown): boolean =>
  !(e instanceof ApiError && (e.status === 401 || e.status === 403));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      refetchOnWindowFocus: false,
      retry: (count, error) => count < 1 && retryable(error),
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
