import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ArrowUpRight, Search } from 'lucide-react';
import { api } from '../../services/api';
import { Modal } from '../../components/common/Modal';
import { Avatar } from '../../components/common/Avatar';
import { Empty, ErrorState, Loading } from '../../components/common/States';
export function SearchDialog({ onClose }) {
  const [input, setInput] = useState(''),
    [q, setQ] = useState(''),
    navigate = useNavigate();
  const result = useQuery({
    queryKey: ['search', q],
    queryFn: () => api(`/search/messages?q=${encodeURIComponent(q)}`),
    enabled: q.length >= 2,
  });
  return (
    <Modal title="Find that conversation" onClose={onClose} wide>
      <form
        className="search-form"
        onSubmit={(e) => {
          e.preventDefault();
          setQ(input.trim());
        }}
      >
        <div className="search-input">
          <Search size={18} />
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Search your messages…"
            aria-label="Search messages"
            autoFocus
            minLength={2}
            maxLength={150}
            required
          />
        </div>
        <button className="button primary">Search</button>
      </form>
      <div className="search-results">
        {!q ? (
          <Empty
            title="Good ideas are worth finding."
            description="Search messages in your conversations. Try a phrase, a project, or a word you remember."
          />
        ) : result.isPending ? (
          <Loading text="Looking through your conversations…" />
        ) : result.isError ? (
          <ErrorState error={result.error} retry={result.refetch} />
        ) : result.data.messages.length === 0 ? (
          <Empty
            title="No matches just yet"
            description="Try a different word or a shorter phrase."
          />
        ) : (
          <>
            <p className="result-count">
              {result.data.messages.length} results
              {result.data.messages.length === 50 ? ' · Showing the latest 50' : ''}
            </p>
            {result.data.messages.map((m) => (
              <button
                key={m.id}
                className="search-result"
                onClick={() => {
                  navigate(`/app/${m.conversation_id}`);
                  onClose();
                }}
              >
                <Avatar user={m.sender} size="sm" />
                <span>
                  <strong>
                    {m.sender.display_name}
                    <time>{new Date(m.created_at).toLocaleDateString()}</time>
                  </strong>
                  <p>{m.body}</p>
                  <small>
                    Open conversation <ArrowUpRight size={12} />
                  </small>
                </span>
              </button>
            ))}
          </>
        )}
      </div>
    </Modal>
  );
}
