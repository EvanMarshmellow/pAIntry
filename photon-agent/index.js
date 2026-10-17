import "dotenv/config";
import express from "express";
import { Spectrum } from "spectrum-ts";
import { imessage } from "spectrum-ts/providers/imessage";
import { spectrum } from "@spectrum-ts/express";

const BACKEND_URL = (process.env.BACKEND_URL || "http://localhost:8000").replace(/\/$/, "");
const PORT = Number(process.env.PORT || 3000);
const seen = new Set();

function remember(id) {
  if (!id) return false;
  if (seen.has(id)) return true;
  seen.add(id);
  if (seen.size > 500) {
    const first = seen.values().next().value;
    seen.delete(first);
  }
  return false;
}

async function askBackend({ spaceId, sender, text, messageId }) {
  const res = await fetch(`${BACKEND_URL}/agent/message`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      space_id: spaceId,
      sender,
      text,
      message_id: messageId,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`backend ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

async function onMessage(space, message) {
  if (message.direction && message.direction !== "inbound") return;
  const content = message.content || {};
  if (content.type && content.type !== "text") return;
  const text = content.text;
  if (!text) return;
  if (remember(message.id)) return;

  const spaceId = space.id || message.space?.id;
  const sender = message.sender?.id;
  try {
    const result = await askBackend({
      spaceId,
      sender,
      text,
      messageId: message.id,
    });
    if (result.ignored || !result.reply) return;
    await space.send(result.reply);
  } catch (err) {
    console.error("Cartwise backend error:", err);
    try {
      await space.send("Cartwise is offline — try again in a minute.");
    } catch (sendErr) {
      console.error("Failed to send offline notice:", sendErr);
    }
  }
}

const server = express();
const projectId = process.env.SPECTRUM_PROJECT_ID;
const projectSecret = process.env.SPECTRUM_PROJECT_SECRET;
const webhookSecret = process.env.SPECTRUM_WEBHOOK_SECRET;

if (projectId && projectSecret && webhookSecret) {
  const app = await Spectrum({
    projectId,
    projectSecret,
    providers: [imessage.config()],
    webhookSecret,
  });
  server.use(spectrum({ app, onMessage }));
  console.log("Photon webhook mounted at POST /spectrum/webhook");
} else {
  console.warn(
    "SPECTRUM_PROJECT_ID, SPECTRUM_PROJECT_SECRET, and SPECTRUM_WEBHOOK_SECRET are required to receive iMessage. Copy photon-agent/.env.example to .env."
  );
  server.post("/spectrum/webhook", (_req, res) => {
    res.status(503).json({ error: "Photon is not configured" });
  });
}

server.use(express.json());
server.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    backend: BACKEND_URL,
    photon: Boolean(projectId && projectSecret && webhookSecret),
  });
});

server.listen(PORT, () => {
  console.log(`photon-agent listening on :${PORT} → ${BACKEND_URL}`);
});
