const { EmbedBuilder } = require('discord.js');
const { prefix } = require('../../../config');

function buildHelpEmbed(commands) {
    const embed = new EmbedBuilder()
        .setTitle('Bot Commands')
        .setColor(0x5865f2);

    const grouped = {};
    for (const [, cmd] of commands) {
        const category = cmd.category || 'General';
        if (!grouped[category]) grouped[category] = [];
        const aliases = cmd.aliases ? ` (${cmd.aliases.map(a => `\`${a}\``).join(', ')})` : '';
        grouped[category].push(`\`${cmd.name}\`${aliases} — ${cmd.description}`);
    }

    for (const [category, cmds] of Object.entries(grouped)) {
        embed.addFields({ name: category, value: cmds.join('\n') });
    }

    embed.setFooter({ text: `Prefix: ${prefix}` });
    return embed;
}

module.exports = {
    name: 'help',
    aliases: ['h'],
    description: 'Lists all available commands',
    category: 'General',

    async prefixExecute(message) {
        const embed = buildHelpEmbed(message.client.commands);
        await message.reply({ embeds: [embed] });
    },
};
