const { Events } = require('discord.js');
const { prefix } = require('../../config');

module.exports = {
    name: Events.MessageCreate,
    async execute(message) {
        if (message.author.bot) return;
        if (!message.content.startsWith(prefix)) return;

        const args = message.content.slice(prefix.length).trim().split(/\s+/);
        const commandName = args.shift().toLowerCase();

        const command = message.client.commands.get(commandName)
            || message.client.commands.find(c => c.aliases && c.aliases.includes(commandName));
        if (!command || !command.prefixExecute) return;

        try {
            await command.prefixExecute(message, args);
        } catch (error) {
            console.error(`Error executing ${prefix}${commandName}:`, error);
            await message.reply('There was an error executing this command.');
        }
    },
};
