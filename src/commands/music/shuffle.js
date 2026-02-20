const { getQueue } = require('../../music/queue');

module.exports = {
    name: 'shuffle',
    aliases: ['sh'],
    description: 'Shuffle the tracks in the queue',
    category: 'Music',
    prefixExecute(message) {
        const queue = getQueue(message.guild.id);
        if (!queue || !queue.current) {
            return message.reply('Nothing is playing right now.');
        }

        if (queue.tracks.length < 2) {
            return message.reply('Need at least 2 tracks in the queue to shuffle.');
        }

        queue.shuffle();
        message.reply(`Shuffled **${queue.tracks.length}** tracks in the queue.`);
    },
};
