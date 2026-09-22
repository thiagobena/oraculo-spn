import { FastifyInstance } from 'fastify';
import path from 'node:path';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { prisma } from '../db/prisma.js';
import { parseFileContent } from '../parsers/fileParsers.js';
import { AuditService } from '../services/AuditService.js';

const UPLOAD_DIR = path.resolve(process.env.UPLOAD_PATH || './uploads');

const ALLOWED_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg',
  '.pdf', '.docx', '.xlsx', '.xls', '.csv', '.txt', '.json', '.md'
]);

export function registerFilesRoutes(fastify: FastifyInstance) {
  fastify.post('/api/files', async (req, reply) => {
    const data = await req.file();
    if (!data) {
      return reply.status(400).send({ success: false, error: 'Nenhum arquivo enviado' });
    }

    const fileExt = path.extname(data.filename).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(fileExt)) {
      return reply.status(400).send({
        success: false,
        error: `Formato de arquivo não permitido (${fileExt}). Tipos aceitos: imagens, PDF, DOCX, XLSX, CSV, TXT, JSON, MD.`
      });
    }

    const { conversation_id, client_id, client_name } = data.fields as any;
    const clientIdStr = client_id?.value || 'anonymous';
    const clientNameStr = client_name?.value || 'Usuário';

    await fs.mkdir(UPLOAD_DIR, { recursive: true });

    const safeBaseName = path.basename(data.filename).replace(/[^a-zA-Z0-9._-]/g, '_');
    const uniqueFilename = `${Date.now()}-${crypto.randomUUID()}${fileExt}`;
    const targetFilePath = path.join(UPLOAD_DIR, uniqueFilename);

    const buffer = await data.toBuffer();
    await fs.writeFile(targetFilePath, buffer);

    const attachment = await prisma.attachment.create({
      data: {
        conversation_id: conversation_id?.value || null,
        filename: uniqueFilename,
        original_name: safeBaseName,
        mime_type: data.mimetype,
        file_size: buffer.length,
        file_path: targetFilePath,
        status: 'processing',
      },
    });

    const parseRes = await parseFileContent(targetFilePath, data.mimetype);

    const updatedAttachment = await prisma.attachment.update({
      where: { id: attachment.id },
      data: {
        extracted_text: parseRes.text,
        status: 'ready',
      },
    });

    AuditService.log({
      clientId: clientIdStr,
      clientName: clientNameStr,
      action: 'file.uploaded',
      conversationId: conversation_id?.value,
      details: { filename: safeBaseName, mime_type: data.mimetype, size: buffer.length },
    });

    return reply.send({
      success: true,
      attachment: {
        id: updatedAttachment.id,
        filename: updatedAttachment.filename,
        original_name: updatedAttachment.original_name,
        mime_type: updatedAttachment.mime_type,
        file_size: updatedAttachment.file_size,
        status: updatedAttachment.status,
        extracted_text: updatedAttachment.extracted_text || undefined,
      },
    });
  });

  fastify.get('/api/files/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const attachment = await prisma.attachment.findUnique({ where: { id } });
    if (!attachment) {
      return reply.status(404).send({ success: false, error: 'Arquivo não encontrado' });
    }
    return reply.send({ success: true, attachment });
  });

  fastify.get('/api/files/:id/raw', async (req, reply) => {
    const { id } = req.params as { id: string };
    const attachment = await prisma.attachment.findUnique({ where: { id } });
    if (!attachment) {
      return reply.status(404).send({ success: false, error: 'Arquivo não encontrado' });
    }

    // Path traversal check
    const resolvedPath = path.resolve(attachment.file_path);
    if (!resolvedPath.startsWith(UPLOAD_DIR)) {
      return reply.status(403).send({ success: false, error: 'Acesso a caminho de arquivo não autorizado' });
    }

    try {
      const buffer = await fs.readFile(resolvedPath);
      const isImage = attachment.mime_type.startsWith('image/');
      
      // Stored XSS Prevention Headers
      reply.header('X-Content-Type-Options', 'nosniff');
      reply.header('Content-Security-Policy', "default-src 'none'");
      reply.header('Content-Disposition', isImage ? 'inline' : `attachment; filename="${attachment.original_name}"`);
      reply.type(attachment.mime_type);
      
      return reply.send(buffer);
    } catch (err) {
      return reply.status(404).send({ success: false, error: 'Arquivo não encontrado no disco' });
    }
  });
}


