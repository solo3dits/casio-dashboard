// Proxy del clima — el iPad 2 (iOS 9) no puede conectar directo a open-meteo por TLS
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');

  // Updated defaults to your UK coordinates
  var lat = req.query.lat || '52.03178';
  var lon = req.query.lon || '0.49759';

  var url = 'https://api.open-meteo.com/v1/forecast' +
    '?latitude=' + lat +
    '&longitude=' + lon +
    '&current_weather=true' +
    '&hourly=apparent_temperature,relativehumidity_2m' +
    '&timezone=Europe%2FLondon' + // Changed from Argentina to UK Timezone
    '&forecast_days=1';

  try {
    var response = await fetch(url);
    if (!response.ok) {
      return res.status(502).json({ error: 'open-meteo error: ' + response.status });
    }
    var data = await response.json();
    res.status(200).json(data);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
};
