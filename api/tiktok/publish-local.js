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

  // Refresh 5 minutes before expiration.
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

function unauthorized(res) {
  return res.status(401).json({
    error: "Unauthorized"
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  // Protect this endpoint from unauthorized requests.
  const providedSecret =
    req.headers["x-local-publish-secret"];

  if (
    !providedSecret ||
    providedSecret !==
      process.env.LOCAL_PUBLISH_SECRET
  ) {
    return unauthorized(res);
  }

  const {
    video_url,
    title,
    privacy_level,
    disable_duet,
    disable_comment,
    disable_stitch,
    brand_content_toggle,
    brand_organic_toggle
  } = req.body || {};

  if (!video_url) {
    return res.status(400).json({
      error: "Missing video_url"
    });
  }

  if (
    typeof video_url !== "string" ||
    !video_url.startsWith("https://")
  ) {
    return res.status(400).json({
      error: "Invalid video_url"
    });
  }

  if (!privacy_level) {
    return res.status(400).json({
      error: "Missing privacy_level"
    });
  }

  const allowedPrivacy = [
    "PUBLIC_TO_EVERYONE",
    "MUTUAL_FOLLOW_FRIENDS",
    "SELF_ONLY"
  ];

  if (!allowedPrivacy.includes(privacy_level)) {
    return res.status(400).json({
      error: "Invalid privacy_level"
    });
  }

  try {
    // 1. Get a valid TikTok access token.
    const credentials =
      await getValidTikTokCredentials();

    const accessToken =
      credentials.access_token;

    // 2. Download the video from our R2 Worker.
    const videoResponse =
      await fetch(video_url);

    if (!videoResponse.ok) {
      return res.status(400).json({
        error: "video_download_failed",
        message:
          `Could not download video from storage (${videoResponse.status})`
      });
    }

    const contentType =
      videoResponse.headers.get(
        "content-type"
      ) || "video/mp4";

    const videoBuffer =
      await videoResponse.arrayBuffer();

    const videoSize =
      videoBuffer.byteLength;

    if (!videoSize) {
      return res.status(400).json({
        error: "empty_video"
      });
    }

    const MAX_SINGLE_CHUNK =
      64 * 1024 * 1024;

    if (videoSize > MAX_SINGLE_CHUNK) {
      return res.status(400).json({
        error:
          "video_too_large_for_current_upload",
        message:
          "Videos larger than 64 MB are not supported by this upload version yet."
      });
    }

    // 3. Initialize TikTok FILE_UPLOAD.
    const initResponse =
      await fetch(
        "https://open.tiktokapis.com/v2/post/publish/video/init/",
        {
          method: "POST",
          headers: {
            Authorization:
              `Bearer ${accessToken}`,

            "Content-Type":
              "application/json; charset=UTF-8"
          },
          body: JSON.stringify({
            post_info: {
              title:
                title ||
                "ViralForge test video",

              privacy_level,

              disable_duet:
                Boolean(disable_duet),

              disable_comment:
                Boolean(disable_comment),

              disable_stitch:
                Boolean(disable_stitch),

              brand_content_toggle:
                Boolean(
                  brand_content_toggle
                ),

              brand_organic_toggle:
                Boolean(
                  brand_organic_toggle
                ),

              is_aigc: true
            },

            source_info: {
              source: "FILE_UPLOAD",

              video_size:
                videoSize,

              chunk_size:
                videoSize,

              total_chunk_count: 1
            }
          })
        }
      );

    const initData =
      await initResponse.json();

    if (
      !initResponse.ok ||
      initData.error?.code !== "ok"
    ) {
      return res.status(
        initResponse.status || 400
      ).json({
        error:
          initData.error?.code ||
          "publish_init_failed",

        message:
          initData.error?.message ||
          "TikTok upload initialization failed",

        details:
          initData
      });
    }

    const publishId =
      initData.data?.publish_id;

    const uploadUrl =
      initData.data?.upload_url;

    if (!publishId || !uploadUrl) {
      return res.status(500).json({
        error:
          "missing_upload_data",

        message:
          "TikTok did not return publish_id or upload_url."
      });
    }

    // 4. Upload video directly to TikTok.
    const uploadResponse =
      await fetch(uploadUrl, {
        method: "PUT",

        headers: {
          "Content-Type":
            contentType,

          "Content-Length":
            String(videoSize),

          "Content-Range":
            `bytes 0-${videoSize - 1}/${videoSize}`
        },

        body:
          Buffer.from(videoBuffer)
      });

    const uploadText =
      await uploadResponse.text();

    if (
      !uploadResponse.ok &&
      uploadResponse.status !== 201 &&
      uploadResponse.status !== 206
    ) {
      return res.status(
        uploadResponse.status || 400
      ).json({
        error:
          "tiktok_upload_failed",

        message:
          "TikTok rejected the video upload.",

        details:
          uploadText
      });
    }

    return res.status(200).json({
      success: true,

      publish_id:
        publishId,

      upload_status:
        uploadResponse.status
    });

  } catch (error) {
    console.error(
      "Local TikTok publish error:",
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
