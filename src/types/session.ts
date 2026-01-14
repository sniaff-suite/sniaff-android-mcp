export enum SessionState {
  IDLE = 'IDLE',
  CREATE_WORKSPACE = 'CREATE_WORKSPACE',
  START_MITM = 'START_MITM',
  START_EMULATOR = 'START_EMULATOR',
  WAIT_BOOT = 'WAIT_BOOT',
  CONFIGURE_PROXY = 'CONFIGURE_PROXY',
  READY = 'READY',
  ERROR = 'ERROR',
  STOPPED = 'STOPPED',
}

export interface SessionMeta {
  sessionId: string;
  avdName: string;
  mitmPort: number;
  emulatorPort: number;
  adbPort: number;
  createdAt: string;
  state: SessionState;
  workspacePath: string;
}

export interface Session extends SessionMeta {
  mitmPid: number | null;
  emulatorPid: number | null;
}

export interface SessionStartResult {
  sessionId: string;
  workspacePath: string;
  mitmPort: number;
  emulatorPort: number;
  adbPort: number;
  proxyConfigured: boolean;
  state: SessionState;
  warnings?: string[];
}
