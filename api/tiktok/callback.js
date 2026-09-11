export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).send("Method not allowed");
  }

  const { code, state, error, error_description } = req.query;

  // Read the state cookie created by login.js
  const cookies = req.headers.cookie || "";
  const stateCookieMatch = cookies.match(
    /(?:^|;\s*)tiktok_state=([^;]*)/
  );

  let storedState = null;

  if (stateCookieMatch) {
    try {
      storedState = decodeURIComponent(stateCookieMatch[1]);
    } catch {
      storedState = null;
    }
  }

  // Clear the one-time OAuth state cookie
  const clearStateCookie =
    "tiktok_state=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0";

  // Handle authorization errors returned by TikTok
  if (error) {
    res.setHeader("Set-Cookie", clearStateCookie);

    return res.status(400).send(`
      <h1>TikTok authorization failed</h1>
      <p>${escapeHtml(error)}</p>
      <p>${escapeHtml(error_description || "Authorization was not completed.")}</p>
    `);
  }

  // Both the authorization code and state are required
  if (!code) {
    res.setHeader("Set-Cookie", clearStateCookie);
    return res.status(400).send("Missing authorization code");
  }

  if (!state || !storedState || state !== storedState) {
    res.setHeader("Set-Cookie", clearStateCookie);

    return res.status(400).send(`
      <h1>TikTok authorization failed</h1>
      <p>Invalid authorization state.</p>
    `);
  }

  try {
    const response = await fetch(
      "https://open.tiktokapis.com/v2/oauth/token/",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Cache-Control": "no-cache"
        },
        body: new URLSearchParams({
          client_key: process.env.TIKTOK_CLIENT_KEY,
          client_secret: process.env.TIKTOK_CLIENT_SECRET,
          code: code,
          grant_type: "authorization_code",
          redirect_uri:
            "https://viralforge-website.vercel.app/api/tiktok/callback"
        })
      }
    );

    const data = await response.json();

    if (!response.ok || data.error) {
      res.setHeader("Set-Cookie", clearStateCookie);

      return res.status(400).send(`
        <h1>TikTok token exchange failed</h1>
        <p>${escapeHtml(data.error || "unknown_error")}</p>
        <p>${escapeHtml(
          data.error_description || "Unknown error"
        )}</p>
      `);
    }

    // Query the latest creator information after authorization
    const creatorResponse = await fetch(
      "https://open.tiktokapis.com/v2/post/publish/creator_info/query/",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${data.access_token}`,
          "Content-Type": "application/json"
        }
      }
    );

    const creatorData = await creatorResponse.json();

    if (
      !creatorResponse.ok ||
      creatorData.error?.code !== "ok"
    ) {
      res.setHeader("Set-Cookie", clearStateCookie);

      return res.status(400).send(`
        <h1>Creator info failed</h1>
        <p>${escapeHtml(
          creatorData.error?.code || "unknown_error"
        )}</p>
        <p>${escapeHtml(
          creatorData.error?.message || "Unknown error"
        )}</p>
      `);
    }

    // Store the TikTok tokens in secure HttpOnly cookies.
    // Also clear the one-time OAuth state cookie.
    res.setHeader("Set-Cookie", [
      `tiktok_access_token=${encodeURIComponent(
        data.access_token
      )}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=86400`,

      `tiktok_refresh_token=${encodeURIComponent(
        data.refresh_token || ""
      )}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`,

      clearStateCookie
    ]);

    res.setHeader("Cache-Control", "no-store");

    return res.status(200).send(`
      <h1>TikTok connected successfully!</h1>
      <p>Authorization completed successfully.</p>

      <p>State: verified</p>
      <p>Open ID received: ${
        data.open_id ? "YES" : "NO"
      }</p>
      <p>Access token received: ${
        data.access_token ? "YES" : "NO"
      }</p>
      <p>Refresh token received: ${
        data.refresh_token ? "YES" : "NO"
      }</p>
    `);
  } catch (err) {
    res.setHeader("Set-Cookie", clearStateCookie);
    res.setHeader("Cache-Control", "no-store");

    return res.status(500).send(`
      <h1>Server error</h1>
      <p>Unable to complete TikTok authorization.</p>
    `);
  }
}

// Escape untrusted values before inserting them into HTML
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
