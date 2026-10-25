import { SearchDialog } from '../features/search/SearchDialog';
import { Notifications, useNotifications } from '../features/notifications/Notifications';
import { DetailsPanel } from '../components/conversations/DetailsPanel';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Menu, Plus } from 'lucide-react';
import { useConversations } from '../features/conversations/queries';
import { useUI } from '../stores/ui';
import { Sidebar } from '../components/layout/Sidebar';
import { NewConversation } from '../components/conversations/NewConversation';
import { BrowseChannels } from '../components/conversations/BrowseChannels';
import { Settings } from '../components/users/Settings';
import { ChatView } from '../components/chat/ChatView';
import { Empty, ErrorState, Loading } from '../components/common/States';
import { useRealtimeConnection } from '../hooks/useRealtime';
import { useRealtime } from '../stores/realtime';
export function Workspace() {
  useRealtimeConnection();
  const connection = useRealtime((s) => s.status);
  const { conversationId } = useParams(),
    navigate = useNavigate(),
    conversations = useConversations();
  const [modal, setModal] = useState(null),
    [newType, setNewType] = useState('channel');
  const theme = useUI((s) => s.theme),
    detailsOpen = useUI((s) => s.detailsOpen),
    notifications = useNotifications();
  useEffect(() => {
    const key = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setModal('search');
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  useEffect(() => {
    if (!conversationId && conversations.data?.some((c) => c.is_member))
      navigate(
        `/app/${conversations.data.find((c) => c.is_member && c.name === 'general')?.id || conversations.data.find((c) => c.is_member).id}`,
        { replace: true },
      );
  }, [conversationId, conversations.data, navigate]);
  const create = (type) => {
    setNewType(type);
    setModal('new');
  };
  if (conversations.isPending) return <Loading text="Finding your conversations…" />;
  if (conversations.isError)
    return <ErrorState error={conversations.error} retry={conversations.refetch} />;
  return (
    <main className="workspace">
      <Sidebar
        notificationCount={notifications.data?.filter((n) => !n.read_at).length || 0}
        conversations={conversations.data}
        onCreate={create}
        onSettings={() => setModal('settings')}
        onBrowse={() => setModal('browse')}
        onSearch={() => setModal('search')}
        onNotifications={() => setModal('notifications')}
      />
      <div className="workspace-main">
        <div className="workspace-topbar">
          <span>
            <span className={connection === 'connected' ? 'green-dot' : 'connection-dot'} />{' '}
            {connection === 'connected'
              ? 'Your team, in sync'
              : connection === 'offline'
                ? 'Offline · messages can be retried'
                : 'Reconnecting…'}
          </span>
          <span>
            WORKSPACE <span className="topbar-slash">/</span> <strong>Conversations</strong>
          </span>
          <span className="topbar-right">
            A good day to connect <span>✧</span>
          </span>
        </div>
        {conversationId ? (
          <ChatView key={conversationId} id={conversationId} onSearch={() => setModal('search')} />
        ) : (
          <>
            <button
              className="icon-button mobile-only m-4"
              onClick={() => useUI.getState().setSidebar(true)}
              aria-label="Open navigation"
            >
              <Menu />
            </button>
            <Empty
              title="Your next great idea starts here."
              description="Create a channel or say hello to a teammate. This is your space to make things happen."
            >
              <button className="button primary" onClick={() => create('channel')}>
                <Plus size={16} /> Start a conversation
              </button>
              <button className="button secondary" onClick={() => setModal('browse')}>
                Explore channels
              </button>
            </Empty>
          </>
        )}
      </div>
      {detailsOpen && conversationId && <DetailsPanel key={conversationId} id={conversationId} />}{' '}
      {modal === 'search' && <SearchDialog onClose={() => setModal(null)} />}{' '}
      {modal === 'notifications' && <Notifications onClose={() => setModal(null)} />}{' '}
      {modal === 'new' && <NewConversation initialType={newType} onClose={() => setModal(null)} />}{' '}
      {modal === 'settings' && <Settings onClose={() => setModal(null)} />}{' '}
      {modal === 'browse' && (
        <BrowseChannels conversations={conversations.data} onClose={() => setModal(null)} />
      )}
    </main>
  );
}
