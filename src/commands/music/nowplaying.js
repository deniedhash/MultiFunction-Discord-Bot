const { EmbedBuilder } = require('discord.js');
const { getQueue } = require('../../music/queue');

function formatDuration(seconds) {
    if (!seconds || isNaN(seconds)) return 'Unknown';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
}

const sourceEmoji = {
    youtube: 'YouTube',
    soundcloud: 'SoundCloud',
    spotify: 'Spotify',
};

module.exports = {
    name: 'nowplaying',
    aliases: ['np'],
    description: 'Show the currently playing track',
    category: 'Music',

    async prefixExecute(message) {
        const queue = getQueue(message.guild.id);
        if (!queue || !queue.current) return message.reply('Nothing is playing.');

        const track = queue.current;
        const title = track.url ? `[${track.title}](${track.url})` : track.title;
        const source = sourceEmoji[track.source] || track.source || 'Unknown';

        const fields = [
            { name: 'Author', value: track.author || 'Unknown', inline: true },
            { name: 'Duration', value: formatDuration(track.duration), inline: true },
            { name: 'Source', value: source, inline: true },
        ];

        if (queue.loopMode !== 'off') {
            fields.push({ name: 'Loop', value: queue.loopMode === 'track' ? 'Track' : 'Queue', inline: true });
        }

        if (queue.tracks.length > 0) {
            fields.push({ name: 'Up Next', value: `${queue.tracks.length} track${queue.tracks.length === 1 ? '' : 's'} in queue`, inline: true });
        }

        const embed = new EmbedBuilder()
            .setTitle('Now Playing')
            .setDescription(title)
            .setThumbnail(track.thumbnail || null)
            .setColor(0x5865f2)
            .addFields(fields);

        await message.reply({ embeds: [embed] });
    },
};
