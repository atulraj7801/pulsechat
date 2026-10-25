import { AudioLines } from 'lucide-react';
export function Brand({ compact = false }) {
  return (
    <div className="brand">
      <span className="brand-mark">
        <AudioLines size={23} strokeWidth={2.5} />
      </span>
      {!compact && (
        <span>
          Pulse<span className="font-normal">Chat</span>
          <span className="brand-dot">.</span>
        </span>
      )}
    </div>
  );
}
