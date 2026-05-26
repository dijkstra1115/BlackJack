import cors from 'cors';
import express, { type Express } from 'express';
import { createServer as createHttpServer, type Server as HttpServer } from 'node:http';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server as IoServer } from 'socket.io';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from '@blackjack/shared';
import { RoomManager } from './RoomManager.js';
import { registerHandlers } from './socketHandlers.js';

export interface ServerHandles {
  app: Express;
  httpServer: HttpServer;
  io: IoServer<ClientToServerEvents, ServerToClientEvents>;
  manager: RoomManager;
  /** Resolves once the HTTP server is listening on the requested port. */
  listen: (port?: number) => Promise<{ port: number }>;
  close: () => Promise<void>;
}

/**
 * Build the HTTP + Socket.io stack. The HTTP side exposes a tiny health
 * endpoint plus a room-existence check (so the client can confirm a roomId
 * before opening the websocket). All game traffic flows over Socket.io.
 */
export function createServer(): ServerHandles {
  const app = express();
  app.use(cors());
  app.use(express.json());

  const manager = new RoomManager();

  app.get('/health', (_req, res) => {
    res.json({ ok: true, rooms: manager.list().length });
  });

  app.get('/rooms/:id', (req, res) => {
    const room = manager.get(req.params.id);
    if (!room) {
      res.status(404).json({ error: 'room_not_found' });
      return;
    }
    res.json({
      roomId: room.id,
      phase: room.phase,
      seated: room.seats.filter(Boolean).length,
      spectators: [...room.members.values()].filter(m => !m.isSeated()).length,
    });
  });

  // In production, the same server also serves the built React client.
  // This lets us deploy as a single web service (one URL, no CORS hops,
  // no separate static-site config). The client build lives at ../client/dist
  // relative to this file's compile-time location.
  if (process.env.NODE_ENV === 'production' || process.env.SERVE_CLIENT === '1') {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const clientDist = path.resolve(here, '../../../client/dist');
    if (existsSync(clientDist)) {
      app.use(express.static(clientDist));
      // SPA fallback for client-side routes (anything that didn't match an
      // API route or a static file). Avoid hijacking socket.io paths — those
      // are handled by the IoServer attached to httpServer below.
      app.get(/^\/(?!socket\.io|health|rooms\/).*/, (_req, res) => {
        res.sendFile(path.join(clientDist, 'index.html'));
      });
    } else {
      console.warn(`[server] NODE_ENV=production but ${clientDist} not found — ` +
                   `did the client build complete?`);
    }
  }

  const httpServer = createHttpServer(app);
  const io = new IoServer<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    cors: { origin: '*' },
  });

  io.on('connection', (socket) => {
    registerHandlers(io, socket, manager);
  });

  return {
    app,
    httpServer,
    io,
    manager,
    listen: (port = 3001) =>
      new Promise((resolve) => {
        httpServer.listen(port, () => {
          const addr = httpServer.address();
          const bound = typeof addr === 'object' && addr ? addr.port : port;
          resolve({ port: bound });
        });
      }),
    close: () =>
      new Promise((resolve, reject) => {
        io.close((err) => {
          if (err) reject(err);
          else httpServer.close(() => resolve());
        });
      }),
  };
}
