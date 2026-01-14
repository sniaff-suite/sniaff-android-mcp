import * as path from 'path';
import { EventEmitter } from 'events';
import { Config } from '../config.js';
import { WorkspaceManager, Workspace } from './workspace-manager.js';
import { ProcessSupervisor } from './process-supervisor.js';
import { MitmAdapter } from '../adapters/mitm-adapter.js';
import { EmulatorAdapter } from '../adapters/emulator-adapter.js';
import { PortFinder } from '../utils/port-finder.js';
import { Logger } from '../utils/logger.js';
import { generateSessionId } from '../utils/id-generator.js';
import { Session, SessionState, SessionStartResult } from '../types/session.js';
import { StartInput } from '../types/schemas.js';
import { SmaliusError, ErrorCode } from '../types/errors.js';

export interface SessionManagerDeps {
  config: Config;
  logger: Logger;
}

export class SessionManager extends EventEmitter {
  private sessions: Map<string, Session> = new Map();
  private config: Config;
  private logger: Logger;
  private workspaceManager: WorkspaceManager;
  private supervisor: ProcessSupervisor;
  private portFinder: PortFinder;
  private mitmAdapter: MitmAdapter;
  private emulatorAdapter: EmulatorAdapter;

  constructor(deps: SessionManagerDeps) {
    super();
    this.config = deps.config;
    this.logger = deps.logger;

    // Initialize components
    this.workspaceManager = new WorkspaceManager(this.config, this.logger);
    this.supervisor = new ProcessSupervisor(this.logger);
    this.portFinder = new PortFinder();

    this.mitmAdapter = new MitmAdapter({
      config: this.config,
      supervisor: this.supervisor,
      portFinder: this.portFinder,
      logger: this.logger,
    });

    this.emulatorAdapter = new EmulatorAdapter({
      config: this.config,
      supervisor: this.supervisor,
      portFinder: this.portFinder,
      logger: this.logger,
    });
  }

  async startSession(input: StartInput): Promise<SessionStartResult> {
    const sessionId = generateSessionId();
    let session: Session | null = null;
    let workspace: Workspace | null = null;
    const warnings: string[] = [];

    this.logger.info('Starting session', { sessionId, avdName: input.avdName });

    try {
      // State: CREATE_WORKSPACE
      this.updateState(sessionId, SessionState.CREATE_WORKSPACE);
      workspace = await this.workspaceManager.create(sessionId);

      session = {
        sessionId,
        avdName: input.avdName,
        mitmPort: 0,
        emulatorPort: 0,
        adbPort: 0,
        createdAt: new Date().toISOString(),
        state: SessionState.CREATE_WORKSPACE,
        workspacePath: workspace.path,
        mitmPid: null,
        emulatorPid: null,
      };
      this.sessions.set(sessionId, session);

      // State: START_MITM
      this.updateState(sessionId, SessionState.START_MITM);
      session.state = SessionState.START_MITM;

      const mitmResult = await this.mitmAdapter.start({
        port: input.mitmPort,
        outputDir: workspace.trafficDir,
        logFile: path.join(workspace.logsDir, 'mitm.log'),
      });
      session.mitmPort = mitmResult.port;
      session.mitmPid = mitmResult.pid;

      // State: START_EMULATOR
      this.updateState(sessionId, SessionState.START_EMULATOR);
      session.state = SessionState.START_EMULATOR;

      const emulatorResult = await this.emulatorAdapter.start({
        avdName: input.avdName,
        port: input.emulatorPort,
        headless: input.headless,
        logFile: path.join(workspace.logsDir, 'emulator.log'),
      });
      session.emulatorPort = emulatorResult.consolePort;
      session.adbPort = emulatorResult.adbPort;
      session.emulatorPid = emulatorResult.pid;

      // State: WAIT_BOOT
      this.updateState(sessionId, SessionState.WAIT_BOOT);
      session.state = SessionState.WAIT_BOOT;

      await this.emulatorAdapter.waitForBoot(session.adbPort, input.bootTimeout);

      // State: CONFIGURE_PROXY (best-effort)
      this.updateState(sessionId, SessionState.CONFIGURE_PROXY);
      session.state = SessionState.CONFIGURE_PROXY;

      let proxyConfigured = false;
      try {
        // 10.0.2.2 is the Android emulator's alias for the host's localhost
        await this.emulatorAdapter.setProxy(session.adbPort, '10.0.2.2', session.mitmPort);
        proxyConfigured = true;
      } catch (error) {
        this.logger.warn('Proxy configuration failed (best-effort)', {
          error: error instanceof Error ? error.message : String(error),
        });
        warnings.push('DEVICE_PROXY_CONFIG_FAILED');
      }

      // State: READY
      this.updateState(sessionId, SessionState.READY);
      session.state = SessionState.READY;

      // Update meta.json with final state
      await this.workspaceManager.updateMeta(sessionId, {
        sessionId: session.sessionId,
        avdName: session.avdName,
        mitmPort: session.mitmPort,
        emulatorPort: session.emulatorPort,
        adbPort: session.adbPort,
        createdAt: session.createdAt,
        state: session.state,
        workspacePath: session.workspacePath,
      });

      this.logger.info('Session started successfully', {
        sessionId,
        mitmPort: session.mitmPort,
        emulatorPort: session.emulatorPort,
        proxyConfigured,
      });

      const result: SessionStartResult = {
        sessionId,
        workspacePath: session.workspacePath,
        mitmPort: session.mitmPort,
        emulatorPort: session.emulatorPort,
        adbPort: session.adbPort,
        proxyConfigured,
        state: SessionState.READY,
      };

      if (warnings.length > 0) {
        result.warnings = warnings;
      }

      return result;
    } catch (error) {
      // Rollback on any failure
      this.logger.error('Session start failed, rolling back', {
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      });

      await this.rollback(session);

      if (error instanceof SmaliusError) {
        throw error;
      }

      throw new SmaliusError(
        ErrorCode.INTERNAL_ERROR,
        `Session start failed: ${error instanceof Error ? error.message : String(error)}`,
        { sessionId }
      );
    }
  }

  private updateState(sessionId: string, state: SessionState): void {
    this.emit('stateChange', sessionId, state);
    this.logger.info('State change', { sessionId, state });
  }

  private async rollback(session: Session | null): Promise<void> {
    if (!session) return;

    this.logger.info('Rolling back session', { sessionId: session.sessionId });
    session.state = SessionState.ERROR;

    // Stop emulator if running
    if (session.emulatorPid) {
      try {
        await this.emulatorAdapter.stop(session.emulatorPid);
      } catch (error) {
        this.logger.error('Failed to stop emulator during rollback', {
          pid: session.emulatorPid,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Stop MITM if running
    if (session.mitmPid) {
      try {
        await this.mitmAdapter.stop(session.mitmPid);
      } catch (error) {
        this.logger.error('Failed to stop MITM during rollback', {
          pid: session.mitmPid,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Update meta to ERROR state (keep workspace for debugging)
    try {
      await this.workspaceManager.updateMeta(session.sessionId, {
        state: SessionState.ERROR,
      });
    } catch {
      // Ignore meta update errors during rollback
    }

    this.sessions.delete(session.sessionId);
  }

  getSession(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId);
  }

  getAllSessions(): Session[] {
    return Array.from(this.sessions.values());
  }

  async stopSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new SmaliusError(ErrorCode.SESSION_NOT_FOUND, `Session '${sessionId}' not found`);
    }

    this.logger.info('Stopping session', { sessionId });

    // Clear proxy first (best-effort)
    if (session.adbPort) {
      try {
        await this.emulatorAdapter.clearProxy(session.adbPort);
      } catch {
        // Ignore proxy clear errors
      }
    }

    // Stop emulator
    if (session.emulatorPid) {
      await this.emulatorAdapter.stop(session.emulatorPid);
    }

    // Stop MITM
    if (session.mitmPid) {
      await this.mitmAdapter.stop(session.mitmPid);
    }

    // Cleanup workspace directory
    await this.workspaceManager.cleanup(sessionId);

    this.sessions.delete(sessionId);
    this.logger.info('Session stopped', { sessionId });
  }
}
