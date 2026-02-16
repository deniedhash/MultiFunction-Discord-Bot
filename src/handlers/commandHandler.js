const fs = require('fs');
const path = require('path');

module.exports = function loadCommands(client) {
    const commandsPath = path.join(__dirname, '..', 'commands');
    const commandFolders = fs.readdirSync(commandsPath);

    for (const folder of commandFolders) {
        const folderPath = path.join(commandsPath, folder);
        const commandFiles = fs.readdirSync(folderPath).filter(f => f.endsWith('.js'));

        for (const file of commandFiles) {
            const command = require(path.join(folderPath, file));
            if (command.name) {
                client.commands.set(command.name, command);
            }
        }
    }

    console.log(`Loaded ${client.commands.size} commands.`);
};
