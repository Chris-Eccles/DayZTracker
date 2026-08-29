const dgram = require('dgram');
 
const DEFAULT_IP = '5.62.99.49';
const DEFAULT_PORT = 10501;
const TIMEOUT_MS = 3000;
 
function buildInfoRequest(challengeBytes) {
  const header = Buffer.from([0xFF, 0xFF, 0xFF, 0xFF, 0x54]); // 'T'
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
  offset += 1; // protocol version byte, skip
 
  let r = readCString(buf, offset); offset = r.next; // name
  r = readCString(buf, offset); offset = r.next;      // map
  r = readCString(buf, offset); offset = r.next;      // folder
  r = readCString(buf, offset); offset = r.next;      // game
 
  offset += 2; // short: ID, skip
 
  const players = buf.readUInt8(offset); offset += 1;
  const maxPlayers = buf.readUInt8(offset); offset += 1;
  const bots = buf.readUInt8(offset); offset += 1;
 
  return { players, maxPlayers, bots };
}
 
function queryA2S(ip, port) {
  return new Promise((resolve, reject) => {
    const socket = dgram.createSocket('udp4');
    let settled = false;
 
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      socket.close();
      reject(new Error('Timed out waiting for server response (server may be offline or blocking UDP queries).'));
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
 
      if (header !== -1) {
        settled = true;
        clearTimeout(timer);
        socket.close();
        reject(new Error('Unexpected response header.'));
        return;
      }
 
      if (type === 0x41) {
        const challengeBytes = msg.subarray(5, 9);
        const retryReq = buildInfoRequest(challengeBytes);
        socket.send(retryReq, port, ip);
        return;
      }
 
      if (type === 0x49) {
        settled = true;
        clearTimeout(timer);
        socket.close();
        try {
          resolve(parseInfoResponse(msg));
        } catch (parseErr) {
          reject(parseErr);
        }
        return;
      }
    });
 
    const initialReq = buildInfoRequest(null);
    socket.send(initialReq, port, ip);
  });
}
 
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');
 
  const ip = (req.query.ip || DEFAULT_IP).toString();
  const port = parseInt(req.query.port, 10) || DEFAULT_PORT;
 
  if (!/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip) || port < 1 || port > 65535) {
    res.status(400).json({ error: 'Invalid ip or port.' });
    return;
  }
 
  try {
    const result = await queryA2S(ip, port);
    res.status(200).json(result);
  } catch (err) {
    res.status(502).json({ error: err.message || String(err) });
  }
};
 
