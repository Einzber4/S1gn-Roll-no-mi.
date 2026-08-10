const net = require("net");
const http = require("http");
const crypto = require("crypto");

const CLIENT_ID = "1094444539638452304";

const HTTP_HOST = "127.0.0.1";
const HTTP_PORT = 6464;

let socket = null;
let connected = false;
let reconnectTimer = null;

const presence = {
    type: 0,

    details: "Designing The S1gn.",
    state: "Working on a Project.",

    start: Math.floor(Date.now() / 1000),

    large_image: "lumine",
    large_text: "Lumine",

    small_image: "46be7f0b2664921b0eb36197e1b1e492",
    small_text: "Furina"
};


// --------------------------------------------------
// Utilidades
// --------------------------------------------------

function createNonce() {
    return crypto.randomUUID();
}

function sendFrame(opcode, data) {
    if (!socket || !connected) {
        console.log("[RPC] Não conectado ao Discord.");
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


// --------------------------------------------------
// Rich Presence
// --------------------------------------------------

function updatePresence() {
    if (!connected) {
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
    console.log("[RPC] Nonce:", nonce);

    return sendFrame(1, {
        cmd: "SET_ACTIVITY",

        nonce,

        args: {
            pid: process.pid,
            activity
        }
    });
}


// --------------------------------------------------
// Desconexão
// --------------------------------------------------

function disconnect() {
    connected = false;

    if (socket) {
        socket.destroy();
        socket = null;
    }
}


// --------------------------------------------------
// Conexão com Discord IPC
// --------------------------------------------------

function connectToDiscord(pipeIndex = 0) {
    if (connected) {
        return;
    }

    if (pipeIndex > 9) {
        console.log(
            "[RPC] Nenhum pipe do Discord foi encontrado."
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


    newSocket.on("data", buffer => {
        if (buffer.length < 8) {
            return;
        }

        const opcode = buffer.readUInt32LE(0);
        const length = buffer.readUInt32LE(4);

        if (buffer.length < 8 + length) {
            console.log(
                "[RPC] Frame incompleto recebido."
            );

            return;
        }

        const rawPayload = buffer
            .subarray(8, 8 + length)
            .toString("utf8");

        let payload;

        try {
            payload = JSON.parse(rawPayload);
        } catch (error) {
            console.error(
                "[RPC] Não foi possível interpretar a resposta:"
            );

            console.error(rawPayload);

            return;
        }

        console.log(
            "[RPC] Resposta recebida:",
            payload
        );


        // ------------------------------------------
        // READY
        // ------------------------------------------

        if (payload.evt === "READY") {
            console.log(
                "[RPC] Discord confirmou a conexão."
            );

            updatePresence();

            return;
        }


        // ------------------------------------------
        // ERRO
        // ------------------------------------------

        if (payload.evt === "ERROR") {
            console.error(
                "[RPC] Discord rejeitou uma operação."
            );

            console.error(
                "[RPC] Código:",
                payload.data?.code
            );

            console.error(
                "[RPC] Mensagem:",
                payload.data?.message
            );

            return;
        }


        // ------------------------------------------
        // Resposta SET_ACTIVITY
        // ------------------------------------------

        if (payload.cmd === "SET_ACTIVITY") {
            console.log(
                "[RPC] Resposta do SET_ACTIVITY recebida."
            );

            if (payload.data) {
                console.log(
                    "[RPC] Dados:",
                    payload.data
                );
            }

            return;
        }
    });


    newSocket.once("close", () => {
        if (socket === newSocket) {
            disconnect();

            console.log(
                "[RPC] Conexão com Discord encerrada."
            );

            scheduleReconnect();
        }
    });


    newSocket.once("error", () => {
        newSocket.destroy();

        if (!connected) {
            connectToDiscord(pipeIndex + 1);
        }
    });
}


// --------------------------------------------------
// Reconexão
// --------------------------------------------------

function scheduleReconnect() {
    if (reconnectTimer) {
        return;
    }

    reconnectTimer = setTimeout(() => {
        reconnectTimer = null;

        connectToDiscord(0);
    }, 5000);
}


// --------------------------------------------------
// Bridge HTTP local
// --------------------------------------------------

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


const server = http.createServer(
    (request, response) => {

        // ------------------------------------------
        // CORS
        // ------------------------------------------

        if (request.method === "OPTIONS") {
            sendJson(
                response,
                204,
                {}
            );

            return;
        }


        // ------------------------------------------
        // Status
        // ------------------------------------------

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


        // ------------------------------------------
        // Atualização da Presence
        // ------------------------------------------

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

                    } catch {
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


        // ------------------------------------------
        // 404
        // ------------------------------------------

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


// --------------------------------------------------
// Inicialização
// --------------------------------------------------

server.listen(
    HTTP_PORT,
    HTTP_HOST,
    () => {

        console.log(
            `[RPC] Bridge iniciada em ` +
            `http://${HTTP_HOST}:${HTTP_PORT}`
        );

        connectToDiscord(0);
    }
);