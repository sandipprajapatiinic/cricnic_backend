const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const http = require('http');
const os = require('os');
const cors = require('cors');
const express = require('express');
const { Server } = require('socket.io');
const morgan = require('morgan');
const { connectDb } = require('./src/config/db');
const { buildApiRouter } = require('./src/routes');

const PORT = Number(process.env.PORT) || 3000;
/** Bind address: 0.0.0.0 = all interfaces (LAN/mobile). Override with HOST=127.0.0.1 for localhost-only. */
const HOST = process.env.HOST || '0.0.0.0';

function listLanUrls() {
  const urls = [`http://127.0.0.1:${PORT}`, `http://localhost:${PORT}`];
  if (HOST !== '0.0.0.0' && HOST !== '::') {
    urls.push(`http://${HOST}:${PORT}`);
    return urls;
  }
  try {
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets)) {
      for (const net of nets[name] || []) {
        const v4 = net.family === 'IPv4' || net.family === 4;
        if (v4 && !net.internal) {
          urls.push(`http://${net.address}:${PORT}`);
        }
      }
    }
  } catch {
    urls.push(`(LAN) http://<your-ip>:${PORT}  (run ifconfig / ipconfig for your IPv4)`);
  }
  return urls;
}
const app = express();
app.use(morgan('dev'));
const server = http.createServer(app);

const corsOrigin = process.env.CORS_ORIGIN || '*';
app.use(
  cors({
    origin: corsOrigin === '*' ? true : corsOrigin.split(',').map((s) => s.trim()),
    credentials: true,
  })
);
app.use(express.json());

/** No DB — for device / login connectivity checks (also under /api/health). */
app.get('/health', (req, res) => res.json({ ok: true }));

const io = new Server(server, {
  cors: { origin: corsOrigin === '*' ? true : corsOrigin.split(',').map((s) => s.trim()) },
});

app.set('io', io);

io.on('connection', (socket) => {
  socket.on('match:join', (matchId) => {
    if (!matchId || typeof matchId !== 'string') return;
    const room = `match:${matchId}`;
    socket.join(room);
    socket.emit('match:joined', { matchId, room });
  });

  socket.on('match:leave', (matchId) => {
    if (!matchId) return;
    socket.leave(`match:${matchId}`);
  });
});

app.use('/api', buildApiRouter());

async function main() {
  await connectDb();
  server.listen(PORT, HOST, () => {
    console.log('Cricnic API listening (HOST=%s PORT=%s)', HOST, PORT);
    for (const u of listLanUrls()) {
      console.log(' ', u, '→ /api');
    }
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
