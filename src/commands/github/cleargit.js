const { getGitAuths, saveGitAuths } = require('../../github/gitAuthModel');

module.exports = {
    name: 'cleargit',
    description: 'Remove your stored GitHub token',
    category: 'github',

    async prefixExecute(message) {
        const doc = await getGitAuths(message.guild.id);
        const users = doc.users instanceof Map ? Object.fromEntries(doc.users) : (doc.users || {});

        if (!users[message.author.id]) {
            return message.reply('You have no GitHub token stored.');
        }

        delete users[message.author.id];
        await saveGitAuths(message.guild.id, users);

        await message.reply('Your GitHub token has been removed.');
    },
};
