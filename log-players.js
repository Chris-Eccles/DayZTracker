const dgram = require('dgram');

const DEFAULT_IP = '5.62.99.49';
const DEFAULT_PORT = 10501;
const TIMEOUT_MS = 3000;

function buildInfoRequest(challengeBytes) {
  const header = Buffer.from([0xFF, 0xFF, 0xFF, 0xFF, 0x54]);
  const payload = Buffer.from('Source Engine Query\0', 'latin1');
  return challengeBytes ? Buffer.concat([header, payload, challengeBytes]) : Buffer.concat([header, payload]);
}

function readCString(buf, offset) {
  let end = offset;
  while (end < buf.length && buf[end] !== 0x00) end++;
  return { value: buf.toString('latin1', offset, end), next: end + 1 };
}

function parseInfoResponse(buf) {
  let offset = 5;
  offset += 1;
  let r = readCString(buf, offset); offset = r.next;
  r = readCString(buf, offset); offset = r.next;
  r = readCString(buf, offset); offset = r.next;
  r = readCString(buf, offset); offset = r.next;
  offset += 2;
  const players = buf.readUInt8(offset); offset += 1;
  const maxPlayers = buf.readUInt8(offset); offset += 1;
  return { players, maxPlayers };
}

function queryA2S(ip, port) {
  return new Promise((resolve, reject) => {
    const socket = dgram.createSocket('udp4');
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      socket.close();
      reject(new Error('Timed out.'));
    }, TIMEOUT_MS);

    socket.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.close();
      reject(err);
    });

    socket.on('message', (msg) => {
      if (settled) return;
      const header = msg.readInt32LE(0);
      const type = msg[4];
      if (header !== -1) { settled = true; clearTimeout(timer); socket.close(); reject(new Error('Bad header.')); return; }
      if (type === 0x41) {
        const challengeBytes = msg.subarray(5, 9);
        socket.send(buildInfoRequest(challengeBytes), port, ip);
        return;
      }
      if (type === 0x49) {
        settled = true;
        clearTimeout(timer);
        socket.close();
        try { resolve(parseInfoResponse(msg)); } catch (e) { reject(e); }
      }
    });

    socket.send(buildInfoRequest(null), port, ip);
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  const secret = req.query.key;
  if (!process.env.LOG_SECRET || secret !== process.env.LOG_SECRET) {
    res.status(403).json({ error: 'Forbidden.' });
    return;
  }

  const ip = (req.query.ip || DEFAULT_IP).toString();
  const port = parseInt(req.query.port, 10) || DEFAULT_PORT;

  let players, maxPlayers;
  try {
    const result = await queryA2S(ip, port);
    players = result.players;
    maxPlayers = result.maxPlayers;
  } catch (err) {
    res.status(502).json({ error: 'A2S query failed: ' + (err.message || err) });
    return;
  }

  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_ANON_KEY;
    const resp = await fetch(`${supabaseUrl}/rest/v1/player_history`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`
      },
      body: JSON.stringify({ players, max_players: maxPlayers })
    });
    if (!resp.ok) {
      const body = await resp.text();
      throw new Error('Supabase insert HTTP ' + resp.status + ': ' + body.slice(0, 200));
    }
    res.status(200).json({ logged: true, players, maxPlayers });
  } catch (err) {
    res.status(500).json({ error: err.message || String(err) });
  }
};
