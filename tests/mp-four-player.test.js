const assert = require('assert');
const { spawn } = require('child_process');

const PORT = process.env.TEST_PORT || 5199;
const WS_URL = `ws://127.0.0.1:${PORT}`;
const HTTP_URL = `http://127.0.0.1:${PORT}`;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForHealth() {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${HTTP_URL}/health`);
      if (response.ok) return;
    } catch (error) {
      // Server is still starting.
    }
    await wait(150);
  }
  throw new Error('Server did not become healthy.');
}

function connectPlayer(name) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL);
    const messages = [];
    const timer = setTimeout(() => reject(new Error(`${name} connection timed out`)), 8000);

    ws.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      messages.push(message);
      if (message.type === 'hello') {
        clearTimeout(timer);
        resolve({ name, ws, messages });
      }
    });
    ws.addEventListener('error', () => reject(new Error(`${name} websocket error`)));
  });
}

function waitForMessage(player, type, predicate = () => true, timeout = 8000) {
  const existing = player.messages.find((message) => message.type === type && predicate(message));
  if (existing) return Promise.resolve(existing);

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      player.ws.removeEventListener('message', onMessage);
      reject(new Error(`${player.name} did not receive ${type}`));
    }, timeout);

    function onMessage(event) {
      const message = JSON.parse(event.data);
      player.messages.push(message);
      if (message.type === type && predicate(message)) {
        clearTimeout(timer);
        player.ws.removeEventListener('message', onMessage);
        resolve(message);
      }
    }

    player.ws.addEventListener('message', onMessage);
  });
}

async function main() {
  const server = spawn(process.execPath, ['server.js'], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let serverOutput = '';
  server.stdout.on('data', (chunk) => { serverOutput += chunk.toString(); });
  server.stderr.on('data', (chunk) => { serverOutput += chunk.toString(); });

  try {
    await waitForHealth();

    const players = [];
    for (const name of ['Ana', 'Bogdan', 'Cristi', 'Dana']) {
      players.push(await connectPlayer(name));
    }

    players[0].ws.send(JSON.stringify({ type: 'create', name: players[0].name, maxHumans: 4 }));
    const created = await waitForMessage(players[0], 'joined');
    const code = created.room.code;
    assert.match(code, /^\d{6}$/);
    assert.strictEqual(created.you.seat, 0);

    for (let i = 1; i < players.length; i += 1) {
      players[i].ws.send(JSON.stringify({ type: 'join', code, name: players[i].name }));
      const joined = await waitForMessage(players[i], 'joined');
      assert.strictEqual(joined.room.code, code);
      assert.strictEqual(joined.you.seat, i);
    }

    players[1].ws.send(JSON.stringify({ type: 'join', code, name: players[1].name }));
    const duplicateJoin = await waitForMessage(players[1], 'joined', (message) => message.room.code === code);
    assert.strictEqual(duplicateJoin.you.seat, 1);
    const duplicateRoomUpdate = await waitForMessage(
      players[0],
      'room_update',
      (message) => message.room.code === code && message.room.connectedHumans === 4,
    );
    assert.strictEqual(duplicateRoomUpdate.room.players.length, 4);
    assert.deepStrictEqual(
      duplicateRoomUpdate.room.players.map((player) => player.name),
      ['Ana', 'Bogdan', 'Cristi', 'Dana'],
    );

    await waitForMessage(players[0], 'room_update', (message) => message.room.connectedHumans === 4);

    players[0].ws.send(JSON.stringify({ type: 'start' }));
    const initStates = [];
    for (const player of players) {
      const init = await waitForMessage(player, 'init_state');
      assert.strictEqual(init.room.started, true);
      assert.strictEqual(init.state.players.length, 4);
      assert.strictEqual(init.state.players[player.messages.find((m) => m.type === 'joined').you.seat].hand.length, 8);
      const revealedHands = init.state.players.filter((seat) => seat.hand.every((card) => card.suit && card.rank));
      assert.strictEqual(revealedHands.length, player === players[0] ? 1 : 1);
      initStates.push(init.state);
    }

    const chooser = players[0];
    chooser.ws.send(JSON.stringify({ type: 'choose_game', gameName: 'Whist' }));
    for (const player of players) {
      const choose = await waitForMessage(player, 'choose_game', (message) => message.gameName === 'Whist');
      assert.strictEqual(choose.chooserIndex, 0);
    }

    for (let cardIndex = 0; cardIndex < 8; cardIndex += 1) {
      for (let seat = 0; seat < 4; seat += 1) {
        const hand = initStates[seat].players[seat].hand;
        const card = hand[cardIndex];
        players[seat].ws.send(JSON.stringify({ type: 'play_card', card }));
        for (const observer of players) {
          await waitForMessage(
            observer,
            'play_card',
            (message) => message.seat === seat && message.card.id === card.id,
          );
        }
      }
    }

    players[0].ws.send(JSON.stringify({ type: 'round_end', gameName: 'Whist', scores: [1, 2, 3, 4] }));
    for (const player of players) {
      const totals = await waitForMessage(player, 'totals_update');
      assert.deepStrictEqual(totals.totals, [1, 2, 3, 4]);
      const chosen = await waitForMessage(player, 'chosen_update');
      assert.deepStrictEqual(chosen.chosenGames[0], ['Whist']);
    }

    players[0].ws.send(JSON.stringify({ type: 'next_round' }));
    for (const player of players) {
      const nextRound = await waitForMessage(player, 'init_state', (message) => message.state.chooserIndex === 1);
      assert.strictEqual(nextRound.room.started, true);
      assert.deepStrictEqual(nextRound.totals, [1, 2, 3, 4]);
    }

    for (const player of players) player.ws.close();
    console.log('MP four-player start, full round, and next round passed.');
  } catch (error) {
    console.error(serverOutput);
    throw error;
  } finally {
    server.kill();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
