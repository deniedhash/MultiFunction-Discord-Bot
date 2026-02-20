const { getQueue } = require('../../music/queue');
const { saveVolume } = require('../../music/guildSettingsModel');

module.exports = {
    name: 'volume',
    aliases: ['vol', 'v'],
    description: 'Show or set playback volume (1-100)',
    category: 'Music',

    async prefixExecute(message, args) {
        const queue = getQueue(message.guild.id);
        if (!queue || !queue.current) return message.reply('Nothing is playing.');

        if (!args[0]) {
            return message.reply(`Current volume: **${Math.round(queue.volume * 100)}%**`);
        }

        const vol = parseInt(args[0], 10);
        if (isNaN(vol) || vol < 1 || vol > 100) {
            return message.reply('Please provide a number between 1 and 100.');
        }

        queue.setVolume(vol / 100);
        await saveVolume(message.guild.id, vol / 100);
        await message.reply(`Volume set to **${vol}%**`);
    },
};
