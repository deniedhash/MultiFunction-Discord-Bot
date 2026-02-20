const os = require('os');

module.exports = {
    name: 'cpu',
    description: 'Shows CPU usage and info',

    async prefixExecute(message) {
        const cpus = os.cpus();
        const model = cpus[0]?.model || 'Unknown';
        const cores = cpus.length;

        // Calculate average CPU usage across all cores
        let totalIdle = 0;
        let totalTick = 0;
        for (const cpu of cpus) {
            for (const type of Object.values(cpu.times)) totalTick += type;
            totalIdle += cpu.times.idle;
        }
        const usagePercent = (100 - (totalIdle / totalTick) * 100).toFixed(1);

        await message.reply(
            `**CPU:** ${model}\n**Cores:** ${cores}\n**Usage:** ${usagePercent}%`,
        );
    },
};
