import * as net from 'net';

export class PortFinder {
  async isAvailable(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const server = net.createServer();

      server.once('error', () => resolve(false));
      server.once('listening', () => {
        server.close(() => resolve(true));
      });

      server.listen(port, '127.0.0.1');
    });
  }

  async findAvailable(start: number, end: number): Promise<number> {
    for (let port = start; port <= end; port++) {
      if (await this.isAvailable(port)) {
        return port;
      }
    }
    throw new Error(`No available port in range ${start}-${end}`);
  }

  async findAvailableEven(start: number, end: number): Promise<number> {
    let port = start % 2 === 0 ? start : start + 1;
    while (port <= end) {
      if (await this.isAvailable(port)) {
        return port;
      }
      port += 2;
    }
    throw new Error(`No available even port in range ${start}-${end}`);
  }
}
