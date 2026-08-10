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
    details: "Designing The S1gn.",
    state: "Working on a Project.",
    start: Math.floor(Date.now() / 1000),
    large_image: "lumine",
    large_text: "Lumine",
    small_image: "46be7f0b2664921b0eb36197e1b1e492",
    small_text: "Furina"
};

function createNonce() {
    return crypto.randomUUID();
}

function sendFrame(opcode, data) {
    if (!socket || !connected) {
        return false;
    }

    const payload = Buffer.from(JSON.stringify(data), "utf8");

    const header = Buffer.alloc(8);
    header.writeUInt32LE(opcode, 0);
    header.writeUInt32LE(payload.length, 4);

    socket.write(Buffer.concat([header, payload]));

    return true;
}

function updatePresence() {
    if (!connected) {
        return false;
    }

    return sendFrame(1, {
        cmd: "SET_ACTIVITY",
        nonce: createNonce(),
        args: {
            pid: process.pid,
            activity: {
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
            }
        }
    });
}

function disconnect() {
    connected = false;

    if (socket) {
        socket.destroy();
        socket = null;
    }
}

function connectToPipe(index = 0) {
    if (connected) {
        return;
    }

    if (index > 9) {
        console.log("[RPC] Discord Desktop não encontrado.");

        scheduleReconnect();
        return;
    }

    const pipe = `\\\\?\\pipe\\discord-ipc-${index}`;

    const newSocket = net.createConnection(pipe);

    newSocket.once("connect", () => {
        socket = newSocket;
        connected = true;

        console.log(`[RPC] Conectado ao Discord através do pipe ${index}.`);

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
            return;
        }

        const rawPayload = buffer
            .subarray(8, 8 + length)
            .toString("utf8");

        try {
            const payload = JSON.parse(rawPayload);

            if (payload.evt === "READY") {
                console.log("[RPC] Discord confirmou a conexão.");

                updatePresence();

                console.log("[RPC] Rich Presence enviado.");
            }

            if (payload.evt === "ERROR") {
                console.error("[RPC] Discord retornou um erro:");
                console.error(payload.data);
            }
        } catch (error) {
            console.error("[RPC] Falha ao interpretar resposta do Discord.");
        }

        if (opcode === 3) {
            console.log("[RPC] Evento recebido do Discord.");
        }
    });

    newSocket.once("close", () => {
        if (socket === newSocket) {
            disconnect();
            scheduleReconnect();
        }
    });

    newSocket.once("error", () => {
        newSocket.destroy();

        if (!connected) {
            connectToPipe(index + 1);
        }
    });
}

function scheduleReconnect() {
    if (reconnectTimer) {
        return;
    }

    reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connectToPipe(0);
    }, 5000);
}

function sendJson(response, status, data) {
    response.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type"
    });

    response.end(JSON.stringify(data));
}

const server = http.createServer((request, response) => {
    if (request.method === "OPTIONS") {
        sendJson(response, 204, {});
        return;
    }

    if (request.method === "GET" && request.url === "/status") {
        sendJson(response, 200, {
            connected,
            presence
        });

        return;
    }

    if (request.method === "POST" && request.url === "/presence") {
        let body = "";

        request.on("data", chunk => {
            body += chunk;
        });

        request.on("end", () => {
            try {
                const data = JSON.parse(body);

                if (typeof data.details === "string") {
                    presence.details = data.details;
                }

                if (typeof data.state === "string") {
                    presence.state = data.state;
                }

                if (typeof data.start === "number") {
                    presence.start = data.start;
                }

                updatePresence();

                sendJson(response, 200, {
                    success: true,
                    connected,
                    presence
                });
            } catch {
                sendJson(response, 400, {
                    success: false,
                    error: "JSON inválido."
                });
            }
        });

        return;
    }

    sendJson(response, 404, {
        success: false,
        error: "Endpoint não encontrado."
    });
});

server.listen(HTTP_PORT, HTTP_HOST, () => {
    console.log(
        `[RPC] Bridge iniciada em http://${HTTP_HOST}:${HTTP_PORT}`
    );

    connectToPipe(0);
});