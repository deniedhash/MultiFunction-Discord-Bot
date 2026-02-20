const { getQueue } = require('../../music/queue');

function parseTimestamp(input) {
    const parts = input.split(':');
    if (parts.length === 2) {
        const mins = parseInt(parts[0], 10);
        const secs = parseInt(parts[1], 10);
        if (isNaN(mins) || isNaN(secs)) return null;
        return mins * 60 + secs;
    }
    if (parts.length === 3) {
        const hrs = parseInt(parts[0], 10);
        const mins = parseInt(parts[1], 10);
        const secs = parseInt(parts[2], 10);
        if (isNaN(hrs) || isNaN(mins) || isNaN(secs)) return null;
        return hrs * 3600 + mins * 60 + secs;
    }
    const num = parseInt(input, 10);
    return isNaN(num) ? null : num;
}

function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
}

module.exports = {
    name: 'seek',
    aliases: ['sk'],
    description: 'Seek to a position in the current track (e.g. !seek 1:30)',
    category: 'Music',
    async prefixExecute(message, args) {
        const queue = getQueue(message.guild.id);
        if (!queue || !queue.current) {
            return message.reply('Nothing is playing right now.');
        }

        if (!args[0]) {
            return message.reply('Usage: `!seek <M:SS>` or `!seek <seconds>`');
        }

        const seconds = parseTimestamp(args[0]);
        if (seconds === null || seconds < 0) {
            return message.reply('Invalid timestamp. Use `M:SS` or a number of seconds.');
        }

        if (queue.current.duration && seconds > queue.current.duration) {
            return message.reply(`Track is only **${formatTime(queue.current.duration)}** long.`);
        }

        await queue.seek(seconds);
        message.reply(`Seeked to **${formatTime(seconds)}**.`);
    },
};
