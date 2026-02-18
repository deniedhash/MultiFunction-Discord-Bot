# MultiFunction Discord Bot

A feature-rich Discord bot built with discord.js v14 featuring music playback, GitHub webhook notifications, and API-based GitHub file mirroring.

## Features

### Music Playback
Stream music from YouTube, Spotify, and SoundCloud directly in voice channels.

| Command | Description |
|---------|-------------|
| `!play <query/url>` | Play a song or add it to the queue |
| `!skip` | Skip the current track |
| `!stop` | Stop playback and leave the channel |
| `!pause` | Pause the current track |
| `!resume` | Resume playback |
| `!queue` | Show the current queue |
| `!nowplaying` | Show the currently playing track |

### GitHub Webhook Notifications
Receive real-time GitHub events (pushes, PRs, issues, branch activity) as Discord embeds via webhooks.

| Command | Description |
|---------|-------------|
| `!repo add owner/name` | Track a repo — creates a category + channel, shows webhook setup instructions |
| `!repo remove owner/name` | Stop tracking a repo and clean up channels |
| `!repo list` | List all tracked repos in the server |

### GitHub File Mirroring
Authenticate with GitHub and mirror repository files directly into Discord channels — one channel per file, with file contents displayed as code blocks.

| Command | Description |
|---------|-------------|
| `!setgit <token>` | Save your GitHub PAT (message auto-deleted for security) |
| `!seegitinfo` | Show your connected GitHub account info |
| `!cleargit` | Remove your stored GitHub token |
| `!setrepo` | List your GitHub repos |
| `!setrepo <n>` | Select a repo and view its branches |
| `!setrepo_branch <n>` | Sync a branch — creates channels with file contents (up to 50 files) |
| `!updaterepo` | Re-fetch and update all synced file contents |
| `!changegitbranch` | Switch branch on a synced repo |
| `!changegitbranch_select <n>` | Confirm branch switch and re-sync files |
| `!clearrepo [n]` | Remove a synced repo and its channels |
| `!listrepos` | List all synced repos with details |
| `!clearallrepos` | Remove all synced repos (with confirmation) |

### General
| Command | Description |
|---------|-------------|
| `!help` | List all available commands |
| `!ping` | Check bot latency |
| `!userinfo [@user]` | Show user information |
| `!serverinfo` | Show server information |
| `!avatar [@user]` | Show a user's avatar |

## Setup

### Prerequisites
- [Node.js](https://nodejs.org/) v18+
- [pnpm](https://pnpm.io/)
- [MongoDB](https://www.mongodb.com/) instance
- [FFmpeg](https://ffmpeg.org/) (for music playback)
- A [Discord bot token](https://discord.com/developers/applications)

### Installation

```bash
git clone https://github.com/deniedhash/MultiFunction-Discord-Bot.git
cd MultiFunction-Discord-Bot
pnpm install
```

### Configuration

Copy the example environment file and fill in your values:

```bash
cp .env.example .env
```

| Variable | Description | Default |
|----------|-------------|---------|
| `DISCORD_TOKEN` | Your Discord bot token | *required* |
| `PREFIX` | Command prefix | `!` |
| `MONGO_URI` | MongoDB connection string | `mongodb://localhost:27017/discord-bot` |
| `WEBHOOK_PORT` | Port for GitHub webhook server | `3000` |
| `WEBHOOK_SECRET` | Secret for validating GitHub webhook signatures | *optional* |
| `SPOTIFY_CLIENT_ID` | Spotify app client ID (for Spotify playback) | *optional* |
| `SPOTIFY_CLIENT_SECRET` | Spotify app client secret | *optional* |

### Required Discord Bot Settings

In the [Discord Developer Portal](https://discord.com/developers/applications), enable these under **Bot > Privileged Gateway Intents**:
- **Message Content Intent** (required for prefix commands)

**Bot Permissions** needed:
- Send Messages
- Manage Messages
- Manage Channels
- Read Message History
- Embed Links
- Connect
- Speak

### Running

```bash
pnpm start
```

## Docker

```bash
docker build -t discord-bot .
docker run -d --env-file .env discord-bot
```

Or with a MongoDB container:

```bash
# Start MongoDB
docker run -d --name mongo -p 27017:27017 mongo:7

# Start the bot (link to MongoDB)
docker run -d --env-file .env --link mongo:mongo \
  -e MONGO_URI=mongodb://mongo:27017/discord-bot \
  discord-bot
```

## Project Structure

```
.
├── index.js                          # Entry point
├── config.js                         # Environment config
├── Dockerfile
├── src/
│   ├── handlers/
│   │   ├── commandHandler.js         # Auto-loads commands from src/commands/
│   │   ├── eventHandler.js           # Loads Discord events
│   │   └── playerHandler.js          # Music player events
│   ├── commands/
│   │   ├── general/                  # ping, help, userinfo, serverinfo, avatar
│   │   ├── music/                    # play, skip, stop, queue, nowplaying, pause, resume
│   │   └── github/                   # repo, setgit, seegitinfo, setrepo, etc.
│   ├── events/
│   │   ├── ready.js
│   │   └── messageCreate.js
│   └── github/
│       ├── webhookServer.js          # Express server for GitHub webhooks
│       ├── eventHandler.js           # Processes webhook events into embeds
│       ├── channelManager.js         # Creates/manages repo channels
│       ├── store.js                  # Mongoose model for webhook repo tracking
│       ├── gitAuthModel.js           # Mongoose model for GitHub PATs
│       └── repoSetupModel.js         # Mongoose model for file-mirror setups
```

## Adding a New Command

Create a file in `src/commands/<category>/` exporting:

```js
module.exports = {
    name: 'commandname',
    description: 'What it does',
    category: 'category',

    async prefixExecute(message, args) {
        // your logic here
    },
};
```

The command handler auto-discovers all `.js` files in command subdirectories. The `!help` command auto-generates from loaded commands grouped by `category`.

## Tech Stack

- **Runtime:** Node.js (CommonJS)
- **Package Manager:** pnpm
- **Framework:** discord.js v14
- **Music:** discord-player v6 + @discord-player/extractor
- **GitHub Webhooks:** express
- **GitHub API:** axios
- **Database:** MongoDB via mongoose

## License

ISC
