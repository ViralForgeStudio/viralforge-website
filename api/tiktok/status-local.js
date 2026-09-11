async function upstashCommand(command) {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;

  if (!url || !token) {
    throw new Error("Upstash environment variables are missing.");
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(command)
  });

  const data = await response.json();

  if (!response.ok || data.error) {
    throw new Error(
      data.error || "Upstash request failed."
    );
  }

  return data.result;
}

async function getTikTokCredentials() {
  const result = await upstashCommand([
    "GET",
    "tiktok:credentials"
  ]);

  if (!result) {
    throw new Error(
      "TikTok credentials not found in Upstash."
    );
  }

  return JSON.parse(result);
}

async function saveTikTokCredentials(credentials) {
  await upstashCommand([
    "SET",
    "tiktok:credentials",
    JSON.stringify(credentials)
  ]);
}

async function refreshTikTokToken(credentials) {
  const response = await fetch(
    "https://open.tiktokapis.com/v2/oauth/token/",
    {
      method: "POST",
      headers: {
        "Content-Type":
          "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        client_key:
          process.env.TIKTOK_CLIENT_KEY,

        client_secret:
          process.env.TIKTOK_CLIENT_SECRET,

        grant_type:
          "refresh_token",

        refresh_token:
          credentials.refresh_token
      })
    }
  );

  const data = await response.json();

  if (!response.ok || data.error) {
    throw new Error(
      data.error_description ||
      data.error ||
      "TikTok token refresh failed."
    );
  }

  const updatedCredentials = {
    ...credentials,

    access_token:
      data.access_token,

    refresh_token:
      data.refresh_token ||
      credentials.refresh_token,

    token_type:
      data.token_type ||
      "Bearer",

    expires_at:
      Date.now() +
      (data.expires_in || 86400) * 1000,

    refresh_expires_at:
      data.refresh_expires_in
        ? Date.now() +
          data.refresh_expires_in * 1000
        : credentials.refresh_expires_at
  };

  await saveTikTokCredentials(
    updatedCredentials
  );

  return updatedCredentials;
}

async function getValidTikTokCredentials() {
  let credentials =
    await getTikTokCredentials();

  if (
    !credentials.access_token ||
    !credentials.refresh_token
  ) {
    throw new Error(
      "TikTok credentials are incomplete."
    );
  }

  const expiresAt =
    Number(credentials.expires_at || 0);

  const refreshBuffer =
    5 * 60 * 1000;

  if (
    !expiresAt ||
    Date.now() >= expiresAt - refreshBuffer
  ) {
    credentials =
      await refreshTikTokToken(credentials);
  }

  return credentials;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  const providedSecret =
    req.headers["x-local-publish-secret"];

  if (
    !providedSecret ||
    providedSecret !==
      process.env.LOCAL_PUBLISH_SECRET
  ) {
    return res.status(401).json({
      error: "Unauthorized"
    });
  }

  const {
    publish_id
  } = req.body || {};

  if (!publish_id) {
    return res.status(400).json({
      error: "Missing publish_id"
    });
  }

  try {
    const credentials =
      await getValidTikTokCredentials();

    const response = await fetch(
      "https://open.tiktokapis.com/v2/post/publish/status/fetch/",
      {
        method: "POST",
        headers: {
          Authorization:
            `Bearer ${credentials.access_token}`,

          "Content-Type":
            "application/json; charset=UTF-8"
        },

        body: JSON.stringify({
          publish_id
        })
      }
    );

    const data =
      await response.json();

    if (
      !response.ok ||
      data.error?.code !== "ok"
    ) {
      return res.status(
        response.status || 400
      ).json({
        error:
          data.error?.code ||
          "status_fetch_failed",

        message:
          data.error?.message ||
          "Unknown TikTok error",

        details:
          data
      });
    }

    return res.status(200).json({
      success: true,

      status:
        data.data?.status || null,

      fail_reason:
        data.data?.fail_reason || null,

      publicly_available_post_id:
        data.data?.publicly_available_post_id ||
        null
    });

  } catch (error) {
    console.error(
      "Local TikTok status error:",
      error
    );

    return res.status(500).json({
      error:
        "server_error",

      message:
        error.message
    });
  }
}
