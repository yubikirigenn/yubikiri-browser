const express = require("express");
const axios = require("axios");
const router = express.Router();

router.get("/", async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) return res.status(400).send("Missing url");

  try {
    const response = await axios.get(targetUrl, {
      headers: { "User-Agent": "Mozilla/5.0" }
    });
    res.set("Content-Type", "text/html");
    res.send(response.data);
  } catch (err) {
    console.error("Proxy fetch error:", err.message);
    res.status(500).send("Proxy fetch error");
  }
});

module.exports = router;
