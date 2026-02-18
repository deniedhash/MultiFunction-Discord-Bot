const axios = require('axios');
const { EmbedBuilder } = require('discord.js');
const { getGitAuths, decrypt } = require('../../github/gitAuthModel');

module.exports = {
    name: 'seegitinfo',
    description: 'Show your connected GitHub account info',
    category: 'github',

    async prefixExecute(message) {
        const doc = await getGitAuths(message.guild.id);
        const users = doc.users instanceof Map ? Object.fromEntries(doc.users) : (doc.users || {});
        const userData = users[message.author.id];

        if (!userData || !userData.token) {
            return message.reply('You have not set a GitHub token. Use `!setgit <token>` first.');
        }

        try {
            const token = decrypt(userData.token);
            const { data: user } = await axios.get('https://api.github.com/user', {
                headers: { Authorization: `token ${token}` },
            });

            const embed = new EmbedBuilder()
                .setColor(0x2ea44f)
                .setTitle('GitHub Account')
                .setThumbnail(user.avatar_url)
                .addFields(
                    { name: 'Username', value: user.login, inline: true },
                    { name: 'Name', value: user.name || 'N/A', inline: true },
                    { name: 'Public Repos', value: String(user.public_repos), inline: true },
                    { name: 'Profile', value: user.html_url },
                );

            await message.reply({ embeds: [embed] });
        } catch (err) {
            await message.reply('Failed to fetch GitHub info. Your token may be invalid.');
        }
    },
};
