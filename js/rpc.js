"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const RPC = require("discord-rpc");


/* ==================================================
   CONFIGURAÇÃO
   ================================================== */

const HOST = "127.0.0.1";
const PORT = 6464;

const CLIENT_ID =
  process.env.DISCORD_CLIENT_ID?.trim();

const RPC_TOKEN =
  process.env.DISCORD_RPC_TOKEN?.trim();

const ALLOWED_ORIGIN =
  "http://127.0.0.1:5500";

const MAX_BODY_SIZE =
  16 * 1024;

const MAX_DETAILS = 128;
const MAX_STATE = 128;

const RATE_WINDOW = 1000;
const MAX_REQUESTS = 10;

const LOCK_FILE =
  path.join(__dirname, ".rpc.lock");


/* ==================================================
   VALIDAÇÃO INICIAL
   ================================================== */

if (
  !CLIENT_ID ||
  !/^\d{17,20}$/.test(CLIENT_ID)
) {
  console.error(
    "[RPC] DISCORD_CLIENT_ID ausente ou inválido."
  );

  process.exit(1);
}

if (
  !RPC_TOKEN ||
  RPC_TOKEN.length < 32
) {
  console.error(
    "[RPC] DISCORD_RPC_TOKEN ausente ou inseguro."
  );

  process.exit(1);
}


/* ==================================================
   ESTADO
   ================================================== */

let rpc = null;
let rpcReady = false;

let requests = 0;
let rateStart = Date.now();

let lockOwned = false;


/* ==================================================
   INSTANCE LOCK
   ================================================== */

function pidAlive(pid) {
  if (
    !Number.isInteger(pid) ||
    pid <= 0
  ) {
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
    fs.writeFileSync(
      LOCK_FILE,
      JSON.stringify({
        pid: process.pid,
        startedAt:
          new Date().toISOString()
      }),
      {
        encoding: "utf8",
        flag: "wx"
      }
    );

    lockOwned = true;

    console.log(
      "[RPC] Instance Lock: ACTIVE"
    );

    return true;

  } catch (error) {

    if (error.code !== "EEXIST") {
      console.error(
        "[RPC] Falha ao criar Instance Lock."
      );

      return false;
    }

    try {
      const lock =
        JSON.parse(
          fs.readFileSync(
            LOCK_FILE,
            "utf8"
          )
        );

      if (
        pidAlive(
          Number(lock.pid)
        )
      ) {
        console.error(
          "[RPC] Outra instância já está ativa."
        );

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
    const lock =
      JSON.parse(
        fs.readFileSync(
          LOCK_FILE,
          "utf8"
        )
      );

    if (
      Number(lock.pid) ===
      process.pid
    ) {
      fs.unlinkSync(LOCK_FILE);
    }

  } catch {}

  lockOwned = false;
}


/* ==================================================
   RATE LIMIT
   ================================================== */

function rateLimited() {
  const now = Date.now();

  if (
    now - rateStart >=
    RATE_WINDOW
  ) {
    rateStart = now;
    requests = 0;
  }

  requests++;

  return (
    requests >
    MAX_REQUESTS
  );
}


/* ==================================================
   TOKEN
   ================================================== */

function validToken(providedToken) {
  if (
    typeof providedToken !==
    "string"
  ) {
    return false;
  }

  if (
    providedToken.length !==
    RPC_TOKEN.length
  ) {
    return false;
  }

  try {
    return crypto.timingSafeEqual(
      Buffer.from(
        providedToken,
        "utf8"
      ),
      Buffer.from(
        RPC_TOKEN,
        "utf8"
      )
    );
  } catch {
    return false;
  }
}


/* ==================================================
   BODY
   ================================================== */

function readBody(req) {
  return new Promise(
    (resolve, reject) => {

      let body = "";
      let size = 0;
      let done = false;

      req.setEncoding("utf8");

      req.on(
        "data",
        chunk => {

          if (done) return;

          size +=
            Buffer.byteLength(
              chunk,
              "utf8"
            );

          if (
            size >
            MAX_BODY_SIZE
          ) {
            done = true;

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

          if (done) return;

          done = true;

          resolve(body);
        }
      );

      req.on(
        "error",
        error => {

          if (done) return;

          done = true;

          reject({
            status: 400,
            message:
              error.message
          });
        }
      );
    }
  );
}


/* ==================================================
   PAYLOAD
   ================================================== */

function validatePayload(data) {

  if (
    !data ||
    typeof data !== "object" ||
    Array.isArray(data)
  ) {
    return null;
  }

 