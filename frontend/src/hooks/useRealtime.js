import { useEffect } from 'react';
import { toast } from 'sonner';
import { useAuth } from '../stores/auth';
import { useRealtime } from '../stores/realtime';
import { queryClient } from '../lib/query';
import { connectSocket } from '../services/socket';
import { refreshSession } from '../services/api';
import { mergeMessage } from '../features/messages/queries';
export function useRealtimeConnection() {
  const token = useAuth((s) => s.token),
    userId = useAuth((s) => s.user?.id);
  useEffect(() => {
    if (!token || !userId) return;
    let stopped = false, recoveryTimer;
    const socket = connectSocket(token),
      state = useRealtime.getState;
    const recover = async () => {
      try {
        const session = await refreshSession();
        if (!stopped && session.access_token === token) socket.connect();
      } catch (error) {
        if (!stopped && error.status === 401) useAuth.getState().clear();
        else if (!stopped) recoveryTimer = setTimeout(recover, 3000);
      }
    };
    socket.on('connect', () => {
      state().setStatus('connected');
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      queryClient.invalidateQueries({ queryKey: ['conversation'] });
      queryClient.invalidateQueries({ queryKey: ['messages'] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    });
    socket.on('disconnect', (reason) => {
      state().setStatus(navigator.onLine ? 'reconnecting' : 'offline');
      if (reason === 'io server disconnect' && !stopped) recover();
    });
    socket.on('connect_error', (error) => {
      state().setStatus(navigator.onLine ? 'reconnecting' : 'offline');
      if (error.message === 'UNAUTHORIZED' && !stopped) recover();
    });
    const upsert = (message, insert = true) => {
      state().removeOutbox(message.client_message_id);
      queryClient.setQueryData(['messages', message.conversation_id], (old) =>
        mergeMessage(old, message, { insert }),
      );
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      queryClient.invalidateQueries({ queryKey: ['details', message.conversation_id] });
    };
    socket.on('message:new', (message) => {
      upsert(message);
      if (message.sender_id !== userId)
        socket.emit('message:delivered', { message_id: message.id });
    });
    socket.on('message:updated', message => upsert(message, false));
    socket.on('message:deleted', message => upsert(message, false));
    socket.on('message:delivered', (event) => state().markDelivered(event.message_id));
    socket.on('message:read', (event) => {
      queryClient.invalidateQueries({ queryKey: ['conversation', event.conversation_id] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    });
    socket.on('user:presence', (event) => state().setPresence([event]));
    socket.on('presence:snapshot', (rows) => state().setPresence(rows));
    socket.on('user:typing', (event) => state().setTyping(event));
    socket.on('notification:new', (notification) => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      if (document.hidden) toast(notification.title);
    });
    socket.on('conversation:updated', (event) => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      queryClient.invalidateQueries({ queryKey: ['conversation', event.id] });
      queryClient.invalidateQueries({ queryKey: ['messages', event.id] });
    });
    const offline = () => state().setStatus('offline');
    const online = () => {
      state().setStatus('reconnecting');
      socket.connect();
    };
    window.addEventListener('offline', offline);
    window.addEventListener('online', online);
    socket.connect();
    return () => {
      stopped = true;
      clearTimeout(recoveryTimer);
      socket.removeAllListeners();
      socket.disconnect();
      window.removeEventListener('offline', offline);
      window.removeEventListener('online', online);
    };
  }, [token, userId]);
  useEffect(() => {
    if (!userId) useRealtime.getState().reset();
  }, [userId]);
}
