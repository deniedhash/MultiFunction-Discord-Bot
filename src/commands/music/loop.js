const { getQueue } = require('../../music/queue');

module.exports = {
    name: 'loop',
    aliases: ['lp'],
    description: 'Set loop mode (track, queue, or off)',
    category: 'Music',
    prefixExecute(message, args) {
        const queue = getQueue(message.guild.id);
        if (!queue || !queue.current) {
            return message.reply('Nothing is playing right now.');
        }

        const mode = (args[0] || 'track').toLowerCase();
        if (!['track', 'queue', 'off'].includes(mode)) {
            return message.reply('Invalid mode. Use `track`, `queue`, or `off`.');
        }

        queue.setLoop(mode);

        const labels = {
            track: 'Looping **current track**.',
            queue: 'Looping **entire queue**.',
            off: 'Loop **disabled**.',
        };
        message.reply(labels[mode]);
    },
};
