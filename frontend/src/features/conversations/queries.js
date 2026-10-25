import { useQuery } from '@tanstack/react-query';
import { api } from '../../services/api';
export const useConversations = () =>
  useQuery({
    queryKey: ['conversations'],
    queryFn: () => api('/conversations').then((r) => r.conversations),
  });
export const useConversation = (id) =>
  useQuery({
    queryKey: ['conversation', id],
    queryFn: () => api(`/conversations/${id}`).then((r) => r.conversation),
    enabled: !!id,
  });
