# Rentz Multiplayer

This repository contains the **Rentz** multiplayer card game and the WebSocket server used by the public static UI.

## Features

- Static desktop/mobile game UI served from `index.html`.
- WebSocket multiplayer rooms for 4 players.
- Host-controlled game start and round progression.
- Server health endpoint at `/health`.
- Automated 4-player multiplayer smoke test.

## Running locally

1. Install dependencies:

```
npm install
```

2. Start the multiplayer server:

```
npm start
```

Open [http://localhost:5177](http://localhost:5177) to see the app. You can open multiple browser tabs to simulate multiple players.

## Tests

Run the 4-player multiplayer flow:

```
npm run test:mp
```

The test starts the server, connects 4 players, creates a room, starts a match, plays one full round, records scores, and starts the next round.

## Deployment

For Render or similar Node hosts, use:

```
npm install
npm start
```

The public GitHub Pages URL should use the `github.io` address unless the custom domain has a valid HTTPS certificate.

## License

MIT
