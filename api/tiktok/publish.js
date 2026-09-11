export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  const cookies = req.headers.cookie || "";

  const match = cookies.match(
    /(?:^|;\s*)tiktok_access_token=([^;]+)/
  );

  if (!match) {
    return res.status(401).json({
      error: "TikTok not connected"
    });
  }

  const accessToken =
    decodeURIComponent(match[1]);

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
    // 1. Descargar el video desde nuestro Worker
    const videoResponse = await fetch(video_url);

    if (!videoResponse.ok) {
      return res.status(400).json({
        error: "video_download_failed",
        message:
          `Could not download video from storage (${videoResponse.status})`
      });
    }

    const contentType =
      videoResponse.headers.get("content-type") ||
      "video/mp4";

    const videoBuffer =
      await videoResponse.arrayBuffer();

    const videoSize =
      videoBuffer.byteLength;

    if (!videoSize) {
      return res.status(400).json({
        error: "empty_video"
      });
    }

    // Para nuestro MVP usamos un solo chunk
    // cuando el archivo entra dentro del límite de 64 MB.
    const MAX_SINGLE_CHUNK =
      64 * 1024 * 1024;

    if (videoSize > MAX_SINGLE_CHUNK) {
      return res.status(400).json({
        error: "video_too_large_for_current_upload",
        message:
          "Videos larger than 64 MB are not supported by this upload version yet."
      });
    }

    // 2. Inicializar FILE_UPLOAD en TikTok
    const initResponse = await fetch(
      "https://open.tiktokapis.com/v2/post/publish/video/init/",
      {
        method: "POST",
        headers: {
          "Authorization":
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
              Boolean(brand_content_toggle),

            brand_organic_toggle:
              Boolean(brand_organic_toggle),

            is_aigc:
              true
          },

          source_info: {
            source:
              "FILE_UPLOAD",

            video_size:
              videoSize,

            chunk_size:
              videoSize,

            total_chunk_count:
              1
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

    // 3. Subir el video directamente a TikTok
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

    // 4. Devolver el publish_id para que
    // el frontend pueda consultar /status
    return res.status(200).json({
      success: true,

      publish_id:
        publishId,

      upload_status:
        uploadResponse.status
    });

  } catch (error) {
    return res.status(500).json({
      error:
        "server_error",

      message:
        error.message
    });
  }
}
