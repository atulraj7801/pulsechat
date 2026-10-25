import { QueryClient } from '@tanstack/react-query';
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15000,
      retry: (count, err) => err.status >= 500 && count < 2,
      refetchOnWindowFocus: true,
    },
    mutations: { retry: false },
  },
});
