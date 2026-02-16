# Discord Bot

Discord bot built with discord.js v14, using prefix commands, with music playback via discord-player and GitHub repo activity tracking via webhooks.

## Tech Stack
- **Runtime:** Node.js (CommonJS)
- **Package Manager:** pnpm
- **Framework:** discord.js v14
- **Music:** discord-player v6 + @discord-player/extractor
- **GitHub Webhooks:** express (HTTP server for receiving GitHub events)
- **Database:** MongoDB via mongoose

## Project Structure
- `index.js` — Entry point: creates Client, Player, loads handlers, logs in
- `config.js` — Reads `.env` and exports token, prefix
- `src/handlers/` — commandHandler, eventHandler, playerHandler
- `src/commands/general/` — ping, help, userinfo, serverinfo, avatar
- `src/commands/music/` — play, skip, stop, queue, nowplaying, pause, resume
- `src/commands/github/` — repo (add/remove/list)
- `src/github/` — webhookServer, eventHandler, channelManager, store
- MongoDB `repos` collection — Persisted repo-to-guild/channel mappings (one doc per repo+guild pair)
- `src/events/` — ready, messageCreate

## Commands
- `pnpm start` — Run the bot

## Adding a New Command
Create a file in `src/commands/<category>/` exporting:
- `name` — Command name (string)
- `description` — Command description (string)
- `prefixExecute(message, args)` — Prefix command handler
- `category` (optional) — String for help grouping

## GitHub Repo Tracking
- `!repo add owner/name` — Links a GitHub repo, creates a category + #main channel, shows webhook setup instructions
- `!repo remove owner/name` — Unlinks a repo and cleans up channels
- `!repo list` — Lists all tracked repos in the server
- Same repo can be tracked in multiple servers — webhook events fan out to all linked guilds
- GitHub webhook events (push, PR, issues, branch create/delete) are posted as embeds to per-branch channels
- Webhook endpoint: `POST /webhook` on the configured port

## Environment Variables (.env)
- `DISCORD_TOKEN` — Bot token
- `PREFIX` — Prefix for text commands (default: `!`)
- `WEBHOOK_PORT` — Port for GitHub webhook server (default: `3000`)
- `WEBHOOK_SECRET` — Secret for validating GitHub webhook signatures (optional)
- `MONGO_URI` — MongoDB connection string (default: `mongodb://localhost:27017/discord-bot`)

## Required Discord Intents
Guilds, GuildMessages, MessageContent (privileged), GuildVoiceStates
