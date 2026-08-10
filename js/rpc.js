"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const RPC = require("discord-rpc");

const HOST = "127.0.0.1";
const PORT = 6464;

const CLIENT_ID = process.env.DISCORD_CLIENT_ID;

const ALLOWED_ORIGIN = "http://127.0.0.1:5500";
const MAX_BODY_SIZE = 16 * 1024;
const MAX_DETAILS = 128;
const MAX_STATE = 128;

const RATE_WINDOW = 1000;
const MAX_REQUESTS = 10;

const LOCK_FILE = path.join(__dirname, ".rpc.lock");

let rpc = null;
let rpcReady = false;
let requests = 0;
let rateStart = Date.now();
let lockOwned = false;

if (!CLIENT_ID || !/^\d{17,20}$/.test(CLIENT_ID)) {
  console.error("[RPC] DISCORD_CLIENT_ID ausente ou inválido.");
  process.exit(1);
}

function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;

  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
}

function acquireLock() {
  try {
    fs.writeFileSync(
      LOCK_FILE,
      JSON.stringify({
        pid: process.pid,
        startedAt: new Date().toISOString()
      }),
      {
        encoding: "utf8",
        flag: "wx"
      }
    );

    lockOwned = true;
    console.log("[RPC] Instance Lock: ACTIVE");
    return true;
  } catch (error) {
    if (error.code !== "EEXIST") {
      console.error("[RPC] Falha ao criar Instance Lock.");
      return false;
    }

    try {
      const lock = JSON.parse(
        fs.readFileSync(LOCK_FILE, "utf8")
      );

      if (pidAlive(Number(lock.pid))) {
        console.error("[RPC] Outra instância já está ativa.");
        return false;
      }

      fs.unlinkSync(LOCK_FILE);
      return acquireLock();
    } catch {
      try {
        fs.unlinkSync(LOCK_FILE);
      } catch {}

      return acquireLock();
    }
  }
}

function releaseLock() {
  if (!lockOwned) return;

  try {
    const lock = JSON.parse(
      fs.readFileSync(LOCK_FILE, "utf8")
    );

    if (Number(lock.pid) === process.pid) {
      fs.unlinkSync(LOCK_FILE);
    }
  } catch {}

  lockOwned = false;
}

function rateLimited() {
  const now = Date.now();

  if (now - rateStart >= RATE_WINDOW) {
    rateStart = now;
    requests = 0;
  }

  requests++;

  return requests > MAX_REQUESTS;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    let size = 0;
    let done = false;

    req.setEncoding("utf8");

    req.on("data", chunk => {
      if (done) return;

      size += Buffer.byteLength(chunk, "utf8");

      if (size > MAX_BODY_SIZE) {
        done = true;

        reject({
          status: 413,
          message: "Request body too large."
        });

        req.destroy();
        return;
      }

      body += chunk;
    });

    req.on("end", () => {
      if (done) return;

      done = true;
      resolve(body);
    });

    req.on("error", error => {
      if (done) return;

      done = true;

      reject({
        status: 400,
        message: error.message
      });
    });
  });
}

function validatePayload(data) {
  if (
    !data ||
    typeof data !== "object" ||
    Array.isArray(data)
  ) {
    return null;
  }

  const keys = Object.keys(data);

  if (
    keys.some(
      key => key !== "details" && key !== "state"
    )
  ) {
    return null;
  }

  if (
    typeof data.details !== "string" ||
    data.details.length === 0 ||
    data.details.length > MAX_DETAILS
  ) {
    return null;
  }

  if (
    data.state !== undefined &&
    (
      typeof data.state !== "string" ||
      data.state.length > MAX_STATE
    )
  ) {
    return null;
  }

  return {
    details: data.details,
    state: data.state ?? "Working on a Project."
  };
}

async function connectRPC() {
  if (rpc && rpcReady) return;

  rpc = new RPC.Client({
    transport: "ipc"
  });

  rpc.on("ready", () => {
    rpcReady = true;
    console.log("[RPC] Discord IPC: CONNECTED");
  });

  rpc.on("disconnected", () => {
    rpcReady = false;
    console.warn("[RPC] Discord IPC: DISCONNECTED");
  });

  rpc.on("error", error => {
    rpcReady = false;
    console.error(
      "[RPC] Discord IPC ERROR:",
      error.message
    );
  });

  await rpc.login({
    clientId: CLIENT_ID
  });
}

async function setPresence(details, state) {
  await connectRPC();

  if (!rpcReady) {
    throw new Error("Discord RPC unavailable.");
  }

  await rpc.setActivity({
    details,
    state,

    largeImageKey: "s1gn-tool-no-mi",
    largeImageText: "S1gn-Tool-No-Mi.",

    smallImageKey: "einzbern",
    smallImageText: "Einzbern",

    instance: false
  });
}

function json(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer"
  });

  res.end(JSON.stringify(data));
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    if (req.headers.origin !== ALLOWED_ORIGIN) {
      res.writeHead(403);
      res.end();
      return;
    }

    res.writeHead(204, {
      "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "600"
    });

    res.end();
    return;
  }

  if (
    req.method !== "POST" ||
    req.url !== "/presence"
  ) {
    json(res, 404, {
      success: false,
      error: "Not found."
    });

    return;
  }

  if (req.headers.origin !== ALLOWED_ORIGIN) {
    json(res, 403, {
      success: false,
      error: "Forbidden."
    });

    return;
  }

  if (rateLimited()) {
    json(res, 429, {
      success: false,
      error: "Too many requests."
    });

    return;
  }

  const contentType =
    req.headers["content-type"] || "";

  if (
    !contentType
      .toLowerCase()
      .startsWith("application/json")
  ) {
    json(res, 415, {
      success: false,
      error: "Unsupported media type."
    });

    return;
  }

  const contentLength =
    Number(req.headers["content-length"]);

  if (
    Number.isFinite(contentLength) &&
    contentLength > MAX_BODY_SIZE
  ) {
    json(res, 413, {
      success: false,
      error: "Request body too large."
    });

    req.destroy();
    return;
  }

  let raw;

  try {
    raw = await readBody(req);
  } catch (error) {
    json(res, error.status || 400, {
      success: false,
      error:
        error.status === 413
          ? "Request body too large."
          : "Invalid request."
    });

    return;
  }

  let data;

  try {
    data = JSON.parse(raw);
  } catch {
    json(res, 400, {
      success: false,
      error: "Invalid JSON."
    });

    return;
  }

  const payload = validatePayload(data);

  if (!payload) {
    json(res, 400, {
      success: false,
      error: "Invalid payload."
    });

    return;
  }

  try {
    await setPresence(
      payload.details,
      payload.state
    );

    json(res, 200, {
      success: true
    });
  } catch (error) {
    console.error(
      "[RPC] Presence error:",
      error.message
    );

    json(res, 503, {
      success: false,
      error: "Discord RPC unavailable."
    });
  }
});

if (!acquireLock()) {
  process.exit(1);
}

server.listen(PORT, HOST, async () => {
  console.log("==========================================");
  console.log(" S1GN TOOL NO MI — RPC BRIDGE");
  console.log("==========================================");
  console.log(`[RPC] Listening: ${HOST}:${PORT}`);
  console.log(`[RPC] PID: ${process.pid}`);
  console.log("[RPC] Client ID: PROTECTED");
  console.log("[RPC] Instance Lock: ACTIVE");
  console.log("[RPC] Body Limit: 16 KB");
  console.log("[RPC] Origin Validation: ACTIVE");
  console.log("[RPC] Rate Limit: ACTIVE");
  console.log("[RPC] /status: DISABLED");

  try {
    await connectRPC();
  } catch {
    console.warn("[RPC] Discord IPC unavailable.");
  }
});

function shutdown(signal) {
  console.log(`[RPC] ${signal} received.`);

  try {
    if (rpc) {
      rpc.destroy();
    }
  } catch {}

  server.close(() => {
    releaseLock();
    console.log("[RPC] Bridge stopped.");
    process.exit(0);
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("exit", releaseLock);