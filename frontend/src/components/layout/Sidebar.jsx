import { NavLink } from 'react-router-dom';
import {
  Hash,
  LockKeyhole,
  Plus,
  ChevronDown,
  Search,
  Bell,
  MessageSquare,
  Settings,
  X,
  Compass,
  ArrowUpRight,
} from 'lucide-react';
import { Brand } from '../common/Brand';
import { Avatar } from '../common/Avatar';
import { useAuth } from '../../stores/auth';
import { useUI } from '../../stores/ui';
import { conversationName, conversationPeer } from '../../utils/conversations';
export function Sidebar({
  conversations,
  onCreate,
  onSearch,
  onSettings,
  onNotifications,
  onBrowse,
  notificationCount = 0,
}) {
  const user = useAuth((s) => s.user),
    open = useUI((s) => s.sidebarOpen);
  const close = () => useUI.getState().setSidebar(false);
  const channels = conversations.filter((c) => c.type === 'channel' && c.is_member);
  const directs = conversations.filter((c) => c.type !== 'channel');
  return (
    <>
      <button
        className={`sidebar-backdrop ${open ? 'is-open' : ''}`}
        onClick={close}
        aria-label="Close navigation"
      />
      <aside className={`sidebar ${open ? 'is-open' : ''}`}>
        <div className="sidebar-brand">
          <Brand />
          <button className="icon-button mobile-only" onClick={close} aria-label="Close navigation">
            <X size={19} />
          </button>
        </div>
        <div className="workspace-label">
          <span className="workspace-icon">P</span>
          <div>
            <strong>Pulse workspace</strong>
            <span>Make good things happen</span>
          </div>
          <ChevronDown size={14} />
        </div>
        <nav aria-label="Workspace">
          <button className="nav-tool search-tool" onClick={onSearch}>
            <Search size={17} /> Search anything <kbd>⌘ K</kbd>
          </button>
          <button className="nav-tool" onClick={onNotifications}>
            <Bell size={17} /> Activity{' '}
            {notificationCount > 0 && <span className="unread-badge">{notificationCount}</span>}
          </button>
          <button className="nav-tool" onClick={onBrowse}>
            <Compass size={17} /> Explore channels{' '}
            <ArrowUpRight className="ml-auto opacity-50" size={14} />
          </button>
        </nav>
        <div className="sidebar-scroll">
          <div className="section-label">
            <span>
              CHANNELS <span>{channels.length}</span>
            </span>
            <button
              className="icon-button"
              onClick={() => onCreate('channel')}
              aria-label="Create channel"
            >
              <Plus size={16} />
            </button>
          </div>
          <nav aria-label="Channels">
            {channels.map((c) => (
              <NavLink
                key={c.id}
                to={`/app/${c.id}`}
                className={({ isActive }) => `conversation-link ${isActive ? 'active' : ''}`}
                onClick={close}
              >
                {c.is_private ? <LockKeyhole size={16} /> : <Hash size={17} />}
                <span>{c.name}</span>
                {c.unread_count > 0 && <span className="unread-badge">{c.unread_count}</span>}
              </NavLink>
            ))}
            <button className="conversation-link add-channel" onClick={() => onCreate('channel')}>
              <Plus size={16} />
              <span>Add a channel</span>
            </button>
          </nav>
          <div className="section-label dm-label">
            <span>
              DIRECT MESSAGES <span>{directs.length}</span>
            </span>
            <button
              className="icon-button"
              onClick={() => onCreate('direct')}
              aria-label="New direct message"
            >
              <Plus size={16} />
            </button>
          </div>
          <nav aria-label="Direct messages">
            {directs.map((c) => (
              <NavLink
                key={c.id}
                to={`/app/${c.id}`}
                className={({ isActive }) =>
                  `conversation-link dm-link ${isActive ? 'active' : ''}`
                }
                onClick={close}
              >
                {c.type === 'direct' ? (
                  <Avatar user={conversationPeer(c, user.id)} size="sm" presence />
                ) : (
                  <span className="group-icon">
                    <MessageSquare size={15} />
                  </span>
                )}
                <span>{conversationName(c, user.id)}</span>
                {c.unread_count > 0 && <span className="unread-badge">{c.unread_count}</span>}
              </NavLink>
            ))}
          </nav>
        </div>
        <div className="sidebar-note">
          <span className="note-spark">✧</span>
          <div>
            A little more connected.<p>Great teams start with a hello.</p>
          </div>
        </div>
        <button className="sidebar-profile" onClick={onSettings}>
          <Avatar user={user} presence />
          <span>
            <strong>{user.display_name}</strong>
            <small>Personal settings</small>
          </span>
          <Settings size={17} />
        </button>
      </aside>
    </>
  );
}
