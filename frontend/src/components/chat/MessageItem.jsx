import { Attachment } from './Attachment';
import { useState } from 'react';
import {
  Check,
  CheckCheck,
  CornerUpLeft,
  MoreHorizontal,
  Pencil,
  Pin,
  SmilePlus,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Avatar } from '../common/Avatar';
import { api } from '../../services/api';
import { useAuth } from '../../stores/auth';
import { queryClient } from '../../lib/query';
import { mergeMessage } from '../../features/messages/queries';
import { REACTION_EMOJIS as emojis } from '../../constants/chat';
export function MessageItem({ message: m, onReply, onRetry, read, delivered }) {
  const user = useAuth((s) => s.user),
    [editing, setEditing] = useState(false),
    [body, setBody] = useState(m.body),
    [menu, setMenu] = useState(false),
    [reacting, setReacting] = useState(false),
    [busy, setBusy] = useState(false);
  const own = m.sender_id === user.id;
  const update = (message) =>
    queryClient.setQueryData(['messages', m.conversation_id], (old) => mergeMessage(old, message));
  async function mutate(path, options) {
    try {
      setBusy(true);
      const result = await api(path, options);
      if (result?.message) update(result.message);
      else await queryClient.invalidateQueries({ queryKey: ['messages', m.conversation_id] });
      return true;
    } catch (err) {
      toast.error(err.message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function reaction(emoji) {
    const exists = m.reactions?.some((r) => r.emoji === emoji && r.user_id === user.id);
    await mutate(`/messages/${m.id}/reactions${exists ? `/${encodeURIComponent(emoji)}` : ''}`, {
      method: exists ? 'DELETE' : 'POST',
      ...(!exists ? { body: { emoji } } : {}),
    });
    setReacting(false);
  }
  const grouped = Object.entries(
    (m.reactions || []).reduce((acc, r) => {
      (acc[r.emoji] ||= []).push(r.user_id);
      return acc;
    }, {}),
  );
  return (
    <article
      className={`message-row ${own ? 'own-message' : ''} ${m.pending ? 'pending-message' : ''}`}
      id={`message-${m.id}`}
    >
      <Avatar user={m.sender} />
      <div className="message-content">
        <div className="message-meta">
          <strong>{m.sender?.display_name || 'Teammate'}</strong>
          {own && <span className="you-tag">you</span>}
          <time dateTime={m.created_at}>
            {new Date(m.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
          </time>
          {m.is_pinned && (
            <span className="pin-label">
              <Pin size={10} /> Pinned
            </span>
          )}
        </div>
        {m.reply_to && (
          <div className="reply-preview">
            <CornerUpLeft size={13} />
            <strong>{m.reply_to.display_name}</strong>
            <span>{m.reply_to.body}</span>
          </div>
        )}
        {editing ? (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (await mutate(`/messages/${m.id}`, { method: 'PATCH', body: { body } }))
                setEditing(false);
            }}
            className="edit-form"
          >
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={10000}
              autoFocus
              required
            />
            <div className="flex gap-2">
              <button
                type="button"
                className="button secondary small"
                onClick={() => setEditing(false)}
              >
                Cancel
              </button>
              <button className="button primary small" disabled={busy}>
                Save changes
              </button>
            </div>
          </form>
        ) : (
          <p className={`message-body ${m.deleted_at ? 'deleted' : ''}`}>
            {m.deleted_at ? 'This message was deleted.' : m.body}
          </p>
        )}
        {m.edited_at && !m.deleted_at && <span className="edited-label">edited</span>}
        {m.attachments?.map(file => <Attachment key={file.id} file={file}/>)}
        {grouped.length > 0 && (
          <div className="reactions">
            {grouped.map(([emoji, ids]) => (
              <button
                key={emoji}
                onClick={() => reaction(emoji)}
                className={ids.includes(user.id) ? 'reacted' : ''}
                aria-label={`React ${emoji}, ${ids.length} reactions`}
                aria-pressed={ids.includes(user.id)}
              >
                {emoji}
                <span>{ids.length}</span>
              </button>
            ))}
          </div>
        )}
        {own && !m.deleted_at && (
          <span className={`message-status ${m.failed ? 'failed' : ''}`}>
            {m.failed ? (
              <button onClick={() => onRetry(m)}>Not sent · Retry</button>
            ) : m.pending ? (
              'Sending…'
            ) : read ? (
              <>
                <CheckCheck size={12} /> Read
              </>
            ) : delivered ? (
              <>
                <CheckCheck size={12} /> Delivered
              </>
            ) : (
              <>
                <Check size={12} /> Sent
              </>
            )}
          </span>
        )}
      </div>
      {!m.deleted_at && !m.pending && !m.failed && (
        <div className="message-actions">
          <button
            className="icon-button"
            title="Add reaction"
            aria-label="Add reaction"
            onClick={() => {
              setReacting(!reacting);
              setMenu(false);
            }}
          >
            <SmilePlus size={16} />
          </button>
          <button
            className="icon-button"
            title="Reply"
            aria-label="Reply"
            onClick={() => onReply(m)}
          >
            <CornerUpLeft size={16} />
          </button>
          <button
            className="icon-button"
            aria-label="Message options"
            onClick={() => {
              setMenu(!menu);
              setReacting(false);
            }}
          >
            <MoreHorizontal size={17} />
          </button>
          {reacting && (
            <div className="reaction-picker">
              {emojis.map((emoji) => (
                <button key={emoji} onClick={() => reaction(emoji)}>
                  {emoji}
                </button>
              ))}
            </div>
          )}
          {menu && (
            <div className="popover-menu">
              {own && (
                <button
                  onClick={() => {
                    setBody(m.body);
                    setEditing(true);
                    setMenu(false);
                  }}
                >
                  <Pencil size={14} /> Edit message
                </button>
              )}
              <button
                onClick={async () => {
                  await mutate(`/messages/${m.id}`, {
                    method: 'PATCH',
                    body: { is_pinned: !m.is_pinned },
                  });
                  setMenu(false);
                }}
              >
                <Pin size={14} />
                {m.is_pinned ? 'Unpin' : 'Pin'} message
              </button>
              {own && (
                <button
                  className="text-red-500"
                  onClick={async () => {
                    if (window.confirm('Delete this message? This cannot be undone.'))
                      await mutate(`/messages/${m.id}`, { method: 'DELETE' });
                    setMenu(false);
                  }}
                >
                  <Trash2 size={14} /> Delete message
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </article>
  );
}
