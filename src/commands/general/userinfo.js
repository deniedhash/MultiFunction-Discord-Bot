const { EmbedBuilder } = require('discord.js');

function buildEmbed(user, member) {
    const embed = new EmbedBuilder()
        .setTitle(user.tag)
        .setThumbnail(user.displayAvatarURL({ size: 256 }))
        .setColor(member?.displayHexColor || 0x5865f2)
        .addFields(
            { name: 'ID', value: user.id, inline: true },
            { name: 'Created', value: `<t:${Math.floor(user.createdTimestamp / 1000)}:R>`, inline: true },
        );

    if (member) {
        embed.addFields({ name: 'Joined Server', value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>`, inline: true });
    }

    return embed;
}

module.exports = {
    name: 'userinfo',
    aliases: ['ui', 'whois'],
    description: 'Shows info about a user',
    category: 'General',

    async prefixExecute(message) {
        const user = message.mentions.users.first() || message.author;
        const member = message.guild?.members.cache.get(user.id);
        await message.reply({ embeds: [buildEmbed(user, member)] });
    },
};
