export default async function handler(req, res) {
  const key = process.env.STEAM_API_KEY;
  const queryAddr = "5.62.99.49:10501";

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');

  if (!key) {
    res.status(500).json({ error: 'STEAM_API_KEY environment variable is not set on Vercel.' });
    return;
  }

  try {
    const filter = encodeURIComponent(`\\appid\\221100\\addr\\${queryAddr}`);
    const url = `https://api.steampowered.com/IGameServersService/GetServerList/v1/?key=${key}&filter=${filter}&limit=5`;
    const response = await fetch(url);
    if (!response.ok) {
      res.status(502).json({ error: 'Steam API HTTP ' + response.status });
      return;
    }
    const data = await response.json();
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message || String(err) });
  }
}
