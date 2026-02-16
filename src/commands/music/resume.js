const { getQueue } = require('../../music/queue');

module.exports = {
    name: 'resume',
    aliases: ['r'],
    description: 'Resume the paused track',
    category: 'Music',

    async prefixExecute(message) {
        const queue = getQueue(message.guild.id);
        if (!queue || !queue.current) return message.reply('Nothing is paused.');
        queue.resume();
        await message.reply('Resumed.');
    },
};
