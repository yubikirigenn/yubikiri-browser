app.get("/proxy", async (req, res) => {
  const targetUrl = req.query.url;

  if (!targetUrl) {
    console.error("No target URL provided");
    return res.status(400).send("Missing 'url' parameter");
  }

  try {
    const response = await axios.get(targetUrl, {
      responseType: "arraybuffer",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept":
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "ja,en;q=0.9",
      },
    });

    res.set("Content-Type", response.headers["content-type"]);
    res.send(response.data);
  } catch (err) {
    console.error("=== Proxy Error Start ===");
    console.error("URL:", targetUrl);
    if (err.response) {
      console.error("Status:", err.response.status);
      console.error("Headers:", err.response.headers);
    } else if (err.request) {
      console.error("No response received");
      console.error(err.request);
    } else {
      console.error("Error message:", err.message);
    }
    console.error("=== Proxy Error End ===");

    res
      .status(500)
      .send("Proxy error: " + (err.response ? err.response.status : err.message));
  }
});
