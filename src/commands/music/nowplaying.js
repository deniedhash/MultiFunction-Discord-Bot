const { EmbedBuilder } = require('discord.js');
const { getQueue } = require('../../music/queue');

module.exports = {
    name: 'nowplaying',
    aliases: ['np'],
    description: 'Show the currently playing track',
    category: 'Music',

    async prefixExecute(message) {
        const queue = getQueue(message.guild.id);
        if (!queue || !queue.current) return message.reply('Nothing is playing.');

        const track = queue.current;
        const embed = new EmbedBuilder()
            .setTitle('Now Playing')
            .setDescription(`**${track.title}** by **${track.author}**`)
            .setThumbnail(track.thumbnail)
            .setColor(0x5865f2);

        await message.reply({ embeds: [embed] });
    },
};
