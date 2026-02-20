const { Events } = require('discord.js');
const { initBugSystem } = require('../bugs/bugStartup');

module.exports = {
    name: Events.ClientReady,
    once: true,
    async execute(client) {
        console.log(`Logged in as ${client.user.tag}`);
        try {
            await initBugSystem(client);
        } catch (err) {
            console.error('Bug system init error:', err);
        }
    },
};
