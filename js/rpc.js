"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const RPC = require("discord-rpc");

/* ==================================================
   CONFIGURATION
================================================== */

const HOST = "127.0.0.1";
const PORT = 6464;

const CLIENT_ID =
  process.env.DISCORD_CLIENT_ID;

if (
  !CLIENT_ID ||
  !/^\d{17,20}$/.test(CLIENT_ID)
) {
  console.error(
    "[RPC] DISCORD_CLIENT_ID ausente ou inválido."
  );

  process.exit(1);
}

/* ==================================================
   SECURITY LIMITS
================================================== */

const MAX_BODY_SIZE = 16 * 1024;
const MAX_DETAILS_LENGTH = 128;
const MAX_STATE_LENGTH = 128;

const RATE_WINDOW = 1000;
const MAX_REQUESTS = 10;

let requestCount = 0;
let rateWindowStart = Date.now();

/* ==================================================
   ALLOWED ORIGIN
================================================== */

const ALLOWED_ORIGIN =
  "http://127.0.0.1:5500";

/* ==================================================
   INSTANCE LOCK
================================================== */

const LOCK_FILE = path.join(
  __dirname,
  ".rpc.lock"
);

let lockAcquired = false;

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
    const fd = fs.openSync(
      LOCK_FILE,
      "wx"
    );

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
      console.error(
        "[RPC] Não foi possível criar o Instance Lock."
      );

      return false;
    }

    let lock;

    try {
      lock = JSON.parse(
        fs.readFileSync(
          LOCK_FILE,
          "utf8"
        )
      );
    } catch {

      try {
        fs.unlinkSync(
          LOCK_FILE
        );
      } catch {}

      return acquireLock();
    }

    const pid =
      Number(lock.pid);

    if (processExists(pid)) {

      console.error(
        "[RPC] INSTANCE LOCK BLOQUEADO."
      );

      console.error(
        `[RPC] Processo ativo: ${pid}`
      );

      return false;
    }

    console.warn(
      "[RPC] Removendo Instance Lock órfão."
    );

    try {
      fs.unlinkSync(
        LOCK_FILE
      );
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
      fs.readFileSync(
        LOCK_FILE,
        "utf8"
      )
    );

    if (
      Number(lock.pid) !==
      process.pid
    ) {
      return;
    }

    fs.unlinkSync(
      LOCK_FILE
    );

    lockAcquired = false;

    console.log(
      "[RPC] Instance Lock: RELEASED"
    );

  } catch {}
}

if (!acquireLock()) {
  process.exit(1);
}

/* ==================================================
   DISCORD RPC
================================================== */

let rpc = null;
let rpcReady = false;

async function connectRPC() {

  if (
    rpc &&
    rpcReady
  ) {
    return;
  }

  rpc =
    new RPC.Client({
      transport: "ipc"
    });

  rpc.on(
    "ready",
    () => {

      rpcReady = true;

      console.log(
        "[RPC] Discord IPC: CONNECTED"
      );
    }
  );

  rpc.on(
    "disconnected",
    () => {

      rpcReady = false;

      console.warn(
        "[RPC] Discord IPC: DISCONNECTED"
      );
    }
  );

  rpc.on(
    "error",
    error => {

      rpcReady = false;

      console.error(
        "[RPC] Discord IPC ERROR:",
        error.message
      );
    }
  );

  await rpc.login({
    clientId: CLIENT_ID
  });
}

/* ==================================================
   RATE LIMIT
================================================== */

function isRateLimited() {

  const now = Date.now();

  if (
    now - rateWindowStart >=
    RATE_WINDOW
  ) {
    rateWindowStart = now;
    requestCount = 0;
  }

  requestCount++;

  return (
    requestCount >
    MAX_REQUESTS
  );
}

/* ==================================================
   BODY LIMIT
================================================== */

function readLimitedBody(req) {

  return new Promise(
    (resolve, reject) => {

      let body = "";
      let size = 0;
      let finished = false;

      req.setEncoding("utf8");

      req.on(
        "data",
        chunk => {

          if (finished) {
            return;
          }

          size += Buffer.byteLength(
            chunk,
            "utf8"
          );

          if (
            size >
            MAX_BODY_SIZE
          ) {

            finished = true;

            reject({
              status: 413,
              message:
                "Request body too large."
            });

            req.destroy();

            return;
          }

          body += chunk;
        }
      );

      req.on(
        "end",
        () => {

          if (finished) {
            return;
          }

          finished = true;

          resolve(body);
        }
      );

      req.on(
        "error",
        error => {

          if (finished) {
            return;
          }

          finished = true;

          reject({
            status: 400,
            message: error.message
          });
        }
      );
    }
  );
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

  const keys =
    Object.keys(payload);

  const allowed = [
    "details",
    "state"
  ];

  for (const key of keys) {

    if (!allowed.includes(key)) {

      return {
        valid: false,
        error:
          "Unauthorized payload property."
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
    details.length >
      MAX_DETAILS_LENGTH
  ) {

    return {
      valid: false,
      error:
        "Invalid details."
    };
  }

  if (
    state !== undefined &&
    (
      typeof state !== "string" ||
      state.length >
        MAX_STATE_LENGTH
    )
  ) {

    return {
      valid: false,
      error:
        "Invalid state."
    };
  }

  return {
    valid: true,
    details,
    state:
      state ??
      "Working on a Project."
  };
}

/* ==================================================
   ACTIVITY
================================================== */

async function updateActivity(
  details,
  state
) {

  await connectRPC();

  if (
    !rpc ||
    !rpcReady
  ) {
    throw new Error(
      "Discord RPC unavailable."
    );
  }

  await rpc.setActivity({

    details,

    state,

    largeImageKey:
      "