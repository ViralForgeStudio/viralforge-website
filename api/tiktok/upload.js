export default async function handler(req, res) {
  if (req.method !== "PUT") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  const uploadUrl = req.headers["x-tiktok-upload-url"];
  const contentRange = req.headers["content-range"];
  const contentType =
    req.headers["content-type"] || "video/mp4";

  if (!uploadUrl) {
    return res.status(400).json({
      error: "Missing TikTok upload URL"
    });
  }

  if (!contentRange) {
    return res.status(400).json({
      error: "Missing Content-Range"
    });
  }

  const contentLength =
    Number(req.headers["content-length"]);

  if (
    !Number.isFinite(contentLength) ||
    contentLength <= 0
  ) {
    return res.status(400).json({
      error: "Invalid Content-Length"
    });
  }

  try {
    const response = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(contentLength),
        "Content-Range": contentRange
      },
      duplex: "half",
      body: req
    });

    const responseText =
      await response.text();

    if (!response.ok) {
      return res.status(response.status).json({
        error: "TikTok upload failed",
        status: response.status,
        details: responseText || null
      });
    }

    return res.status(response.status).json({
      success: true,
      status: response.status,
      details: responseText || null
    });

  } catch (error) {
    return res.status(500).json({
      error: "server_error",
      message: error.message
    });
  }
}
