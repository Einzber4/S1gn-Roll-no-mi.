"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const RPC = require("discord-rpc");

const HOST = "127.0.0.1";
const PORT = 6464;
const ALLOWED_ORIGIN = "http://127.0.0.1:5500";

const MAX_BODY_SIZE = 16 * 1024;
const MAX_DETAILS_LENGTH = 128;
const MAX_STATE_LENGTH = 128;

const RATE_WINDOW_MS = 1000;
const MAX_REQUESTS_PER_WINDOW = 10;

const LOCK_FILE = path.join(__dirname, ".rpc.lock");

const CLIENT_ID = process.env.DISCORD_CLIENT_ID;

if (!CLIENT_ID || !/^\d{17,20}$/.test(CLIENT_ID)) {
  console.error("[RPC] DISCORD_CLIENT_ID ausente ou inválido.");
  process.exit(1);
}

let lockAcquired = false;
let rpc = null;
let rpcReady = false;

let requestCount = 0;
let rateWindowStart = Date.now();

/* ==================================================
   INSTANCE LOCK
   ================================================== */

function processExists(pid) {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }

  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
}

function acquireLock() {
  try {
    const fd = fs.openSync(LOCK_FILE, "wx");

    fs.writeFileSync(
      fd,
      JSON.stringify({
        pid: process.pid,
        startedAt: new Date().toISOString()
      }),
      "utf8"
    );

    fs.closeSync(fd);

    lockAcquired = true;

    console.log(
      `[RPC] Instance Lock: ACTIVE (${process.pid})`
    );

    return true;
  } catch (error) {
    if (error.code !== "EEXIST") {
      console.error("[RPC] Falha ao criar Instance Lock.");
      return false;
    }

    let lock;

    try {
      lock = JSON.parse(
        fs.readFileSync(LOCK_FILE, "utf8")
      );
    } catch {
      try {
        fs.unlinkSync(LOCK_FILE);
      } catch {}

      return acquireLock();
    }

    const pid = Number(lock.pid);

    if (processExists(pid)) {
      console.error("[RPC] INSTANCE LOCK BLOQUEADO.");
      console.error(`[RPC] Processo ativo: ${pid}`);
      return false;
    }

    try {
      fs.unlinkSync(LOCK_FILE);
    } catch {}

    return acquireLock();
  }
}

function releaseLock() {
  if (!lockAcquired) {
    return;
  }

  try {
    const lock = JSON.parse(
      fs.readFileSync(LOCK_FILE, "utf8")
    );

    if (Number(lock.pid) !== process.pid) {
      return;
    }

    fs.unlinkSync(LOCK_FILE);

    lockAcquired = false;

    console.log("[RPC] Instance Lock: RELEASED");
  } catch (error) {
    if (error.code === "ENOENT") {
      lockAcquired = false;
    }
  }
}

if (!acquireLock()) {
  process.exit(1);
}

/* ==================================================
   RATE LIMIT
   ================================================== */

function isRateLimited() {
  const now = Date.now();

  if (now - rateWindowStart >= RATE_WINDOW_MS) {
    rateWindowStart = now;
    requestCount = 0;
  }

  requestCount += 1;

  return requestCount > MAX_REQUESTS_PER_WINDOW;
}

/* ==================================================
   HTTP RESPONSE
   ================================================== */

function sendJson(res, status, payload, origin = "") {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer"
  };

  if (origin === ALLOWED_ORIGIN) {
    headers["Access-Control-Allow-Origin"] =
      ALLOWED_ORIGIN;
  }

  res.writeHead(status, headers);
  res.end(JSON.stringify(payload));
}

/* ==================================================
   REQUEST BODY
   ================================================== */

function readLimitedBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    let size = 0;
    let finished = false;

    req.setEncoding("utf8");

    req.on("data", chunk => {
      if (finished) {
        return;
      }

      size += Buffer.byteLength(chunk, "utf8");

      if (size > MAX_BODY_SIZE) {
        finished = true;

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
      if (finished) {
        return;
      }

      finished = true;
      resolve(body);
    });

    req.on("aborted", () => {
      if (finished) {
        return;
      }

      finished = true;

      reject({
        status: 400,
        message: "Request aborted."
      });
    });

    req.on("error", error => {
      if (finished) {
        return;
      }

      finished = true;

      reject({
        status: 400,
        message: error.message
      });
    });
  });
}

/* ==================================================
   PAYLOAD VALIDATION
   ================================================== */

function validatePayload(payload) {
  if (
    !payload ||
    typeof payload !== "object" ||
    Array.isArray(payload)
  ) {
    return {
      valid: false,
      error: "Invalid payload."
    };
  }

  const allowedKeys = new Set([
    "details",
    "state"
  ]);

  for (const key of Object.keys(payload)) {
    if (!allowedKeys.has(key)) {
      return {
        valid: false,
        error: "Unauthorized payload property."
      };
    }
  }

  const {
    details,
    state
  } = payload;

  if (
    typeof details !== "string" ||
    details.length === 0 ||
    details.length > MAX_DETAILS_LENGTH
  ) {
    return {
      valid: false,
      error: "Invalid details."
    };
  }

  if (
    state !== undefined &&
    (
      typeof state !== "string" ||
      state.length > MAX_STATE_LENGTH
    )
  ) {
    return {
      valid: false,
      error: "Invalid state."
    };
  }

  return {
    valid: true,
    details,
    state:
      state === undefined
        ? "Working on a Project."
        : state
  };
}

/* ==================================================
   DISCORD RPC
   ================================================== */

async function connectRPC() {
  if (rpc && rpcReady) {
    return;
  }

  rpc = new RPC.Client({
    transport: "ipc"
  });

  rpc.on("ready", () => {
    rpcReady = true;

    console.log(
      "[RPC] Discord IPC: CONNECTED"
    );
  });

  rpc.on("disconnected", () => {
    rpcReady = false;

    console.warn(
      "[RPC] Discord IPC: DISCONNECTED"
    );
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

async function updateActivity(details, state) {
  await connectRPC();

  if (!rpc || !rpcReady) {
    throw new Error(
      "Discord RPC unavailable."
    );
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

/* ==================================================
   HTTP SERVER
   ================================================== */

const server = http.createServer(
  async (req, res) => {
    const origin = req.headers.origin || "";

    /* ----------------------------------------------
       CORS PREFLIGHT
       ---------------------------------------------- */

    if (req.method === "OPTIONS") {
      if (origin !== ALLOWED_ORIGIN) {
        res.writeHead(403);
        res.end();
        return;
      }

      res.writeHead(204, {
        "Access-Control-Allow-Origin":
          ALLOWED_ORIGIN,

        "Access-Control-Allow-Methods":
          "POST, OPTIONS",

        "Access-Control-Allow-Headers":
          "Content-Type",

        "Access-Control-Max-Age":
          "600"
      });

      res.end();
      return;
    }

    /* ----------------------------------------------
       ROUTE
       ---------------------------------------------- */

    if (
      req.method !== "POST" ||
      req.url !== "/presence"
    ) {
      sendJson(
        res,
        404,
        {
          success: false,
          error: "Not found."
        },
        origin
      );

      return;
    }

    /* ----------------------------------------------
       ORIGIN VALIDATION
       ---------------------------------------------- */

    if (origin !== ALLOWED_ORIGIN) {
      sendJson(
        res,
        403,
        {
          success: false,
          error: "Forbidden."
        },
        origin
      );

      return;
    }

    /* ----------------------------------------------
       RATE LIMIT
       ---------------------------------------------- */

    if (isRateLimited()) {
      sendJson(
        res,
        429,
        {
          success: false,
          error: "Too many requests."
        },
        origin
      );

      return;
    }

    /* ----------------------------------------------
       CONTENT TYPE
       ---------------------------------------------- */

    const contentType =
      req.headers["content-type"] || "";

    if (
      !contentType
        .toLowerCase()
        .startsWith("application/json")
    ) {
      sendJson(
        res,
        415,
        {
          success: false,
          error: "Unsupported media type."
        },
        origin
      );

      return;
    }

    /* ----------------------------------------------
       CONTENT LENGTH
       ---------------------------------------------- */

    const contentLength =
      Number(req.headers["content-length"]);

    if (
      Number.isFinite(contentLength) &&
      contentLength > MAX_BODY_SIZE
    ) {
      sendJson(
        res,
        413,
        {
          success: false,
          error: "Request body too large."
        },
        origin
      );

      req.destroy();
      return;
    }

    /* ----------------------------------------------
       READ BODY
       ---------------------------------------------- */

    let rawBody;

    try {
      rawBody = await readLimitedBody(req);
    } catch (error) {
      sendJson(
        res,
        error.status || 400,
        {
          success: false,
          error:
            error.status === 413
              ? "Request body too large."
              : "Invalid request."
        },
        origin
      );

      return;
    }

    /* ----------------------------------------------
       PARSE JSON
       ---------------------------------------------- */

    let payload;

    try {
      payload = JSON.parse(rawBody);
    } catch {
      sendJson(
        res,
        400,
        {
          success: false,
          error: "Invalid JSON."
        },
        origin
      );

      return;
    }

    /* ----------------------------------------------
       VALIDATE
       ---------------------------------------------- */

    const validation =
      validatePayload(payload);

    if (!validation.valid) {
      sendJson(
        res,
        400,
        {
          success: false,
          error: validation.error
        },
        origin
      );

      return;
    }

    /* ----------------------------------------------
       UPDATE DISCORD
       ---------------------------------------------- */

    try {
      await updateActivity(
        validation.details,
        validation.state
      );

      sendJson(
        res,
        200,
        {
          success: true
        },
        origin
      );
    } catch (error) {
      console.error(
        "[RPC] Activity error:",
        error.message
      );

      sendJson(
        res,
        503,
        {
          success: false,
          error:
            "Discord RPC unavailable."
        },
        origin
      );
    }
  }
);

/* ==================================================
   SERVER ERROR
   ================================================== */

server.on("error", error => {
  console.error(
    "[RPC] Server error:",
    error.message
  );

  releaseLock();
  process.exit(1);
});

/* ==================================================
   SERVER START
   ================================================== */

server.listen(
  PORT,
  HOST,
  async () => {
    console.log(
      "=========================================="
    );

    console.log(
      " S1GN TOOL NO MI — RPC BRIDGE"
    );

    console.log(
      "=========================================="
    );

    console.log(
      `[RPC] Listening on ${HOST}:${PORT}`
    );

    console.log(
      `[RPC] PID: ${process.pid}`
    );

    console.log(
      "[RPC] Client ID: PROTECTED"
    );

    console.log(
      "[RPC] Instance Lock: ACTIVE"
    );

    console.log(
      "[RPC] Body Limit: 16 KB"
    );

    console.log(
      "[RPC] Origin Validation: ACTIVE"
    );

    console.log(
      "[RPC] Rate Limit: ACTIVE"
    );

    console.log(
      "[RPC] /status: DISABLED"
    );

    try {
      await connectRPC();
    } catch (error) {
      console.warn(
        "[RPC] Discord IPC unavailable."
      );

      console.warn(
        "[RPC] Bridge remains active."
      );
    }
  }
);

/* ==================================================
   SHUTDOWN
   ================================================== */

let shuttingDown = false;

function shutdown(signal) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  console.log(
    `[RPC] ${signal} received.`
  );

  try {
    if (rpc) {
      rpc.destroy();
    }
  } catch {}

  server.close(() => {
    releaseLock();

    console.log(
      "[RPC] Bridge stopped."
    );

    process.exit(0);
  });
}

process.on(
  "SIGINT",
  () => shutdown("SIGINT")
);

process.on(
  "SIGTERM",
  () => shutdown("SIGTERM")
);

process.on(
  "exit",
  releaseLock
);