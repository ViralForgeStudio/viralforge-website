export default async function handler(req, res) {
  const { code, state } = req.query;

  if (!code) {
    return res.status(400).send("Missing authorization code");
  }

  res.status(200).send(`
    <h1>TikTok authorization received</h1>
    <p>Authorization code received successfully.</p>
    <p>State: ${state ? "OK" : "missing"}</p>
  `);
}
