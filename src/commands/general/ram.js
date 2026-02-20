const os = require('os');

function formatBytes(bytes) {
    const mb = bytes / 1024 / 1024;
    return mb >= 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${mb.toFixed(1)} MB`;
}

module.exports = {
    name: 'ram',
    aliases: ['memory'],
    description: 'Shows memory usage',

    async prefixExecute(message) {
        const botUsed = process.memoryUsage().rss;
        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const usedMem = totalMem - freeMem;

        await message.reply(
            `**Bot:** ${formatBytes(botUsed)}\n**System:** ${formatBytes(usedMem)} / ${formatBytes(totalMem)} (${((usedMem / totalMem) * 100).toFixed(1)}% used)`,
        );
    },
};
