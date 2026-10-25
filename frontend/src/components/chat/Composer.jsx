import { useRef, useState } from 'react';
import { ArrowUp, Paperclip, Smile, X, CornerUpLeft, LoaderCircle } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../services/api';
export function Composer({
  conversation,
  name,
  onSend,
  reply,
  onClearReply,
  onTyping = () => {},
  disabled,
}) {
  const [body, setBody] = useState(''),
    [files, setFiles] = useState([]),
    [uploading, setUploading] = useState(false),
    [emoji, setEmoji] = useState(false),
    fileRef = useRef(),
    textRef = useRef();
  async function upload(e) {
    const incoming = [...e.target.files];
    e.target.value = '';
    if (files.length + incoming.length > 5)
      return toast.error('Attach up to five files per message.');
    setUploading(true);
    try {
      for (const file of incoming) {
        if (file.size > 10 * 1024 * 1024) throw new Error('Files must be smaller than 10 MB.');
        const ticket = await api('/uploads/presigned-url', {
          method: 'POST',
          body: {
            conversation_id: conversation.id,
            filename: file.name,
            mime_type: file.type || 'text/plain',
            size: file.size,
          },
        });
        const response = await fetch(ticket.upload_url, {
          method: 'PUT',
          headers: { 'Content-Type': file.type || 'text/plain' },
          body: file,
        });
        if (!response.ok)
          throw new Error('Upload failed. Please check the file type and try again.');
        setFiles((old) => [...old, { id: ticket.attachment_id, filename: file.name }]);
      }
    } catch (err) {
      toast.error(err.message);
    } finally {
      setUploading(false);
    }
  }
  function send() {
    if ((!body.trim() && !files.length) || uploading || disabled) return;
    onSend(
      { body: body.trim(), attachment_ids: files.map((f) => f.id), reply_to_id: reply?.id || null },
      reply,
    );
    setBody('');
    setFiles([]);
    setEmoji(false);
    onClearReply();
    onTyping(false);
    textRef.current?.focus();
  }
  return (
    <div className="composer-area">
      {reply && (
        <div className="composer-reply">
          <CornerUpLeft size={15} />
          <span>
            Replying to <strong>{reply.sender.display_name}</strong>
            <small>{reply.body}</small>
          </span>
          <button className="icon-button" onClick={onClearReply} aria-label="Cancel reply">
            <X size={15} />
          </button>
        </div>
      )}
      <div className="composer-box">
        <textarea
          ref={textRef}
          aria-label={`Message ${name}`}
          placeholder={`Message ${conversation.type === 'channel' ? '#' : ''}${name}`}
          rows={2}
          value={body}
          maxLength={10000}
          onChange={(e) => {
            setBody(e.target.value);
            onTyping(!!e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send();
            }
          }}
          disabled={disabled}
        />
        {files.length > 0 && (
          <div className="composer-files">
            {files.map((f) => (
              <span key={f.id}>
                <Paperclip size={12} />
                {f.filename}
                <button
                  aria-label={`Remove ${f.filename}`}
                  onClick={() => setFiles(files.filter((a) => a.id !== f.id))}
                >
                  <X size={13} />
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="composer-toolbar">
          <div className="flex gap-1">
            <input
              ref={fileRef}
              type="file"
              multiple
              className="hidden"
              accept="image/png,image/jpeg,image/webp,image/gif,application/pdf,text/plain"
              onChange={upload}
            />
            <button
              className="icon-button"
              aria-label="Attach a file"
              onClick={() => fileRef.current.click()}
              disabled={uploading || disabled}
            >
              {uploading ? (
                <LoaderCircle size={18} className="animate-spin" />
              ) : (
                <Paperclip size={18} />
              )}
            </button>
            <div className="relative">
              <button
                className="icon-button"
                aria-label="Insert emoji"
                onClick={() => setEmoji(!emoji)}
              >
                <Smile size={18} />
              </button>
              {emoji && (
                <div className="composer-emojis">
                  {['😊', '👋', '✨', '💜', '🎉', '🚀', '👍', '☀️'].map((e) => (
                    <button
                      key={e}
                      onClick={() => {
                        setBody(body + e);
                        setEmoji(false);
                        textRef.current.focus();
                      }}
                    >
                      {e}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <span className="composer-divider" />
            <span className="composer-hint">A little message goes a long way.</span>
          </div>
          <button
            className="send-button"
            onClick={send}
            disabled={(!body.trim() && !files.length) || uploading || disabled}
            aria-label="Send message"
          >
            <ArrowUp size={18} />
          </button>
        </div>
      </div>
      <div className="composer-footer">
        <span>
          <kbd>Enter</kbd> to send · <kbd>Shift + Enter</kbd> for a new line
        </span>
        <span>
          Made for meaningful conversations <span className="text-accent">✧</span>
        </span>
      </div>
    </div>
  );
}
