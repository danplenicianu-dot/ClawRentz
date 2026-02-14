// new/mp-client-newui.js - Multiplayer client for the new UI
// Will handle WebSocket connection, sending/receiving messages, and basic lobby state.

const WS_URL = ((location.protocol==='https:'?'wss':'ws') + '://' + location.host).replace('https://rentz.domnuldan.com', 'wss://clawrentz.onrender.com');

let ws = null;
let you = null; // {seat, name, id}
let room = null; // current room state
let pending = []; // messages to send when WS is ready
let statusCallback = (text) => console.log('[MP Status]', text); // default status handler

function setStatusHandler(cb) {
    statusCallback = cb;
}

function connect() {
    if (ws && (ws.readyState === 0 || ws.readyState === 1)) return; // Already connecting or connected

    ws = new WebSocket(WS_URL);
    ws.onopen = () => {
        statusCallback('Conectat la server.');
        console.log('[MP] ws open');
        while (pending.length) {
            try { ws.send(pending.shift()); } catch (e) { break; }
        }
    };
    ws.onclose = () => {
        statusCallback('Conexiune pierdută. Încerc reconectarea...');
        console.log('[MP] ws closed');
        ws = null;
        // Basic reconnect logic for now, will enhance later
        setTimeout(connect, 3000);
    };
    ws.onerror = (err) => {
        statusCallback('Eroare conexiune: ' + err.message);
        console.error('[MP] ws error', err);
        try { ws.close(); } catch (e) { }
    };
    ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        handleMessage(msg);
    };
}

function wsSend(obj) {
    const s = JSON.stringify(obj);
    if (ws && ws.readyState === 1) {
        ws.send(s);
    } else {
        pending.push(s);
        if (!ws || ws.readyState > 1) { // Not connected or closed, try to connect
            connect();
        }
    }
}

function handleMessage(msg) {
    console.log('[MP] msg received', msg);

    switch (msg.type) {
        case 'hello':
            // Server acknowledged connection, might send clientId
            break;
        case 'joined':
            you = msg.you;
            room = msg.room;
            statusCallback(`Ești în camera ${room.code}. Jucători: ${room.players.length}/${room.maxHumans}`);
            localStorage.setItem('playerName', you.name); // Save name
            localStorage.setItem('lastRoomCode', room.code); // Save room for rejoin hint
            // Event to notify UI that room is joined/updated
            document.dispatchEvent(new CustomEvent('mp:roomJoined', { detail: { you, room } }));
            break;
        case 'room_update':
            // Server sends updates about players joining/leaving
            room = msg.room;
            statusCallback(`Camera ${room.code}. Jucători: ${room.players.length}/${room.maxHumans}`);
            document.dispatchEvent(new CustomEvent('mp:roomUpdate', { detail: { room } }));
            break;
        case 'error':
            statusCallback(`Eroare: ${msg.message}`);
            document.dispatchEvent(new CustomEvent('mp:error', { detail: { message: msg.message } }));
            break;
        // More game-specific messages will go here later
        default:
            console.warn('[MP] Unknown message type', msg.type, msg);
    }
}

// Public API for the UI.
export const mp = {
    connect,
    wsSend,
    setStatusHandler,
    createRoom: (name, maxHumans = 4) => {
        wsSend({ type: 'create', name, maxHumans });
        statusCallback(`Se creează camera pentru ${name}...`);
    },
    joinRoom: (code, name) => {
        wsSend({ type: 'join', code, name });
        statusCallback(`Se intră în camera ${code} pentru ${name}...`);
    },
    getRoom: () => room,
    getYou: () => you,
    getPlayerName: () => localStorage.getItem('playerName') || 'Jucător',
    getLastRoomCode: () => localStorage.getItem('lastRoomCode')
};

// Auto-connect on script load
// connect(); // Don't auto-connect, let UI trigger it.
