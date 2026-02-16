const { getQueue } = require('../../music/queue');

module.exports = {
    name: 'stop',
    aliases: ['dc', 'leave', 'disconnect'],
    description: 'Stop playback and clear the queue',
    category: 'Music',

    async prefixExecute(message) {
        const queue = getQueue(message.guild.id);
        if (!queue) return message.reply('Nothing is playing.');
        queue.destroy();
        await message.reply('Stopped and cleared the queue.');
    },
};
