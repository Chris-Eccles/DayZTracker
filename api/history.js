module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');

  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_ANON_KEY;
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const url = `${supabaseUrl}/rest/v1/player_history?recorded_at=gte.${encodeURIComponent(sevenDaysAgo)}&select=recorded_at,players,max_players&order=recorded_at.asc`;
    const resp = await fetch(url, {
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`
      }
    });
    if (!resp.ok) {
      const body = await resp.text();
      throw new Error('Supabase read HTTP ' + resp.status + ': ' + body.slice(0, 200));
    }
    const data = await resp.json();
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message || String(err) });
  }
};
