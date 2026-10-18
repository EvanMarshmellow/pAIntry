import "dotenv/config";
import express from "express";
import { Spectrum } from "spectrum-ts";
import { imessage as imessageProvider } from "spectrum-ts/providers/imessage";
import { spectrum } from "@spectrum-ts/express";

const BACKEND_URL = (process.env.BACKEND_URL || "http://localhost:8000").replace(/\/$/, "");
const PORT = Number(process.env.PORT || 3000);
const BACKEND_TIMEOUT_MS = Number(process.env.BACKEND_TIMEOUT_MS || 90000);
const seen = new Set();

/** @type {import("spectrum-ts").SpectrumApp | null} */
let spectrumApp = null;

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

function backendPath(space, message) {
  if (message.platform === "imessage") {
    try {
      const im = imessageProvider(space);
      if (im.type === "dm") {
        return "/agent/personal";
      }
    } catch {
      /* fall through to group route */
    }
  }
  return "/agent/message";
}

async function loadImageBytes(space, content) {
  if (typeof content.read === "function") {
    return Buffer.from(await content.read());
  }
  if (spectrumApp && content.id) {
    const im = imessageProvider(spectrumApp);
    const phone = space?.phone;
    const file = await im.getAttachment(content.id, phone);
    if (file && typeof file.read === "function") {
      return Buffer.from(await file.read());
    }
  }
  throw new Error("could not load image attachment");
}

async function askBackend({ path, spaceId, sender, text, messageId, spaceType, imageBase64, imageMimeType }) {
  const payload = {
    space_id: spaceId,
    sender,
    message_id: messageId,
    space_type: spaceType,
  };
  if (text != null && text !== "") payload.text = text;
  if (imageBase64) {
    payload.image_base64 = imageBase64;
    payload.image_mime_type = imageMimeType || "image/jpeg";
  }
  const res = await fetch(`${BACKEND_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(BACKEND_TIMEOUT_MS),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`backend ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

async function onMessage(space, message) {
  if (message.direction && message.direction !== "inbound") return;
  if (remember(message.id)) return;

  const content = message.content || {};
  let text = null;
  let imageBase64 = null;
  let imageMimeType = null;

  if (content.type === "attachment") {
    const mime = content.mimeType || "";
    if (!mime.startsWith("image/")) {
      try {
        await space.send("Send a photo of your receipt or groceries and I'll read it.");
      } catch (sendErr) {
        console.error("Failed to send attachment hint:", sendErr);
      }
      return;
    }
    try {
      const bytes = await loadImageBytes(space, content);
      if (bytes.length > 10 * 1024 * 1024) {
        await space.send("That image is too large — try a smaller receipt photo.");
        return;
      }
      imageBase64 = bytes.toString("base64");
      imageMimeType = mime;
      text = content.name || "receipt photo";
    } catch (err) {
      console.error("Attachment read error:", err);
      try {
        await space.send("I couldn't download that image — try sending it again.");
      } catch (sendErr) {
        console.error("Failed to send attachment error:", sendErr);
      }
      return;
    }
  } else if (!content.type || content.type === "text") {
    text = content.text;
    if (!text) return;
  } else {
    return;
  }

  const spaceId = space.id || message.space?.id;
  const sender = message.sender?.id;
  const path = backendPath(space, message);
  const spaceType = path === "/agent/personal" ? "dm" : "group";
  try {
    const result = await askBackend({
      path,
      spaceId,
      sender,
      text,
      messageId: message.id,
      spaceType,
      imageBase64,
      imageMimeType,
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
  spectrumApp = await Spectrum({
    projectId,
    projectSecret,
    providers: [imessageProvider.config()],
    webhookSecret,
  });
  server.use(spectrum({ app: spectrumApp, onMessage }));
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
