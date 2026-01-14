import * as path from 'path';
import * as os from 'os';

export interface Config {
  workspacesDir: string;
  logsDir: string;
  mitmproxyPath: string;
  emulatorPath: string;
  adbPath: string;
  defaultMitmPort: number;
  defaultEmulatorPort: number;
  defaultBootTimeout: number;
  bootPollInterval: number;
  maxSessions: number;
  portRetryAttempts: number;
}

export function loadConfig(): Config {
  return {
    workspacesDir:
      process.env.SMALIUS_WORKSPACES_DIR ||
      path.join(os.homedir(), '.smalius', 'workspaces'),
    logsDir:
      process.env.SMALIUS_LOGS_DIR || path.join(os.homedir(), '.smalius', 'logs'),
    mitmproxyPath: process.env.SMALIUS_MITMDUMP_PATH || 'mitmdump',
    emulatorPath: process.env.SMALIUS_EMULATOR_PATH || 'emulator',
    adbPath: process.env.SMALIUS_ADB_PATH || 'adb',
    defaultMitmPort: parseInt(process.env.SMALIUS_MITM_PORT || '8080', 10),
    defaultEmulatorPort: parseInt(process.env.SMALIUS_EMULATOR_PORT || '5554', 10),
    defaultBootTimeout: parseInt(process.env.SMALIUS_BOOT_TIMEOUT || '120000', 10),
    bootPollInterval: parseInt(process.env.SMALIUS_BOOT_POLL_INTERVAL || '2000', 10),
    maxSessions: parseInt(process.env.SMALIUS_MAX_SESSIONS || '10', 10),
    portRetryAttempts: parseInt(process.env.SMALIUS_PORT_RETRY_ATTEMPTS || '5', 10),
  };
}
