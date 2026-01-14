import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { Logger } from '../utils/logger.js';

export interface ProcessInfo {
  pid: number;
  command: string;
  args: string[];
  startedAt: Date;
  process: ChildProcess;
}

export interface ProcessOptions {
  cwd?: string;
  env?: Record<string, string>;
  onStdout?: (data: string) => void;
  onStderr?: (data: string) => void;
  onExit?: (code: number | null, signal: string | null) => void;
}

export class ProcessSupervisor extends EventEmitter {
  private processes: Map<number, ProcessInfo> = new Map();
  private logger: Logger;

  constructor(logger: Logger) {
    super();
    this.logger = logger;
    this.setupSignalHandlers();
  }

  async spawn(
    command: string,
    args: string[],
    options: ProcessOptions = {}
  ): Promise<ProcessInfo> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        cwd: options.cwd,
        env: { ...process.env, ...options.env },
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: false,
      });

      if (!child.pid) {
        reject(new Error(`Failed to spawn process: ${command}`));
        return;
      }

      const info: ProcessInfo = {
        pid: child.pid,
        command,
        args,
        startedAt: new Date(),
        process: child,
      };

      this.processes.set(child.pid, info);

      child.stdout?.on('data', (data: Buffer) => {
        const str = data.toString();
        options.onStdout?.(str);
        this.emit('stdout', child.pid, str);
      });

      child.stderr?.on('data', (data: Buffer) => {
        const str = data.toString();
        options.onStderr?.(str);
        this.emit('stderr', child.pid, str);
      });

      child.on('exit', (code, signal) => {
        this.processes.delete(child.pid!);
        options.onExit?.(code, signal);
        this.emit('exit', child.pid, code, signal);
      });

      child.on('error', (error) => {
        this.processes.delete(child.pid!);
        this.emit('error', child.pid, error);
        reject(error);
      });

      // Give process a moment to fail fast
      setTimeout(() => {
        if (child.exitCode === null) {
          resolve(info);
        }
      }, 100);
    });
  }

  async kill(pid: number, signal: NodeJS.Signals = 'SIGTERM'): Promise<void> {
    const info = this.processes.get(pid);
    if (!info) {
      this.logger.warn('Process not found for kill', { pid });
      return;
    }

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        try {
          process.kill(pid, 'SIGKILL');
        } catch {
          // Process may have already exited
        }
        resolve();
      }, 5000);

      info.process.once('exit', () => {
        clearTimeout(timeout);
        resolve();
      });

      try {
        process.kill(pid, signal);
      } catch {
        clearTimeout(timeout);
        resolve();
      }
    });
  }

  isRunning(pid: number): boolean {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  private setupSignalHandlers(): void {
    const cleanup = async () => {
      this.logger.info('Cleaning up all processes');
      for (const [pid] of this.processes) {
        await this.kill(pid);
      }
    };

    process.on('SIGTERM', cleanup);
    process.on('SIGINT', cleanup);
  }
}
