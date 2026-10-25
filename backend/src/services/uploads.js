import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { createFileStorage } from './file-storage.js';
import { fileTypeFromBuffer } from 'file-type';
import { assert } from '../utils/errors.js';
export function uploadService({ repo, conversations, env }) {
  const storage = createFileStorage(env);
  const sign = (id, userId, purpose, seconds) =>
    jwt.sign({ attachment_id: id, purpose }, env.UPLOAD_SECRET, {
      subject: userId,
      issuer: 'pulsechat-uploads',
      audience: 'pulsechat-files',
      expiresIn: seconds,
      algorithm: 'HS256',
    });
  const verify = (token, purpose) => {
    let payload;
    try {
      payload = jwt.verify(token, env.UPLOAD_SECRET, {
        issuer: 'pulsechat-uploads',
        audience: 'pulsechat-files',
        algorithms: ['HS256'],
      });
    } catch {
      assert(false, 401, 'INVALID_TICKET', 'This file link expired. Please try again.');
    }
    assert(payload.purpose === purpose, 403, 'INVALID_TICKET', 'Invalid file ticket.');
    return payload;
  };
  async function authorized(id, userId) {
    const file = await repo.attachment(id);
    assert(file, 404, 'NOT_FOUND', 'File not found.');
    await conversations.membership(file.conversation_id, userId);
    return file;
  }
  return {
    async presign(userId, data) {
      await conversations.membership(data.conversation_id, userId);
      const file = await repo.createAttachment({
        ...data,
        user_id: userId,
        storage_key: randomUUID(),
      });
      return {
        attachment_id: file.id,
        upload_url: `/api/uploads/${file.id}?ticket=${sign(file.id, userId, 'upload', 300)}`,
        expires_in: 300,
      };
    },
    async upload(id, token, bytes) {
      const payload = verify(token, 'upload');
      assert(payload.attachment_id === id, 403, 'INVALID_TICKET', 'Invalid file ticket.');
      const file = await authorized(id, payload.sub);
      assert(
        Buffer.isBuffer(bytes) && bytes.length === file.size,
        400,
        'FILE_SIZE_MISMATCH',
        'File size does not match the upload request.',
      );
      let detected;
      try {
        detected = await fileTypeFromBuffer(bytes);
      } catch {
        assert(false, 400, 'INVALID_FILE_TYPE', 'The file is incomplete or malformed.');
      }
      if (file.mime_type === 'text/plain') {
        assert(
          !detected && !bytes.includes(0),
          400,
          'INVALID_FILE_TYPE',
          'This file is not plain text.',
        );
        try {
          new TextDecoder('utf-8', { fatal: true }).decode(bytes);
        } catch {
          assert(false, 400, 'INVALID_FILE_TYPE', 'Text files must use UTF-8.');
        }
      } else
        assert(
          detected?.mime === file.mime_type,
          400,
          'INVALID_FILE_TYPE',
          'The file contents do not match its MIME type.',
        );
      let written = false;
      try {
        await repo.transaction(async (trx) => {
          const locked = await repo.lockAttachment(id, trx);
          assert(
            !locked.uploaded_at,
            409,
            'ALREADY_UPLOADED',
            'This upload was already completed.',
          );
          await conversations.membership(file.conversation_id, payload.sub, trx);
          await storage.put(file.storage_key, bytes, file.mime_type);
          written = true;
          await repo.uploaded(id, trx);
        });
      } catch (err) {
        if (written) await storage.remove(file.storage_key).catch(() => {});
        throw err;
      }
      return { attachment_id: id };
    },
    async downloadUrl(id, userId) {
      const file = await authorized(id, userId);
      assert(
        file.uploaded_at && file.message_id,
        404,
        'NOT_FOUND',
        'File is not attached to a message.',
      );
      const message = await repo.message(file.message_id);
      assert(message && !message.deleted_at, 404, 'NOT_FOUND', 'This file is no longer available.');
      const url = `/api/files/${id}?ticket=${sign(id, userId, 'download', 60)}`;
      return {
        url,
        preview_url: file.mime_type.startsWith('image/') ? `${url}&inline=1` : null,
        expires_in: 60,
      };
    },
    async download(id, token) {
      const payload = verify(token, 'download');
      assert(payload.attachment_id === id, 403, 'INVALID_TICKET', 'Invalid file ticket.');
      const file = await authorized(id, payload.sub);
      const message = file.message_id && (await repo.message(file.message_id));
      assert(
        file.uploaded_at && message && !message.deleted_at,
        404,
        'NOT_FOUND',
        'File unavailable.',
      );
      return { ...file, bytes: await storage.get(file.storage_key) };
    },
  };
}
