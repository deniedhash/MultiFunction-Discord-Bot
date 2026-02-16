const { getQueue } = require('../../music/queue');

module.exports = {
    name: 'skip',
    aliases: ['s', 'next'],
    description: 'Skip the current song',
    category: 'Music',

    async prefixExecute(message) {
        const queue = getQueue(message.guild.id);
        if (!queue || !queue.current) return message.reply('Nothing is playing.');
        const title = queue.current.title;
        queue.skip();
        await message.reply(`Skipped **${title}**.`);
    },
};
