import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { File, Download } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../services/api';
export function Attachment({ file }) {
  const isImage = file.mime_type.startsWith('image/');
  const [failed, setFailed] = useState(false);
  const preview = useQuery({ queryKey: ['attachment-preview', file.id], queryFn: () => api(`/attachments/${file.id}/download-url`), enabled: isImage, staleTime: 45000 });
  async function download() { try { const result = await api(`/attachments/${file.id}/download-url`); window.location.assign(result.url); } catch (err) { toast.error(err.message); } }
  return <div className="attachment"><button className="attachment-card" onClick={download}>{isImage && preview.data?.preview_url && !failed ? <img className="image-attachment" src={preview.data.preview_url} alt={file.filename} loading="lazy" onError={() => setFailed(true)}/> : <span className="file-icon"><File size={20}/></span>}<span><strong>{file.filename}</strong><small>{Math.ceil(file.size / 1024)} KB · {preview.isError || failed ? 'Preview unavailable · Download' : 'Download file'}</small></span><Download size={14}/></button></div>;
}
