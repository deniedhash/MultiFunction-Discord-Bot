const { EmbedBuilder } = require('discord.js');

function buildEmbed(guild) {
    return new EmbedBuilder()
        .setTitle(guild.name)
        .setThumbnail(guild.iconURL({ size: 256 }))
        .setColor(0x5865f2)
        .addFields(
            { name: 'Owner', value: `<@${guild.ownerId}>`, inline: true },
            { name: 'Members', value: `${guild.memberCount}`, inline: true },
            { name: 'Channels', value: `${guild.channels.cache.size}`, inline: true },
            { name: 'Roles', value: `${guild.roles.cache.size}`, inline: true },
            { name: 'Created', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:R>`, inline: true },
        );
}

module.exports = {
    name: 'serverinfo',
    aliases: ['si', 'server'],
    description: 'Shows info about this server',
    category: 'General',

    async prefixExecute(message) {
        if (!message.guild) return message.reply('This command can only be used in a server.');
        await message.reply({ embeds: [buildEmbed(message.guild)] });
    },
};
