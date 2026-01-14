import * as path from 'path';
import { createWriteStream, WriteStream } from 'fs';
import { Config } from '../config.js';
import { ProcessSupervisor } from '../core/process-supervisor.js';
import { PortFinder } from '../utils/port-finder.js';
import { Logger } from '../utils/logger.js';
import { SniaffError, ErrorCode } from '../types/errors.js';

export interface MitmStartOptions {
  port?: number;
  outputDir: string;
  logFile: string;
}

export interface MitmStartResult {
  pid: number;
  port: number;
}

export interface MitmAdapterDeps {
  config: Config;
  supervisor: ProcessSupervisor;
  portFinder: PortFinder;
  logger: Logger;
}

export class MitmAdapter {
  private config: Config;
  private supervisor: ProcessSupervisor;
  private portFinder: PortFinder;
  private logger: Logger;

  constructor(deps: MitmAdapterDeps) {
    this.config = deps.config;
    this.supervisor = deps.supervisor;
    this.portFinder = deps.portFinder;
    this.logger = deps.logger;
  }

  async start(options: MitmStartOptions): Promise<MitmStartResult> {
    let port = options.port || this.config.defaultMitmPort;
    let portFound = false;

    // Try to find an available port
    for (let attempt = 0; attempt < this.config.portRetryAttempts; attempt++) {
      if (await this.portFinder.isAvailable(port)) {
        portFound = true;
        break;
      }
      this.logger.info('MITM port busy, trying next', { port, attempt });
      port++;
    }

    if (!portFound) {
      // Try to find any available port in a wider range
      try {
        port = await this.portFinder.findAvailable(
          this.config.defaultMitmPort,
          this.config.defaultMitmPort + 100
        );
      } catch {
        throw new SniaffError(
          ErrorCode.MITM_PORT_UNAVAILABLE,
          `No available port found starting from ${options.port || this.config.defaultMitmPort}`,
          { attemptedPort: port }
        );
      }
    }

    // Build mitmdump arguments
    const dumpFile = path.join(options.outputDir, 'flows.dump');
    const args = [
      '--listen-port',
      String(port),
      '--save-stream-file',
      dumpFile,
      '--set',
      'flow_detail=2',
    ];

    // Create log file stream
    let logStream: WriteStream;
    try {
      logStream = createWriteStream(options.logFile, { flags: 'a' });
    } catch (err) {
      throw new SniaffError(
        ErrorCode.MITM_START_FAILED,
        `Failed to create log file: ${options.logFile}`,
        { error: String(err) }
      );
    }

    try {
      const info = await this.supervisor.spawn(this.config.mitmproxyPath, args, {
        onStdout: (data) => logStream.write(data),
        onStderr: (data) => logStream.write(data),
      });

      // Wait a moment and verify it's running
      await this.delay(500);

      if (!this.supervisor.isRunning(info.pid)) {
        throw new SniaffError(ErrorCode.MITM_START_FAILED, 'mitmdump process exited immediately', {
          port,
        });
      }

      this.logger.info('MITM proxy started', { pid: info.pid, port });

      return { pid: info.pid, port };
    } catch (error) {
      logStream.end();
      if (error instanceof SniaffError) throw error;

      const err = error as Error & { code?: string };
      if (err.code === 'ENOENT') {
        throw new SniaffError(
          ErrorCode.MITMDUMP_NOT_FOUND,
          `mitmdump not found at: ${this.config.mitmproxyPath}`,
          { path: this.config.mitmproxyPath }
        );
      }

      throw new SniaffError(
        ErrorCode.MITM_START_FAILED,
        `Failed to start mitmdump: ${err.message}`,
        { port, command: this.config.mitmproxyPath }
      );
    }
  }

  async stop(pid: number): Promise<void> {
    await this.supervisor.kill(pid);
    this.logger.info('MITM proxy stopped', { pid });
  }

  healthCheck(pid: number): boolean {
    return this.supervisor.isRunning(pid);
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
