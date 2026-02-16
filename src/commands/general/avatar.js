const { EmbedBuilder } = require('discord.js');

function buildEmbed(user) {
    return new EmbedBuilder()
        .setTitle(`${user.tag}'s Avatar`)
        .setImage(user.displayAvatarURL({ size: 512 }))
        .setColor(0x5865f2);
}

module.exports = {
    name: 'avatar',
    aliases: ['av', 'pfp'],
    description: "Shows a user's avatar",
    category: 'General',

    async prefixExecute(message) {
        const user = message.mentions.users.first() || message.author;
        await message.reply({ embeds: [buildEmbed(user)] });
    },
};
