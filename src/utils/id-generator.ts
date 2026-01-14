import { randomUUID } from 'crypto';

export function generateSessionId(): string {
  const timestamp = Date.now().toString(36);
  const uuid = randomUUID().split('-')[0];
  return `sml-${timestamp}-${uuid}`;
}
