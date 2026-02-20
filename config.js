require('dotenv').config();

module.exports = {
    token: process.env.DISCORD_TOKEN,
    prefix: process.env.PREFIX || '!',
    webhookPort: process.env.WEBHOOK_PORT || 3000,
    webhookSecret: process.env.WEBHOOK_SECRET || '',
    mongoUri: process.env.MONGO_URI || 'mongodb://localhost:27017/discord-bot',
    spotifyClientId: process.env.SPOTIFY_CLIENT_ID || '',
    spotifyClientSecret: process.env.SPOTIFY_CLIENT_SECRET || '',
    encryptionKey: process.env.ENCRYPTION_KEY || '',
    webhookUrl: process.env.WEBHOOK_URL || '',
    bugDeleteDelay: parseInt(process.env.BUG_DELETE_DELAY) || 86400,
};
