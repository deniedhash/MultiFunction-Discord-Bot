const { EmbedBuilder } = require('discord.js');
const { getQueue } = require('../../music/queue');

module.exports = {
    name: 'queue',
    aliases: ['q'],
    description: 'Show the current music queue',
    category: 'Music',

    async prefixExecute(message) {
        const queue = getQueue(message.guild.id);
        if (!queue || !queue.current) return message.reply('Nothing is playing.');

        const current = queue.current;
        const tracks = queue.tracks.slice(0, 10);

        const embed = new EmbedBuilder()
            .setTitle('Music Queue')
            .setColor(0x5865f2)
            .setDescription(`**Now Playing:** ${current.title} — ${current.author}\n\n` +
                (tracks.length
                    ? tracks.map((t, i) => `**${i + 1}.** ${t.title} — ${t.author}`).join('\n')
                    : 'No more tracks in queue.'));

        if (queue.tracks.length > 10) {
            embed.setFooter({ text: `...and ${queue.tracks.length - 10} more` });
        }

        await message.reply({ embeds: [embed] });
    },
};
