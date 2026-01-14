import * as fs from 'fs/promises';
import * as path from 'path';

export interface LoggerOptions {
  logDir: string;
  name: string;
}

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export class Logger {
  private logFile: string;
  private name: string;
  private initialized: boolean = false;

  constructor(options: LoggerOptions) {
    this.name = options.name;
    this.logFile = path.join(options.logDir, `${options.name}.log`);
    this.ensureLogDir(options.logDir);
  }

  private async ensureLogDir(dir: string): Promise<void> {
    try {
      await fs.mkdir(dir, { recursive: true });
      this.initialized = true;
    } catch {
      // Best effort - continue even if we can't create log dir
    }
  }

  private formatMessage(level: LogLevel, message: string, data?: object): string {
    const timestamp = new Date().toISOString();
    const dataStr = data ? ` ${JSON.stringify(data)}` : '';
    return `[${timestamp}] [${level.toUpperCase()}] [${this.name}] ${message}${dataStr}\n`;
  }

  private async write(level: LogLevel, message: string, data?: object): Promise<void> {
    const formatted = this.formatMessage(level, message, data);

    // Write to stderr (MCP requirement - stdout is for JSON-RPC only)
    process.stderr.write(formatted);

    // Append to log file (best effort)
    try {
      await fs.appendFile(this.logFile, formatted);
    } catch {
      // Ignore file write errors
    }
  }

  debug(message: string, data?: object): void {
    this.write('debug', message, data);
  }

  info(message: string, data?: object): void {
    this.write('info', message, data);
  }

  warn(message: string, data?: object): void {
    this.write('warn', message, data);
  }

  error(message: string, data?: object): void {
    this.write('error', message, data);
  }
}
