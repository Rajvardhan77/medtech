import { Request } from 'express';
import { prisma } from '../prisma';

export interface AuditLogOptions {
  userId?: string | null;
  action: 'CREATE' | 'READ' | 'UPDATE' | 'DELETE' | 'EXPORT' | 'VERIFY';
  entityType: string;
  entityId: string;
  fieldChanged?: string | null;
  oldValue?: string | null;
  newValue?: string | null;
  ipAddress?: string | null;
}

export async function logAudit(options: AuditLogOptions) {
  try {
    await prisma.auditLog.create({
      data: {
        user_id: options.userId ?? null,
        action: options.action,
        entity_type: options.entityType,
        entity_id: options.entityId,
        field_changed: options.fieldChanged ?? null,
        old_value: options.oldValue ?? null,
        new_value: options.newValue ?? null,
        ip_address: options.ipAddress ?? null,
      },
    });
  } catch (error) {
    console.error('[AuditLog Error] Failed to write audit trail:', error);
  }
}

export function extractClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  return req.socket.remoteAddress || 'unknown';
}
