const net = require("net");
const http = require("http");
const crypto = require("crypto");

// ==================================================
// CONFIGURAÇÃO
// ==================================================

const CLIENT_ID = "1094444539638452304";

const HTTP_HOST = "127.0.0.1";
const HTTP_PORT = 6464;

// ==================================================
// RICH PRESENCE
// ==================================================

const presence = {
    type: 0,

    details: "Creating The S1gn.",
    state: "Working on a Project.",

    start: Math.floor(Date.now() / 1000),

    large_image: "cybersecurity",
    large_text: "S1gn-Tool-No-Mi.",

    small_image: "sandrone",
    small_text: "Einzbern"
};

// ==================================================
// ESTADO DA CONEXÃO
// ==================================================

let socket = null;
let connected = false;
let reconnectTimer = null;

// ==================================================
// UTILIDADES
// ==================================================

function createNonce() {
    return crypto.randomUUID();
}

function sendFrame(opcode, data) {
    if (!socket || !connected) {
        console.log("[RPC] Discord não está conectado.");
        return false;
    }

    const payload = Buffer.from(
        JSON.stringify(data),
        "utf8"
    );

    const header = Buffer.alloc(8);

    header.writeUInt32LE(opcode, 0);
    header.writeUInt32LE(payload.length, 4);

    socket.write(
        Buffer.concat([
            header,
            payload
        ])
    );

    return true;
}

// ==================================================
// ATUALIZAÇÃO DA PRESENCE
// ==================================================

function updatePresence() {
    if (!connected) {
        console.log(
            "[RPC] Não foi possível atualizar: Discord desconectado."
        );

        return false;
    }

    const activity = {
        type: presence.type,

        details: presence.details,
        state: presence.state,

        timestamps: {
            start: presence.start
        },

        assets: {
            large_image: presence.large_image,
            large_text: presence.large_text,

            small_image: presence.small_image,
            small_text: presence.small_text
        }
    };

    const nonce = createNonce();

    console.log("[RPC] Enviando SET_ACTIVITY...");
    console.log("[RPC] Activity:", activity);

    return sendFrame(1, {
        cmd: "SET_ACTIVITY",
        nonce,

        args: {
            pid: process.pid,
            activity
        }
    });
}

// ==================================================
// DESCONECTAR
// ==================================================

function disconnect() {
    connected = false;

    if (socket) {
        socket.destroy();
        socket = null;
    }
}

// ==================================================
// CONEXÃO IPC COM DISCORD
// ==================================================

function connectToDiscord(pipeIndex = 0) {
    if (connected) {
        return;
    }

    if (pipeIndex > 9) {
        console.log(
            "[RPC] Nenhum pipe IPC do Discord encontrado."
        );

        scheduleReconnect();
        return;
    }

    const pipe =
        `\\\\?\\pipe\\discord-ipc-${pipeIndex}`;

    console.log(
        `[RPC] Tentando Discord IPC pipe ${pipeIndex}...`
    );

    const newSocket = net.createConnection(pipe);

    // ------------------------------------------------
    // CONEXÃO ESTABELECIDA
    // ------------------------------------------------

    newSocket.once("connect", () => {
        socket = newSocket;
        connected = true;

        console.log(
            `[RPC] Conectado ao Discord através do pipe ${pipeIndex}.`
        );

        // HANDSHAKE
        sendFrame(0, {
            v: 1,
            client_id: CLIENT_ID
        });
    });

    // ------------------------------------------------
    // DADOS RECEBIDOS
    // ------------------------------------------------

    newSocket.on("data", buffer => {
        if (buffer.length < 8) {
            return;
        }

        let offset = 0;

        while (offset + 8 <= buffer.length) {
            const opcode = buffer.readUInt32LE(offset);
            const length = buffer.readUInt32LE(offset + 4);

            if (offset + 8 + length > buffer.length) {
                console.log(
                    "[RPC] Frame incompleto recebido."
                );

                break;
            }

            const rawPayload = buffer
                .subarray(
                    offset + 8,
                    offset + 8 + length
                )
                .toString("utf8");

            offset += 8 + length;

            let payload;

            try {
                payload = JSON.parse(rawPayload);
            } catch (error) {
                console.error(
                    "[RPC] Erro ao interpretar resposta do Discord:"
                );

                console.error(rawPayload);

                continue;
            }

            console.log(
                "[RPC] Resposta recebida:",
                payload
            );

            // ----------------------------------------
            // READY
            // ----------------------------------------

            if (payload.evt === "READY") {
                console.log(
                    "[RPC] Discord confirmou a conexão."
                );

                updatePresence();

                continue;
            }

            // ----------------------------------------
            // ERRO
            // ----------------------------------------

            if (payload.evt === "ERROR") {
                console.error(
                    "[RPC] Discord rejeitou a operação."
                );

                console.error(
                    "[RPC] Código:",
                    payload.data?.code
                );

                console.error(
                    "[RPC] Mensagem:",
                    payload.data?.message
                );

                continue;
            }

            // ----------------------------------------
            // SET_ACTIVITY
            // ----------------------------------------

            if (payload.cmd === "SET_ACTIVITY") {
                console.log(
                    "[RPC] Resposta do SET_ACTIVITY recebida."
                );

                if (payload.data) {
                    console.log(
                        "[RPC] Dados do Discord:",
                        payload.data
                    );
                }

                continue;
            }
        }
    });

    // ------------------------------------------------
    // FECHAMENTO
    // ------------------------------------------------

    newSocket.once("close", () => {
        if (socket === newSocket) {
            disconnect();

            console.log(
                "[RPC] Conexão com Discord encerrada."
            );

            scheduleReconnect();
        }
    });

    // ------------------------------------------------
    // ERRO
    // ------------------------------------------------

    newSocket.once("error", error => {
        if (!connected) {
            console.log(
                `[RPC] Pipe ${pipeIndex} indisponível.`
            );

            newSocket.destroy();

            connectToDiscord(pipeIndex + 1);
        } else {
            console.error(
                "[RPC] Erro na conexão:",
                error.message
            );
        }
    });
}

// ==================================================
// RECONEXÃO
// ==================================================

function scheduleReconnect() {
    if (reconnectTimer) {
        return;
    }

    reconnectTimer = setTimeout(() => {
        reconnectTimer = null;

        connectToDiscord(0);
    }, 5000);
}

// ==================================================
// HTTP BRIDGE
// ==================================================

function sendJson(response, status, data) {
    response.writeHead(status, {
        "Content-Type":
            "application/json; charset=utf-8",

        "Access-Control-Allow-Origin":
            "*",

        "Access-Control-Allow-Methods":
            "GET, POST, OPTIONS",

        "Access-Control-Allow-Headers":
            "Content-Type"
    });

    response.end(
        JSON.stringify(data)
    );
}

// ==================================================
// SERVIDOR HTTP
// ==================================================

const server = http.createServer(
    (request, response) => {

        // --------------------------------------------
        // CORS
        // --------------------------------------------

        if (request.method === "OPTIONS") {
            sendJson(
                response,
                204,
                {}
            );

            return;
        }

        // --------------------------------------------
        // STATUS
        // --------------------------------------------

        if (
            request.method === "GET" &&
            request.url === "/status"
        ) {
            sendJson(
                response,
                200,
                {
                    connected,
                    presence
                }
            );

            return;
        }

        // --------------------------------------------
        // ATUALIZAR PRESENCE
        // --------------------------------------------

        if (
            request.method === "POST" &&
            request.url === "/presence"
        ) {
            let body = "";

            request.on(
                "data",
                chunk => {
                    body += chunk;
                }
            );

            request.on(
                "end",
                () => {
                    try {
                        const data =
                            JSON.parse(body);

                        if (
                            typeof data.details ===
                            "string"
                        ) {
                            presence.details =
                                data.details;
                        }

                        if (
                            typeof data.state ===
                            "string"
                        ) {
                            presence.state =
                                data.state;
                        }

                        if (
                            typeof data.start ===
                            "number"
                        ) {
                            presence.start =
                                data.start;
                        }

                        updatePresence();

                        sendJson(
                            response,
                            200,
                            {
                                success: true,
                                connected,
                                presence
                            }
                        );

                    } catch (error) {
                        sendJson(
                            response,
                            400,
                            {
                                success: false,
                                error:
                                    "JSON inválido."
                            }
                        );
                    }
                }
            );

            return;
        }

        // --------------------------------------------
        // 404
        // --------------------------------------------

        sendJson(
            response,
            404,
            {
                success: false,
                error:
                    "Endpoint não encontrado."
            }
        );
    }
);

// ==================================================
// INICIALIZAÇÃO
// ==================================================

server.listen(
    HTTP_PORT,
    HTTP_HOST,
    () => {

        console.log(
            `[RPC] Bridge iniciada em ` +
            `http://${HTTP_HOST}:${HTTP_PORT}`
        );

        console.log(
            "[RPC] Configuração atual:"
        );

        console.log(
            `       Large Image: ${presence.large_image}`
        );

        console.log(
            `       Large Text:  ${presence.large_text}`
        );

        console.log(
            `       Small Image: ${presence.small_image}`
        );

        console.log(
            `       Small Text:  ${presence.small_text}`
        );

        console.log(
            `       Details:     ${presence.details}`
        );

        console.log(
            `       State:       ${presence.state}`
        );

        connectToDiscord(0);
    }
);