# Discord Bot

Discord bot built with discord.js v14, using prefix commands, with music playback via discord-player, GitHub repo activity tracking via webhooks, and API-based GitHub file mirroring.

## Tech Stack
- **Runtime:** Node.js (CommonJS)
- **Package Manager:** pnpm
- **Framework:** discord.js v14
- **Music:** discord-player v6 + @discord-player/extractor
- **GitHub Webhooks:** express (HTTP server for receiving GitHub events)
- **GitHub API:** axios (file mirroring via GitHub REST API)
- **Database:** MongoDB via mongoose

## Project Structure
- `index.js` — Entry point: creates Client, Player, loads handlers, logs in
- `config.js` — Reads `.env` and exports token, prefix
- `src/handlers/` — commandHandler, eventHandler, playerHandler
- `src/commands/general/` — ping, help, userinfo, serverinfo, avatar, note, uptime, cpu, ram
- `src/commands/music/` — play, skip, stop, queue, nowplaying, pause, resume, volume, loop, shuffle, seek
- `src/commands/bugs/` — addbug
- `src/bugs/bugManager.js` — Bug channel/embed helpers, lifecycle management (WIP, resolve, reopen, auto-cleanup)
- `src/bugs/bugModel.js` — Mongoose model for bugs
- `src/music/queue.js` — Queue management, loop modes, shuffle, seek
- `src/music/ytdlp.js` — yt-dlp streaming (with android client for YouTube) and search
- `src/music/guildSettingsModel.js` — Mongoose model for per-guild settings (volume)
- MongoDB `guildsettings` collection — Persisted per-guild settings (volume)
- `src/commands/github/` — setgit, seegitinfo, cleargit, setrepo, mirror, unmirror, updaterepo, changegitbranch, clearrepo, listrepos, clearallrepos
- `src/github/` — webhookServer, eventHandler, gitAuthModel, repoSetupModel
- MongoDB `gitauths` collection — GitHub PATs per user per server
- MongoDB `reposetups` collection — File-mirror repo setups per server
- MongoDB `bugs` collection — Bug reports per guild/repo
- `src/events/` — ready, messageCreate

## Commands
- `pnpm start` — Run the bot

## Adding a New Command
Create a file in `src/commands/<category>/` exporting:
- `name` — Command name (string)
- `description` — Command description (string)
- `prefixExecute(message, args)` — Prefix command handler
- `category` (optional) — String for help grouping

## GitHub Repo Setup & Webhook Tracking
- `!setrepo` — Interactive: select menu for repo → select menu for branch → creates category + #git-updates channel + webhook
- Repos set up via `!setrepo` are tracked for webhook events (push, PR, issues, branch create/delete)
- All webhook events are posted as embeds to the `#git-updates` channel under the repo's category
- Same repo can be set up in multiple servers — webhook events fan out to all linked guilds
- Webhook endpoint: `POST /webhook` on the configured port

## GitHub File Mirroring (API-based)
- `!mirror` — Interactive: select menu for repo (skipped if single repo), mirrors files into channels (up to 50 files)
- `!unmirror` — Interactive: removes mirrored file channels, keeps category and #git-updates
- `!updaterepo` — Re-fetch and update mirrored file contents
- `!changegitbranch` — Interactive: select menu for repo → select menu for branch, re-syncs files
- `!clearrepo [n]` — Remove a synced repo and its channels
- `!listrepos` — List all synced repos
- `!clearallrepos` — Remove all synced repos (with confirmation)
- Auto-sync on push only runs for repos that have been mirrored

## GitHub Authentication
- `!setgit <token>` — Save GitHub PAT for this server (auto-deletes message)
- `!seegitinfo` — Show connected GitHub account info
- `!cleargit` — Remove stored GitHub token

## Environment Variables (.env)
- `DISCORD_TOKEN` — Bot token
- `PREFIX` — Prefix for text commands (default: `!`)
- `WEBHOOK_PORT` — Port for GitHub webhook server (default: `3000`)
- `WEBHOOK_SECRET` — Secret for validating GitHub webhook signatures (optional)
- `MONGO_URI` — MongoDB connection string (default: `mongodb://localhost:27017/discord-bot`)
- `ENCRYPTION_KEY` — Key used to encrypt/decrypt stored GitHub PATs (required for file mirroring)
- `WEBHOOK_URL` — Public URL of the bot server for auto-creating GitHub webhooks (optional)

## Required Discord Intents
Guilds, GuildMessages, MessageContent (privileged), GuildVoiceStates
