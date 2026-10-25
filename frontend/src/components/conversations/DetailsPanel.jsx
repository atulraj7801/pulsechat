import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  X,
  Users,
  Pin,
  Files,
  Settings,
  UserPlus,
  Trash2,
  BellOff,
  Bell,
  File,
  Hash,
} from 'lucide-react';
import { toast } from 'sonner';
import { useConversation } from '../../features/conversations/queries';
import { useAuth } from '../../stores/auth';
import { useUI } from '../../stores/ui';
import { api } from '../../services/api';
import { queryClient } from '../../lib/query';
import { conversationName } from '../../utils/conversations';
import { Avatar } from '../common/Avatar';
import { ErrorState, Loading } from '../common/States';
export function DetailsPanel({ id }) {
  const query = useConversation(id),
    user = useAuth((s) => s.user),
    [tab, setTab] = useState('members'),
    [q, setQ] = useState(''),
    [busy, setBusy] = useState(false),
    navigate = useNavigate();
  const details = useQuery({
    queryKey: ['details', id],
    queryFn: () => api(`/conversations/${id}/details`),
  });
  const search = useQuery({
    queryKey: ['users', q],
    queryFn: () => api(`/users/search?q=${encodeURIComponent(q)}`),
    enabled: q.length >= 2,
  });
  async function action(path, options) {
    setBusy(true);
    try {
      await api(path, options);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['conversations'] }),
        queryClient.invalidateQueries({ queryKey: ['conversation', id] }),
      ]);
      toast.success('Conversation updated');
      return true;
    } catch (err) {
      toast.error(err.message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  if (query.isPending)
    return (
      <aside className="details-panel">
        <Loading />
      </aside>
    );
  if (query.isError)
    return (
      <aside className="details-panel">
        <button
          className="icon-button"
          onClick={useUI.getState().toggleDetails}
          aria-label="Close details"
        >
          <X />
        </button>
        <ErrorState error={query.error} />
      </aside>
    );
  const c = query.data,
    self = c.members.find((m) => m.id === user.id),
    manager = ['owner', 'admin'].includes(self?.role),
    muted = self?.muted_until && new Date(self.muted_until) > new Date();
  return (
    <aside className="details-panel">
      <header>
        <h2>Conversation details</h2>
        <button
          className="icon-button"
          onClick={useUI.getState().toggleDetails}
          aria-label="Close details"
        >
          <X size={18} />
        </button>
      </header>
      <div className="details-intro">
        <span className="channel-symbol">
          <Hash size={24} />
        </span>
        <h3>{conversationName(c, user.id)}</h3>
        <p>{c.description || 'A space to stay connected.'}</p>
        <button
          className="button secondary small"
          disabled={busy}
          onClick={() =>
            action(`/conversations/${id}/preferences`, {
              method: 'PATCH',
              body: { muted_until: muted ? null : new Date(Date.now() + 86400000).toISOString() },
            })
          }
        >
          {muted ? <Bell size={13} /> : <BellOff size={13} />}{' '}
          {muted ? 'Unmute notifications' : 'Mute for 24 hours'}
        </button>
      </div>
      <div className="details-tabs">
        {[
          ['members', Users],
          ['pins', Pin],
          ['files', Files],
          ['settings', Settings],
        ].map(([key, Icon]) => (
          <button
            key={key}
            className={tab === key ? 'active' : ''}
            onClick={() => setTab(key)}
            aria-label={key}
          >
            <Icon size={16} />
            <span>{key}</span>
          </button>
        ))}
      </div>
      <div className="details-body">
        {tab === 'members' && (
          <>
            <div className="details-section-title">
              PEOPLE <span>{c.members.length}</span>
            </div>
            {c.members.map((m) => (
              <div className="detail-member" key={m.id}>
                <Avatar user={m} size="sm" presence />
                <span>
                  <strong>{m.display_name}</strong>
                  <small>{m.role === 'member' ? `@${m.username}` : m.role}</small>
                </span>
                {manager &&
                  m.role !== 'owner' &&
                  m.id !== user.id &&
                  (self.role === 'owner' || m.role === 'member') &&
                  c.type !== 'direct' && (
                    <button
                      disabled={busy}
                      className="icon-button"
                      aria-label={`Remove ${m.display_name}`}
                      onClick={() => {
                        if (window.confirm(`Remove ${m.display_name} from this conversation?`))
                          action(`/conversations/${id}/members/${m.id}`, { method: 'DELETE' });
                      }}
                    >
                      <X size={14} />
                    </button>
                  )}
              </div>
            ))}
            {manager && c.type !== 'direct' && (
              <div className="invite-box">
                <label>
                  <span>
                    <UserPlus size={14} /> Add a teammate
                  </span>
                  <input
                    placeholder="Search by name"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                  />
                </label>
                {q.length >= 2 && (
                  <div className="user-results">
                    {search.isError && <p>{search.error.message}</p>}
                    {search.data?.users
                      .filter((u) => !c.members.some((m) => m.id === u.id))
                      .map((u) => (
                        <button
                          disabled={busy}
                          key={u.id}
                          onClick={async () => {
                            if (
                              await action(`/conversations/${id}/members`, {
                                method: 'POST',
                                body: { user_id: u.id },
                              })
                            )
                              setQ('');
                          }}
                        >
                          <Avatar user={u} size="sm" />
                          <span>{u.display_name}</span>
                          <UserPlus size={14} />
                        </button>
                      ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
        {tab === 'pins' &&
          (details.isPending ? (
            <Loading />
          ) : details.isError ? (
            <ErrorState error={details.error} retry={details.refetch} />
          ) : details.data.pins.length ? (
            details.data.pins.map((m) => (
              <div className="detail-pin" key={m.id}>
                <strong>
                  <Pin size={12} />
                  {m.sender.display_name}
                </strong>
                <p>{m.body}</p>
                <small>{new Date(m.created_at).toLocaleDateString()}</small>
              </div>
            ))
          ) : (
            <p className="details-empty">Pin a message to keep important things close.</p>
          ))}
        {tab === 'files' &&
          (details.isPending ? (
            <Loading />
          ) : details.isError ? (
            <ErrorState error={details.error} retry={details.refetch} />
          ) : details.data.files.length ? (
            details.data.files.map((f) => (
              <button
                key={f.id}
                className="detail-file"
                onClick={async () => {
                  try {
                    const result = await api(`/attachments/${f.id}/download-url`);
                    window.location.assign(result.url);
                  } catch (err) {
                    toast.error(err.message);
                  }
                }}
              >
                <File size={18} />
                <span>
                  <strong>{f.filename}</strong>
                  <small>{Math.ceil(f.size / 1024)} KB</small>
                </span>
              </button>
            ))
          ) : (
            <p className="details-empty">Files shared in this conversation will appear here.</p>
          ))}
        {tab === 'settings' && (
          <>
            {manager && c.type !== 'direct' ? (
              <form
                className="details-settings"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const data = new FormData(e.currentTarget);
                  await action(`/conversations/${id}`, {
                    method: 'PATCH',
                    body: {
                      name: data.get('name'),
                      description: data.get('description'),
                      is_private: data.get('private') === 'on',
                    },
                  });
                }}
              >
                <label>
                  Name
                  <input name="name" defaultValue={c.name} required maxLength={80} />
                </label>
                <label>
                  Description
                  <textarea
                    name="description"
                    defaultValue={c.description}
                    maxLength={500}
                    rows={4}
                  />
                </label>
                <label className="checkbox-label">
                  <input name="private" type="checkbox" defaultChecked={c.is_private} /> Private
                  conversation
                </label>
                <button className="button primary small" disabled={busy}>
                  Save settings
                </button>
              </form>
            ) : (
              <p className="details-empty">
                {c.type === 'direct'
                  ? 'Direct conversations are private to their two members.'
                  : 'Only admins can change conversation settings.'}
              </p>
            )}
            {self?.role === 'owner' ? (
              <button
                className="button danger small w-full mt-6"
                disabled={busy}
                onClick={async () => {
                  if (window.confirm('Delete this conversation and its messages permanently?')) {
                    if (await action(`/conversations/${id}`, { method: 'DELETE' })) {
                      useUI.getState().toggleDetails();
                      navigate('/app');
                    }
                  }
                }}
              >
                <Trash2 size={13} /> Delete conversation
              </button>
            ) : (
              c.type !== 'direct' && (
                <button
                  className="button secondary small w-full mt-6"
                  onClick={async () => {
                    if (
                      await action(`/conversations/${id}/members/${user.id}`, { method: 'DELETE' })
                    ) {
                      useUI.getState().toggleDetails();
                      navigate('/app');
                    }
                  }}
                >
                  Leave conversation
                </button>
              )
            )}
          </>
        )}
      </div>
    </aside>
  );
}
