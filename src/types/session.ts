export enum SessionState {
  IDLE = 'IDLE',
  SETUP_AVD = 'SETUP_AVD',
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

export interface AvdSetupInfo {
  avdName: string;
  wasCreated: boolean;
  wasRooted: boolean;
  systemImage: string;
}

export interface SessionStartResult {
  sessionId: string;
  workspacePath: string;
  mitmPort: number;
  emulatorPort: number;
  adbPort: number;
  proxyConfigured: boolean;
  state: SessionState;
  avdSetup?: AvdSetupInfo;
  warnings?: string[];
}
