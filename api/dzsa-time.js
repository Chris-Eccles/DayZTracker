module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');

  const ip = (req.query.ip || '5.62.99.49').toString();
  const port = parseInt(req.query.port, 10) || 10501;

  try {
    const response = await fetch('https://dayzsalauncher.com/api/v1/launcher/servers/dayz');
    if (!response.ok) {
      res.status(502).json({ error: 'DZSA API HTTP ' + response.status });
      return;
    }
    const data = await response.json();
    const servers = data.result || [];
    const match = servers.find(s => s.endpoint && s.endpoint.ip === ip && s.endpoint.port === port);

    if (!match) {
      res.status(404).json({ error: 'Server not found in the DZSA public list (it may be private/unlisted).' });
      return;
    }

    res.status(200).json({
      time: match.time,                       // "HH:MM" in-game time, live from the server
      timeAcceleration: match.timeAcceleration, // current active multiplier
      name: match.name,
      players: match.players,
      maxPlayers: match.maxPlayers
    });
  } catch (err) {
    res.status(500).json({ error: err.message || String(err) });
  }
};