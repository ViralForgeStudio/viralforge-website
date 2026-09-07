export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  const cookies = req.headers.cookie || "";
  const match = cookies.match(/(?:^|;\s*)tiktok_access_token=([^;]+)/);

  if (!match) {
    return res.status(401).json({
      error: "TikTok not connected"
    });
  }

  const accessToken = decodeURIComponent(match[1]);

  const {
    video_size,
    title,
    privacy_level,
    disable_duet,
    disable_comment,
    disable_stitch
  } = req.body || {};

  if (!video_size) {
    return res.status(400).json({
      error: "Missing video_size"
    });
  }

  if (!privacy_level) {
    return res.status(400).json({
      error: "Missing privacy_level"
    });
  }

  const size = Number(video_size);

  if (!Number.isFinite(size) || size <= 0) {
    return res.status(400).json({
      error: "Invalid video_size"
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
    let chunkSize;
    let totalChunkCount;

    if (size <= 10_000_000) {
      chunkSize = size;
      totalChunkCount = 1;
    } else {
      chunkSize = 10_000_000;
      totalChunkCount = Math.floor(size / chunkSize);
    }

    const response = await fetch(
      "https://open.tiktokapis.com/v2/post/publish/video/init/",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json; charset=UTF-8"
        },
        body: JSON.stringify({
          post_info: {
            title: title || "ViralForge test video",
            privacy_level,
            disable_duet: Boolean(disable_duet),
            disable_comment: Boolean(disable_comment),
            disable_stitch: Boolean(disable_stitch),
            is_aigc: true
          },
          source_info: {
            source: "FILE_UPLOAD",
            video_size: size,
            chunk_size: chunkSize,
            total_chunk_count: totalChunkCount
          }
        })
      }
    );

    const data = await response.json();

    if (!response.ok || data.error?.code !== "ok") {
      return res.status(400).json({
        error: data.error?.code || "publish_init_failed",
        message: data.error?.message || "Unknown error",
        details: data
      });
    }

    return res.status(200).json({
      success: true,
      publish_id: data.data?.publish_id,
      upload_url: data.data?.upload_url,
      chunk_size: chunkSize,
      total_chunk_count: totalChunkCount
    });

  } catch (error) {
    return res.status(500).json({
      error: "server_error",
      message: error.message
    });
  }
}
