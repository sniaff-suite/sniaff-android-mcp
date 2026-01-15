import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { SessionManager } from '../core/session-manager.js';
import { Config } from '../config.js';
import { SniaffError, ErrorCode } from '../types/errors.js';
import { exec } from 'child_process';
import { promisify } from 'util';

const execPromise = promisify(exec);

export function registerSetProxyTool(
  server: McpServer,
  sessionManager: SessionManager,
  config: Config
): void {
  server.tool(
    'sniaff.set_proxy',
    'Configure HTTP proxy settings on the Android emulator. Useful for routing traffic through a MITM proxy like mitmproxy or Burp Suite.',
    {
      sessionId: z.string().min(1).describe('The session ID returned by sniaff.start'),
      host: z
        .string()
        .min(1)
        .describe('Proxy host address (e.g., "10.0.2.2" for host machine from emulator, or "127.0.0.1")'),
      port: z
        .number()
        .int()
        .min(1)
        .max(65535)
        .describe('Proxy port number (e.g., 8080 for mitmproxy, 8082 for Burp)'),
    },
    async (args) => {
      try {
        const session = sessionManager.getSession(args.sessionId);
        if (!session) {
          throw new SniaffError(
            ErrorCode.SESSION_NOT_FOUND,
            `Session '${args.sessionId}' not found`
          );
        }

        const deviceId = `emulator-${session.adbPort - 1}`;

        // Set the global HTTP proxy
        const command = `${config.adbPath} -s ${deviceId} shell settings put global http_proxy ${args.host}:${args.port}`;

        await execPromise(command, { timeout: 10000 });

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  ok: true,
                  proxy: {
                    host: args.host,
                    port: args.port,
                  },
                  message: `Proxy configured: ${args.host}:${args.port}`,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        const sniaffError =
          error instanceof SniaffError
            ? error
            : new SniaffError(
                ErrorCode.PROXY_CONFIG_FAILED,
                error instanceof Error ? error.message : String(error),
                { originalError: error instanceof Error ? error.stack : undefined }
              );

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  ok: false,
                  error: sniaffError.toJSON(),
                },
                null,
                2
              ),
            },
          ],
          isError: true,
        };
      }
    }
  );
}
