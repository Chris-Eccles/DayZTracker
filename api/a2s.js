const dgram = require('dgram');

const SERVER_IP = '5.62.99.49';
const QUERY_PORT = 10501;
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
  // buf[0..3] = FF FF FF FF, buf[4] = 'I' (0x49)
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

function queryA2S() {
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
        // Challenge response — resend the request with the challenge bytes appended
        const challengeBytes = msg.subarray(5, 9);
        const retryReq = buildInfoRequest(challengeBytes);
        socket.send(retryReq, QUERY_PORT, SERVER_IP);
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

      // Unknown response type — ignore and keep waiting until timeout
    });

    const initialReq = buildInfoRequest(null);
    socket.send(initialReq, QUERY_PORT, SERVER_IP);
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');

  try {
    const result = await queryA2S();
    res.status(200).json(result);
  } catch (err) {
    res.status(502).json({ error: err.message || String(err) });
  }
};
