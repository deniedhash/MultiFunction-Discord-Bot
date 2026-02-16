require('dotenv').config();

module.exports = {
    token: process.env.DISCORD_TOKEN,
    prefix: process.env.PREFIX || '!',
    webhookPort: process.env.WEBHOOK_PORT || 3000,
    webhookSecret: process.env.WEBHOOK_SECRET || '',
    mongoUri: process.env.MONGO_URI || 'mongodb://localhost:27017/discord-bot',
};
