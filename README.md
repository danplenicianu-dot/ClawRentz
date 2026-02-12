# Rentz Multiplayer – Next.js

This is a Next.js/Tailwind skeleton for building the **Rentz** multiplayer card game for `domnuldan.com`.  It uses the Next.js App Router (`src/app`), Tailwind CSS, and TypeScript.

## Features

- **Lobby** page for creating a room or joining a game via code.
- **Game Room** component with placeholder logic (ready for integration with realtime sync).
- Tailwind CSS configured with a simple design that can be customized.
- Placeholder Supabase client for realtime updates (replace with your own Supabase URL and anon key in `.env.local`).
- TypeScript and ESLint enabled.

## Running locally

1. Install dependencies:

```
npm install
```

2. Create a `.env.local` file and set your Supabase credentials (or remove the import if you implement a custom WebSocket server):

```
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

3. Start the development server:

```
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the app.  You can open multiple browser tabs to simulate multiple players.

## Customization

- To add your own logo or images, place them in the `public` directory and reference them in your components.
- Update the UI in `src/app/page.tsx`, `src/components/Lobby.tsx`, and `src/components/GameRoom.tsx` as needed.
- Implement realtime game synchronization by either connecting to Supabase Realtime via the `supabaseClient.ts` or by integrating a custom WebSocket server.

## Deployment

This project can be deployed to Vercel for free.  Once the repository is pushed to GitHub, import it into Vercel and configure environment variables for Supabase (if using).  Point your domain (`domnuldan.com`) to the Vercel project via the Vercel dashboard.

## License

MIT
