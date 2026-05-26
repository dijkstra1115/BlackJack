import { createServer } from './net/server.js';

const PORT = Number(process.env.PORT ?? 3001);

const handles = createServer();
handles.listen(PORT).then(({ port }) => {
  console.log(`Blackjack server listening on http://localhost:${port}`);
  console.log(`Socket.io accepting connections on the same port.`);
});

const shutdown = async (signal: string) => {
  console.log(`\nReceived ${signal}, shutting down…`);
  await handles.close();
  process.exit(0);
};
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
