"use strict";

/*
==================================================
 S1GN TOOL NO MI
 Discord Rich Presence Bridge
 Security Hardened
==================================================
*/

const http = require("http");
const RPC = require("discord-rpc");

/* ==================================================
   Configuração
================================================== */

const CLIENT_ID =
  process.env.DISCORD_CLIENT_ID ||
  "1094444539638452304";

const HOST = "127.0.0.1";
const PORT = 6464;

/*
 * Somente origens conhecidas da aplicação.
 */
const ALLOWED_ORIGINS = new Set([
  "http://127.0.0.1:5500",
  "http://localhost:5500"
]);

/* ==================================================
   Limites de segurança
================================================== */

const MAX_BODY_SIZE = 16 * 1024; // 16 KB
const MAX_DETAILS_LENGTH = 128;
const MAX_STATE_LENGTH = 128;

const RATE_WINDOW = 1000;
const MAX_REQUESTS_PER_WINDOW = 10;

let requestCount = 0;
let requestWindowStart = Date.now();

/* ==================================================
   Discord RPC
================================================== */

let rpc = null;
let rpcReady = false;

/* ==================================================
   Rate Limit
================================================== */

function isRateLimited() {
  const now = Date.now();

  if (now - requestWindowStart >= RATE_WINDOW) {
    requestWindowStart = now;
    requestCount = 0;
  }

  requestCount++;

  return requestCount > MAX_REQUESTS_PER_WINDOW;
}

/* ==================================================
   Origin
================================================== */

function isAllowedOrigin(req) {
  const origin = req.headers.origin;

  if (!origin) {
    return false;
  }

  return ALLOWED_ORIGINS.has(origin);
}

/* ==================================================
   Headers
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
   Resposta JSON
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
   LIMIT BODY
================================================== */

/*
 * Lê o Body manualmente para impedir que um payload
 * excessivamente grande seja acumulado em memória.
 *
 * Limite absoluto: 16 KB.
 */
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

      const chunkSize =
        Buffer.byteLength(
          chunk,
          "utf8"
        );

      size += chunkSize;

      /*
       * O limite é verificado antes de continuar
       * acumulando dados.
       */
      if (size > MAX_BODY_SIZE) {

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
    });

    req.on("end", () => {

      if (finished) {
        return;
      }

      finished = true;

      resolve(body);
    });

    req.on("error", error => {

      if (finished) {
        return;
      }

      finished = true;

      reject(error);
    });

    req.on("aborted", () => {

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
    });
  });
}

/* ==================================================
   Validação do Payload
================================================== */

function validatePresencePayload(body) {

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

  /*
   * Não aceitar propriedades inesperadas.
   */
  const allowedKeys = [
    "details",
    "state"
  ];

  for (const key of Object.keys(body)) {

    if (!allowedKeys.includes(key)) {

      return {
        valid: false,
        error:
          "Payload contém propriedades não autorizadas."
      };
    }
  }

  /*
   * Details
   */
  if (
    typeof details !== "string" ||
    details.length === 0 ||
    details.length > MAX_DETAILS_LENGTH
  ) {
    return {
      valid: false,
      error:
        "Campo 'details' inválido."
    };
  }

  /*
   * State
   */
  if (
    state !== undefined &&
    (
      typeof state !== "string" ||
      state.length > MAX_STATE_LENGTH
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
   Conectar ao Discord
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
        "[RPC] Discord IPC conectado."
      );
    }
  );

  rpc.on(
    "disconnected",
    () => {

      rpcReady = false;

      console.warn(
        "[RPC] Discord IPC desconectado."
      );
    }
  );

  rpc.on(
    "error",
    error => {

      rpcReady = false;

      console.error(
        "[RPC] Erro:",
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
      "[RPC] Falha ao conectar:",
      error.message
    );

    throw error;
  }
}

/* ==================================================
   Atualizar Activity
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
        req.headers.origin || "";

      /* ------------------------------------------
         OPTIONS / CORS
      ------------------------------------------ */

      if (
        req.method === "OPTIONS"
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

      /* ------------------------------------------
         Origin
      ------------------------------------------ */

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

      /* ------------------------------------------
         Método + Endpoint
      ------------------------------------------ */

      if (
        req.method !== "POST" ||
        req.url !== "/presence"
      ) {

        sendJson(
          res,
          404,
          {
            success: false,