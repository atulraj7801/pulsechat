import { useInfiniteQuery } from '@tanstack/react-query';
import { api } from '../../services/api';
export function useMessages(id) {
  return useInfiniteQuery({
    queryKey: ['messages', id],
    queryFn: ({ pageParam }) =>
      api(
        `/conversations/${id}/messages?limit=30${pageParam ? `&before=${encodeURIComponent(pageParam)}` : ''}`,
      ),
    initialPageParam: null,
    getNextPageParam: (page) => page.next_cursor || undefined,
    enabled: !!id,
    refetchInterval: 30000,
  });
}
export function mergeMessage(cache, message, { insert = true } = {}) {
  if (!cache) return cache;
  let found = false;
  const pages = cache.pages.map((page) => ({
    ...page,
    messages: page.messages.map((m) => {
      if (m.id === message.id || m.client_message_id === message.client_message_id) {
        found = true;
        return (m.version || 0) > (message.version || 0) ? m : message;
      }
      return m;
    }),
  }));
  if (!found && insert) pages[0] = { ...pages[0], messages: [...pages[0].messages, message].sort((a, b) => new Date(a.created_at) - new Date(b.created_at) || a.id.localeCompare(b.id)) };
  return { ...cache, pages };
}
