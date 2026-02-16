const { getQueue } = require('../../music/queue');

module.exports = {
    name: 'pause',
    aliases: ['pa'],
    description: 'Pause the current track',
    category: 'Music',

    async prefixExecute(message) {
        const queue = getQueue(message.guild.id);
        if (!queue || !queue.playing) return message.reply('Nothing is playing.');
        queue.pause();
        await message.reply('Paused.');
    },
};
