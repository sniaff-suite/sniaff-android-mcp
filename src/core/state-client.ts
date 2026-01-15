import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '../utils/logger.js';

const STATE_FILE = 'state.json';

export type SessionStatus = 'active' | 'stopping' | 'stopped';

export interface AndroidState {
  status: 'pending' | 'starting' | 'ready' | 'stopped' | 'error';
  emulatorPort?: number;
  adbPort?: number;
  pid?: number;
  error?: string;
}

export interface SessionState {
  sessionId: string;
  type: string;
  status: SessionStatus;
  createdAt: string;
  stoppedAt?: string;
  android?: AndroidState;
  mitm?: unknown;
}

/**
 * Client for reading/writing to the shared session state file.
 * This allows coordination between sniaff-core-mcp, sniaff-android-mcp, and sniaff-mitmdump-mcp.
 */
export class StateClient {
  constructor(
    private sessionsDir: string,
    private logger: Logger
  ) {}

  private getStatePath(sessionId: string): string {
    return path.join(this.sessionsDir, sessionId, STATE_FILE);
  }

  getSessionDir(sessionId: string): string {
    return path.join(this.sessionsDir, sessionId);
  }

  getAndroidDir(sessionId: string): string {
    return path.join(this.sessionsDir, sessionId, 'android');
  }

  async read(sessionId: string): Promise<SessionState | null> {
    const statePath = this.getStatePath(sessionId);
    try {
      const content = await fs.promises.readFile(statePath, 'utf-8');
      return JSON.parse(content) as SessionState;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      this.logger.error('Failed to read session state', { sessionId, error: String(error) });
      return null;
    }
  }

  async updateAndroid(sessionId: string, android: Partial<AndroidState>): Promise<SessionState | null> {
    const statePath = this.getStatePath(sessionId);

    try {
      // Read current state
      const content = await fs.promises.readFile(statePath, 'utf-8');
      const current = JSON.parse(content) as SessionState;

      // Merge android state
      const updated: SessionState = {
        ...current,
        android: { ...current.android, ...android } as AndroidState,
      };

      // Write back
      await fs.promises.writeFile(statePath, JSON.stringify(updated, null, 2), 'utf-8');
      this.logger.debug('Updated android state', { sessionId, android });
      return updated;
    } catch (error) {
      this.logger.error('Failed to update android state', { sessionId, error: String(error) });
      return null;
    }
  }

  async sessionExists(sessionId: string): Promise<boolean> {
    const statePath = this.getStatePath(sessionId);
    try {
      await fs.promises.access(statePath);
      return true;
    } catch {
      return false;
    }
  }

  async isSessionActive(sessionId: string): Promise<boolean> {
    const state = await this.read(sessionId);
    return state !== null && state.status === 'active';
  }

  async ensureAndroidDir(sessionId: string): Promise<string> {
    const androidDir = this.getAndroidDir(sessionId);
    await fs.promises.mkdir(androidDir, { recursive: true });
    return androidDir;
  }
}
