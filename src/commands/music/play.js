const { EmbedBuilder } = require('discord.js');
const { createQueue, search } = require('../../music/queue');

function formatDuration(seconds) {
    if (!seconds || isNaN(seconds)) return 'Unknown';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
}

module.exports = {
    name: 'play',
    aliases: ['pl'],
    description: 'Play a song or add it to the queue',
    category: 'Music',

    async prefixExecute(message, args) {
        const query = args.join(' ');
        if (!query) return message.reply('Please provide a song name or URL.');

        const voiceChannel = message.member.voice.channel;
        if (!voiceChannel)
            return message.reply('You need to be in a voice channel.');

        try {
            const track = await search(query);
            const queue = await createQueue(
                message.guild.id,
                voiceChannel,
                message.channel,
            );
            queue.enqueue(track);

            if (!queue.playing) {
                await queue.playNext();
            } else {
                const title = track.url ? `[${track.title}](${track.url})` : track.title;
                const embed = new EmbedBuilder()
                    .setTitle('Added to Queue')
                    .setDescription(title)
                    .setThumbnail(track.thumbnail || null)
                    .setColor(0x57f287)
                    .addFields(
                        { name: 'Author', value: track.author || 'Unknown', inline: true },
                        { name: 'Duration', value: formatDuration(track.duration), inline: true },
                        { name: 'Position', value: `#${queue.tracks.length}`, inline: true },
                    );
                await message.reply({ embeds: [embed] });
            }
        } catch (error) {
            console.error(error);
            await message.reply(
                'Something went wrong while trying to play that track.',
            );
        }
    },
};
