import { useRealtime } from '../../stores/realtime';
import { getSocket, emitAck } from '../../services/socket';
import { useEffect, useRef, useState } from 'react';
import { Hash, LockKeyhole, Info, Search, Menu, ChevronDown } from 'lucide-react';
import { useConversation } from '../../features/conversations/queries';
import { useMessages, mergeMessage } from '../../features/messages/queries';
import { useAuth } from '../../stores/auth';
import { useUI } from '../../stores/ui';
import { api } from '../../services/api';
import { queryClient } from '../../lib/query';
import { conversationName } from '../../utils/conversations';
import { Avatar } from '../common/Avatar';
import { ErrorState, MessageSkeleton } from '../common/States';
import { MessageItem } from './MessageItem';
import { Composer } from './Composer';
export function ChatView({ id, onSearch }) {
  const user = useAuth((s) => s.user),
    conversation = useConversation(id),
    history = useMessages(id),
    [reply, setReply] = useState(null),
    scrollRef = useRef(),
    nearBottom = useRef(true),
    [newMessages, setNewMessages] = useState(false);
  const outbox = useRealtime((s) => s.outbox),
    typing = useRealtime((s) => s.typing),
    delivered = useRealtime((s) => s.delivered),
    connection = useRealtime((s) => s.status);
  const [now, setNow] = useState(Date.now()),
    typingSent = useRef(0),
    typingTimer = useRef(),
    lastRead = useRef(null);
  const savedMessages =
    history.data?.pages
      .slice()
      .reverse()
      .flatMap((p) => p.messages) || [];
  const messages = [
    ...savedMessages,
    ...Object.values(outbox).filter(
      (m) =>
        m.conversation_id === id &&
        !savedMessages.some((s) => s.client_message_id === m.client_message_id),
    ),
  ];
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    const socket = getSocket();
    if (connection === 'connected') socket?.emit('conversation:join', { conversation_id: id });
    return () => {
      clearTimeout(typingTimer.current);
      socket?.emit('message:typing:stop', { conversation_id: id });
      socket?.emit('conversation:leave', { conversation_id: id });
    };
  }, [id, connection]);
  const latestSaved = savedMessages.at(-1)?.id;
  useEffect(() => {
    function markRead() {
      if (
        latestSaved &&
        !document.hidden &&
        nearBottom.current &&
        latestSaved !== lastRead.current
      ) {
        lastRead.current = latestSaved;
        api(`/messages/${latestSaved}/read`, { method: 'POST' })
          .then(() => {
            queryClient.invalidateQueries({ queryKey: ['conversations'] });
            queryClient.invalidateQueries({ queryKey: ['notifications'] });
          })
          .catch(() => {
            lastRead.current = null;
          });
      }
    }
    markRead();
    document.addEventListener('visibilitychange', markRead);
    const el = scrollRef.current;
    el?.addEventListener('scroll', markRead);
    return () => {
      document.removeEventListener('visibilitychange', markRead);
      el?.removeEventListener('scroll', markRead);
    };
  }, [latestSaved, connection]);
  function onTyping(active) {
    const socket = getSocket();
    if (!socket?.connected) return;
    clearTimeout(typingTimer.current);
    if (active && Date.now() - typingSent.current > 2000) {
      socket.emit('message:typing:start', { conversation_id: id });
      typingSent.current = Date.now();
    }
    if (!active) socket.emit('message:typing:stop', { conversation_id: id });
    else
      typingTimer.current = setTimeout(
        () => socket.emit('message:typing:stop', { conversation_id: id }),
        2500,
      );
  }
  const typers = Object.values(typing).filter(
    (t) => t.conversation_id === id && t.typing && t.expires_at > now && t.user_id !== user.id,
  );
  const lastId = messages.at(-1)?.id;
  useEffect(() => {
    if (nearBottom.current)
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'instant' });
    else setNewMessages(true);
  }, [lastId]);
  async function send(data, replyTo, previous) {
    const client_message_id = previous?.client_message_id || crypto.randomUUID();
    const optimistic = {
      ...data,
      id: previous?.id || client_message_id,
      client_message_id,
      conversation_id: id,
      sender_id: user.id,
      sender: user,
      created_at: previous?.created_at || new Date().toISOString(),
      pending: true,
      failed: false,
      reactions: [],
      attachments: previous?.attachments || [],
      reply_to: replyTo
        ? { id: replyTo.id, body: replyTo.body, display_name: replyTo.sender.display_name }
        : previous?.reply_to,
    };
    useRealtime.getState().putOutbox(optimistic);
    nearBottom.current = true;
    try {
      const payload = {
        body: data.body,
        client_message_id,
        reply_to_id: data.reply_to_id || null,
        attachment_ids: data.attachment_ids || [],
      };
      const result = getSocket()?.connected
        ? await emitAck('message:send', { ...payload, conversation_id: id })
        : await api(`/conversations/${id}/messages`, { method: 'POST', body: payload });
      useRealtime.getState().removeOutbox(client_message_id);
      queryClient.setQueryData(['messages', id], (old) => mergeMessage(old, result.message));
      await queryClient.invalidateQueries({ queryKey: ['conversations'] });
    } catch {
      if (useRealtime.getState().outbox[client_message_id])
        useRealtime.getState().putOutbox({ ...optimistic, pending: false, failed: true });
    }
  }
  if (conversation.isError)
    return <ErrorState error={conversation.error} retry={conversation.refetch} />;
  if (!conversation.data) return <MessageSkeleton />;
  const c = conversation.data,
    name = conversationName(c, user.id);
  return (
    <section className="chat-panel">
      <header className="conversation-header">
        <button
          className="icon-button mobile-only"
          aria-label="Open navigation"
          onClick={() => useUI.getState().setSidebar(true)}
        >
          <Menu size={20} />
        </button>
        <span className="channel-symbol">
          {c.is_private ? <LockKeyhole size={21} /> : <Hash size={23} />}
        </span>
        <div className="conversation-heading">
          <h1>
            {name}
            <ChevronDown size={13} />
          </h1>
          <p>
            {c.description ||
              (c.type === 'direct'
                ? 'A little space for the two of you.'
                : 'Good conversations happen here.')}
          </p>
        </div>
        <div className="conversation-header-actions">
          <button
            className="member-stack"
            onClick={useUI.getState().toggleDetails}
            aria-label="Show conversation members"
          >
            {c.members.slice(0, 3).map((m) => (
              <Avatar key={m.id} user={m} size="sm" />
            ))}
            <span>{c.members.length}</span>
          </button>
          <span className="header-divider" />
          <button className="icon-button" onClick={onSearch} aria-label="Search messages">
            <Search size={19} />
          </button>
          <button
            className="icon-button"
            onClick={useUI.getState().toggleDetails}
            aria-label="Conversation details"
          >
            <Info size={19} />
          </button>
        </div>
      </header>
      <div
        ref={scrollRef}
        className="messages-scroll"
        onScroll={(e) => {
          const el = e.currentTarget;
          nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
          if (nearBottom.current) setNewMessages(false);
        }}
      >
        <div className="conversation-welcome">
          <span className="welcome-symbol">
            {c.is_private ? <LockKeyhole size={27} /> : <Hash size={31} />}
          </span>
          <span className="eyebrow">A SPACE TO CONNECT</span>
          <h2>
            {c.type === 'channel' ? `Welcome to #${name}` : name}
            <span> 👋</span>
          </h2>
          <p>
            {c.description || 'This is the start of something good. Say hello to your teammates.'}
          </p>
          <span className="welcome-members">
            <span className="green-dot" />
            {c.members.length} {c.members.length === 1 ? 'person' : 'people'} in this conversation
          </span>
        </div>
        {history.hasNextPage && (
          <button
            className="load-history"
            disabled={history.isFetchingNextPage}
            onClick={async () => {
              const el = scrollRef.current,
                height = el.scrollHeight;
              await history.fetchNextPage();
              requestAnimationFrame(() => {
                el.scrollTop += el.scrollHeight - height;
              });
            }}
          >
            {history.isFetchingNextPage ? 'Loading…' : 'Load earlier messages'}
          </button>
        )}
        {history.isPending ? (
          <MessageSkeleton />
        ) : history.isError ? (
          <ErrorState error={history.error} retry={history.refetch} />
        ) : (
          <div
            className="message-list"
            role="log"
            aria-label="Conversation messages"
            aria-live="polite"
          >
            {messages.map((m, i) => {
              const date = new Date(m.created_at).toLocaleDateString([], {
                month: 'long',
                day: 'numeric',
              });
              const previousDate = i
                ? new Date(messages[i - 1].created_at).toLocaleDateString([], {
                    month: 'long',
                    day: 'numeric',
                  })
                : null;
              return (
                <div key={m.id}>
                  {date !== previousDate && (
                    <div className="date-divider">
                      <span>
                        {new Date(m.created_at).toDateString() === new Date().toDateString()
                          ? 'Today'
                          : date}
                      </span>
                    </div>
                  )}
                  <MessageItem
                    message={m}
                    delivered={delivered[m.id]}
                    read={c.members.some(
                      (member) =>
                        member.id !== user.id &&
                        member.last_read_at &&
                        (+new Date(member.last_read_at) > +new Date(m.created_at) ||
                          (+new Date(member.last_read_at) === +new Date(m.created_at) &&
                            member.last_read_message_id >= m.id)),
                    )}
                    onReply={setReply}
                    onRetry={(m) => send(m, null, m)}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
      {newMessages && (
        <button
          className="new-messages-pill"
          onClick={() => {
            scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
            setNewMessages(false);
          }}
        >
          New messages ↓
        </button>
      )}
      <div className="typing-area" aria-live="polite">
        {typers.length > 0 && (
          <span>
            <span className="typing-dots">•••</span>{' '}
            {typers.map((t) => t.display_name.split(' ')[0]).join(', ')}{' '}
            {typers.length === 1 ? 'is' : 'are'} typing
          </span>
        )}
      </div>
      <Composer
        onTyping={onTyping}
        conversation={c}
        name={name}
        onSend={send}
        reply={reply}
        onClearReply={() => setReply(null)}
        disabled={history.isError}
      />
    </section>
  );
}
