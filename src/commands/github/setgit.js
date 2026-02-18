const { getGitAuths, saveGitAuths, encrypt } = require('../../github/gitAuthModel');

module.exports = {
    name: 'setgit',
    description: 'Save your GitHub PAT for this server (!setgit <token>)',
    category: 'github',

    async prefixExecute(message, args) {
        const token = args[0];
        if (!token) {
            return message.reply('Usage: `!setgit <github_personal_access_token>`');
        }

        // Delete the user's message to protect the token
        try { await message.delete(); } catch {}

        const doc = await getGitAuths(message.guild.id);
        const users = doc.users instanceof Map ? Object.fromEntries(doc.users) : (doc.users || {});
        users[message.author.id] = { token: encrypt(token) };
        await saveGitAuths(message.guild.id, users);

        await message.channel.send(`${message.author}, your GitHub token has been saved. Your message was deleted to protect your token.`);
    },
};
