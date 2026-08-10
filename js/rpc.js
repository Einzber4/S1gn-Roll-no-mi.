"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const RPC = require("discord-rpc");

/* ==================================================
   CONFIGURAÇÃO
================================================== */

const CLIENT_ID =
  process.env.DISCORD_CLIENT_ID ||
  "1094444539638452304";

const HOST = "127.0.0.1";
const PORT = 6464;

/* ==================================================
   INSTANCE LOCK
================================================== */

const LOCK_FILE = path.join(
  __dirname,
  ".rpc.lock"
);

let lockAcquired = false;

function isProcessRunning(pid) {
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

function acquireInstanceLock() {
  try {
    const lockData = JSON.stringify({
      pid: process.pid,
      startedAt: new Date().toISOString()
    });

    /*
     * "wx" = criar somente se o arquivo NÃO existir.
     *
     * A operação é atômica, impedindo duas instâncias
     * de obterem o lock simultaneamente.
     */
    const fd = fs.openSync(
      LOCK_FILE,
      "wx"
    );

    fs.writeFileSync(
      fd,
      lockData,
      "utf8"
    );

    fs.closeSync(fd);

    lockAcquired = true;

    console.log(
      `[RPC] Instance Lock: ACTIVE (PID ${process.pid})`
    );

    return true;

  } catch (error) {

    if (error.code !== "EEXIST") {
      console.error(
        "[RPC] Falha ao criar Instance Lock:",
        error.message
      );

      return false;
    }

    /*
     * Lock já existe.
     * Verificar se pertence a um processo ativo.
     */
    let existingLock;

    try {
      existingLock =
        JSON.parse(
          fs.readFileSync(
            LOCK_FILE,
            "utf8"
          )
        );
    } catch {

      /*
       * Lock corrompido ou ilegível.
       * Removê-lo e tentar novamente.
       */
      console.warn(
        "[RPC] Lock inválido encontrado."
      );

      try {
        fs.unlinkSync(
          LOCK_FILE
        );
      } catch {}

      return acquireInstanceLock();
    }

    const existingPid =
      Number(existingLock.pid);

    if (
      isProcessRunning(existingPid)
    ) {

      console.error(
        "=========================================="
      );

      console.error(
        "[RPC] INSTANCE LOCK BLOQUEADO"
      );

      console.error(
        `[RPC] PID ativo: ${existingPid}`
      );

      console.error(
        "[RPC] Outra instância da Bridge já está executando."
      );

      console.error(
        "=========================================="
      );

      return false;
    }

    /*
     * O processo registrado não existe mais.
     * Trata-se de um lock órfão.
     */
    console.warn(
      `[RPC] Lock órfão detectado (PID ${existingPid}).`
    );

    try {
      fs.unlinkSync(
        LOCK_FILE
      );
    } catch {}

    return acquireInstanceLock();
  }
}

function releaseInstanceLock() {
  if (!lockAcquired) {
    return;
  }

  try {
    /*
     * Confirmar que o lock pertence a este processo
     * antes de removê-lo.
     */
    const data =
      JSON.parse(
        fs.readFileSync(
          LOCK_FILE,
          "utf8"
        )
      );

    if (
      Number(data.pid) !==
      process.pid
    ) {
      console.warn(
        "[RPC] Lock não pertence a este processo."
      );

      return;
    }

    fs.unlinkSync(
      LOCK_FILE
    );

    lockAcquired = false;

    console.log(
      "[RPC] Instance Lock: RELEASED"
    );

  } catch (error) {

    if (error.code !== "ENOENT") {
      console.warn(
        "[RPC] Não foi possível remover o Instance Lock:",
        error.message
      );
    }
  }
}

/* ==================================================
   OBTENÇÃO DO LOCK
================================================== */

if (!acquireInstanceLock()) {
  console.error(
    "[RPC] Inicialização abortada."
  );

  process.exit(1);
}

/* ==================================================
   ORIGINS
================================================== */

const ALLOWED_ORIGINS = new Set([
  "http://127.0.0.1:5500",
  "http://localhost:5500"
]);

/* ==================================================
   LIMITES
================================================== */

const MAX_BODY_SIZE =
  16 * 1024; // 16 KB

const MAX_DETAILS_LENGTH =
  128;

const MAX_STATE_LENGTH =
  128;

const RATE_WINDOW =
  1000;

const MAX_REQUESTS_PER_WINDOW =
  10;

let requestCount = 0;
let requestWindowStart =
  Date.now();

/* ==================================================
   RPC
================================================== */

let rpc = null;
let rpcReady = false;

/* ==================================================
   RATE LIMIT
================================================== */

function isRateLimited() {
  const now = Date.now();

  if (
    now - requestWindowStart >=
    RATE_WINDOW
  ) {
    requestWindowStart = now;
    requestCount = 0;
  }

  requestCount++;

  return (
    requestCount >
    MAX_REQUESTS_PER_WINDOW
  );
}

/* ==================================================
   ORIGIN VALIDATION
================================================== */

function isAllowedOrigin(req) {
  const origin =
    req.headers.origin;

  if (!origin) {
    return false;
  }

  return ALLOWED_ORIGINS.has(
    origin
  );
}

/* ==================================================
   SECURITY HEADERS
================================================== */

function securityHeaders(origin) {
  return {
    "Content-Type":
      "application/json; charset=utf-8",

    "Cache-Control":
      "no-store",

    "X-Content-Type-Options":
      "nosniff",

    "Referrer-Policy":
      "no-referrer",

    "Content-Security-Policy":
      "default-src 'none'; frame-ancestors 'none'",

    "Access-Control-Allow-Origin":
      origin,

    "Access-Control-Allow-Methods":
      "POST, OPTIONS",

    "Access-Control-Allow-Headers":
      "Content-Type",

    "Access-Control-Max-Age":
      "600"
  };
}

/* ==================================================
   JSON RESPONSE
================================================== */

function sendJson(
  res,
  status,
  payload,
  origin = ""
) {
  res.writeHead(
    status,
    securityHeaders(origin)
  );

  res.end(
    JSON.stringify(payload)
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

            reject(
              Object.assign(
                new Error(
                  "Request body too large."
                ),
                {
                  statusCode: 413
                }
              )
            );

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

          reject(error);
        }
      );

      req.on(
        "aborted",
        () => {

          if (finished) {
            return;
          }

          finished = true;

          reject(
            Object.assign(
              new Error(
                "Request aborted."
              ),
              {
                statusCode: 400
              }
            )
          );
        }
      );
    }
  );
}

/* ==================================================
   PAYLOAD VALIDATION
================================================== */

function validatePresencePayload(
  body
) {
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body)
  ) {
    return {
      valid: false,
      error: "Payload inválido."
    };
  }

  const {
    details,
    state
  } = body;

  const allowedKeys = [
    "details",
    "state"
  ];

  for (
    const key of Object.keys(body)
  ) {

    if (
      !allowedKeys.includes(key)
    ) {
      return {
        valid: false,
        error:
          "Payload contém propriedades não autorizadas."
      };
    }
  }

  if (
    typeof details !== "string" ||
    details.length === 0 ||
    details.length >
      MAX_DETAILS_LENGTH
  ) {
    return {
      valid: false,
      error:
        "Campo 'details' inválido."
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
        "Campo 'state' inválido."
    };
  }

  return {
    valid: true,
    details,
    state:
      typeof state === "string"
        ? state
        : "Working on a Project."
  };
}

/* ==================================================
   DISCORD CONNECTION
================================================== */

async function connectRPC() {

  if (
    rpcReady &&
    rpc
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

  try {

    await rpc.login({
      clientId: CLIENT_ID
    });

  } catch (error) {

    rpcReady = false;

    console.error(
      "[RPC] Discord connection failed:",
      error.message
    );

    throw error;
  }
}

/* ==================================================
   ACTIVITY
================================================== */

async function setActivity(
  details,
  state
) {

  await connectRPC();

  if (
    !rpc ||
    !rpcReady
  ) {
    throw new Error(
      "Discord RPC indisponível."
    );
  }

  await rpc.setActivity({

    details,

    state,

    largeImageKey:
      "s1gn-tool-no-mi",

    largeImageText:
      "S1gn-Tool-No-Mi.",

    smallImageKey:
      "einzbern",

    smallImageText:
      "Einzbern",

    instance: false
  });
}

/* ==================================================
   HTTP SERVER
================================================== */

const server =
  http.createServer(
    async (req, res) => {

      const origin =
        req.headers.origin ||
        "";

      /* OPTIONS */

      if (
        req.method ===
        "OPTIONS"
      ) {

        if (
          !isAllowedOrigin(req)
        ) {

          res.writeHead(403);
          res.end();

          return;
        }

        res.writeHead(
          204,
          securityHeaders(origin)
        );

        res.end();

        return;
      }

      /* ORIGIN */

      if (
        !isAllowedOrigin(req)
      ) {

        sendJson(
          res,
          403,
          {
            success: false,
            error:
              "Origin não autorizado."
          },
          origin
        );

        return;
      }

      /* ENDPOINT */

      if (
        req.method !== "POST" ||
        req.url !== "/presence"
      ) {

        sendJson(
          res,
          404,
          {
            success: false,
            error:
              "Endpoint não encontrado."
          },
          origin
        );

        return;
      }

      /* RATE LIMIT */

      if (
        isRateLimited()
      ) {

        sendJson(
          res,
          429,
          {
            success: false,
            error:
              "Muitas requisições."
          },
          origin
        );

        return;
      }

      /* CONTENT TYPE */

      const contentType =
        req.headers[
          "content-type"
        ] || "";

      if (
        !contentType
          .toLowerCase()
          .startsWith(
            "application/json"
          )
      ) {

        sendJson(
          res,
          415,
          {
            success: false,
            error:
              "Content-Type inválido."
          },
          origin
        );

        return;
      }

      /* CONTENT LENGTH */

      const contentLength =
        Number(
          req.headers[
            "content-length"
          ]
        );

      if (
        Number.isFinite(
          contentLength
        ) &&
        contentLength >
          MAX_BODY_SIZE
      ) {

        sendJson(
          res,
          413,
          {
            success