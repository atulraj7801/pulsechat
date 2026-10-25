import { AlertCircle, MessageCircle, RefreshCw } from 'lucide-react';
export function Loading({ text = 'Getting things ready…' }) {
  return (
    <div className="state" role="status">
      <span className="loader" />
      <p>{text}</p>
    </div>
  );
}
export function ErrorState({ error, retry }) {
  return (
    <div className="state" role="alert">
      <AlertCircle size={32} />
      <h3>Let’s try that again</h3>
      <p>{error?.message || 'Something went wrong.'}</p>
      {retry && (
        <button className="button secondary" onClick={retry}>
          <RefreshCw size={16} /> Try again
        </button>
      )}
    </div>
  );
}
export function Empty({ title, description, children }) {
  return (
    <div className="state">
      <span className="empty-icon">
        <MessageCircle size={30} />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
      {children}
    </div>
  );
}
export function MessageSkeleton() {
  return (
    <div className="space-y-7 p-8" role="status" aria-label="Loading messages">
      {[1, 2, 3, 4].map((i) => (
        <div className="flex gap-3" key={i}>
          <div className="skeleton h-10 w-10 rounded-xl" />
          <div className="flex-1 space-y-2">
            <div className="skeleton h-3 w-32" />
            <div className="skeleton h-4 max-w-lg" />
            <div className="skeleton h-4 w-2/3" />
          </div>
        </div>
      ))}
    </div>
  );
}
