const axios = require('axios');
const {
    EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder,
    ButtonBuilder, ButtonStyle, ChannelType,
} = require('discord.js');
const { getGitAuths, decrypt } = require('../../github/gitAuthModel');
const { getRepoSetups, saveRepoSetups } = require('../../github/repoSetupModel');
const { webhookSecret, webhookUrl } = require('../../../config');

const PAGE_SIZE = 25; // Discord select menu limit

module.exports = {
    name: 'setrepo',
    description: 'Interactively set up a GitHub repo for tracking',
    category: 'github',

    async prefixExecute(message) {
        const doc = await getGitAuths(message.guild.id);
        const users = doc.users instanceof Map ? Object.fromEntries(doc.users) : (doc.users || {});
        const userData = users[message.author.id];

        if (!userData || !userData.token) {
            return message.reply('You have not set a GitHub token. Use `!setgit <token>` first.');
        }

        const token = decrypt(userData.token);

        // Fetch repos
        let repos;
        try {
            const { data } = await axios.get('https://api.github.com/user/repos', {
                headers: { Authorization: `token ${token}` },
                params: { per_page: 100, sort: 'updated' },
            });
            repos = data;
        } catch {
            return message.reply('Failed to fetch repos. Check your token.');
        }

        if (repos.length === 0) {
            return message.reply('No repositories found on your GitHub account.');
        }

        // Show repo select menu (paginated if >25)
        let page = 0;
        const totalPages = Math.ceil(repos.length / PAGE_SIZE);

        function buildRepoMessage(p) {
            const start = p * PAGE_SIZE;
            const pageRepos = repos.slice(start, start + PAGE_SIZE);

            const menu = new StringSelectMenuBuilder()
                .setCustomId('setrepo_select')
                .setPlaceholder('Select a repository...')
                .addOptions(pageRepos.map(r => ({
                    label: r.full_name.length > 100 ? r.full_name.slice(0, 97) + '...' : r.full_name,
                    value: r.full_name,
                    description: (r.description || 'No description').slice(0, 100),
                })));

            const rows = [new ActionRowBuilder().addComponents(menu)];

            if (totalPages > 1) {
                const nav = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('setrepo_prev')
                        .setLabel('Previous')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(p === 0),
                    new ButtonBuilder()
                        .setCustomId('setrepo_next')
                        .setLabel('Next')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(p === totalPages - 1),
                );
                rows.push(nav);
            }

            const embed = new EmbedBuilder()
                .setTitle('Select a Repository')
                .setDescription(`Showing ${start + 1}–${start + pageRepos.length} of ${repos.length} repos.`)
                .setColor(0x58a6ff);

            return { embeds: [embed], components: rows };
        }

        const reply = await message.reply(buildRepoMessage(page));

        const collector = reply.createMessageComponentCollector({
            filter: (i) => i.user.id === message.author.id,
            time: 120_000,
        });

        let selectedRepo = null;

        collector.on('collect', async (interaction) => {
            // Pagination buttons
            if (interaction.customId === 'setrepo_prev') {
                page = Math.max(0, page - 1);
                return interaction.update(buildRepoMessage(page));
            }
            if (interaction.customId === 'setrepo_next') {
                page = Math.min(totalPages - 1, page + 1);
                return interaction.update(buildRepoMessage(page));
            }

            // Repo selected — fetch branches
            if (interaction.customId === 'setrepo_select') {
                selectedRepo = interaction.values[0];

                let branches;
                try {
                    const { data } = await axios.get(
                        `https://api.github.com/repos/${selectedRepo}/branches`,
                        { headers: { Authorization: `token ${token}` }, params: { per_page: 100 } },
                    );
                    branches = data;
                } catch {
                    return interaction.update({
                        embeds: [new EmbedBuilder().setTitle('Error').setDescription('Failed to fetch branches.').setColor(0xed4245)],
                        components: [],
                    });
                }

                if (branches.length === 0) {
                    return interaction.update({
                        embeds: [new EmbedBuilder().setTitle('Error').setDescription('No branches found.').setColor(0xed4245)],
                        components: [],
                    });
                }

                const branchMenu = new StringSelectMenuBuilder()
                    .setCustomId('setrepo_branch_select')
                    .setPlaceholder('Select a branch...')
                    .addOptions(branches.slice(0, 25).map(b => ({
                        label: b.name.length > 100 ? b.name.slice(0, 97) + '...' : b.name,
                        value: b.name,
                    })));

                const embed = new EmbedBuilder()
                    .setTitle(`Select a Branch — ${selectedRepo}`)
                    .setDescription(`${branches.length} branch${branches.length === 1 ? '' : 'es'} found.`)
                    .setColor(0x58a6ff);

                return interaction.update({
                    embeds: [embed],
                    components: [new ActionRowBuilder().addComponents(branchMenu)],
                });
            }

            // Branch selected — do setup
            if (interaction.customId === 'setrepo_branch_select') {
                const selectedBranch = interaction.values[0];
                collector.stop('completed');

                await interaction.update({
                    embeds: [new EmbedBuilder()
                        .setTitle('Setting up...')
                        .setDescription(`**${selectedRepo}** (branch: \`${selectedBranch}\`)`)
                        .setColor(0xfee75c)],
                    components: [],
                });

                try {
                    // Create category + git-updates channel
                    const category = await message.guild.channels.create({
                        name: selectedRepo.replace('/', '-'),
                        type: ChannelType.GuildCategory,
                    });

                    await message.guild.channels.create({
                        name: 'git-updates',
                        type: ChannelType.GuildText,
                        parent: category.id,
                    });

                    // Save to DB
                    const setupDoc = await getRepoSetups(message.guild.id);
                    const reposData = setupDoc.repos || {};
                    reposData[selectedRepo] = {
                        categoryId: category.id,
                        addedBy: message.author.id,
                        createdAt: new Date().toISOString(),
                        branch: selectedBranch,
                        mirrored: false,
                    };
                    await saveRepoSetups(message.guild.id, reposData);

                    // Auto-create GitHub webhook
                    let webhookStatus = '';
                    if (webhookUrl) {
                        try {
                            const result = await createGithubWebhook(selectedRepo, token);
                            webhookStatus = result.alreadyExists
                                ? '\nGitHub webhook already exists — updates enabled.'
                                : '\nGitHub webhook created — updates will appear in #git-updates.';
                        } catch {
                            webhookStatus = '\nCould not create GitHub webhook. You can set it up manually.';
                        }
                    } else {
                        webhookStatus = '\nSet `WEBHOOK_URL` in .env to enable webhook updates.';
                    }

                    await reply.edit({
                        embeds: [new EmbedBuilder()
                            .setTitle('Repository Set Up')
                            .setDescription(
                                `**${selectedRepo}** (branch: \`${selectedBranch}\`)\n` +
                                `Category: **${category.name}** with #git-updates${webhookStatus}\n\n` +
                                `Use \`!mirror\` to mirror repo files into channels.`,
                            )
                            .setColor(0x57f287)],
                        components: [],
                    });
                } catch (err) {
                    console.error('setrepo setup error:', err);
                    await reply.edit({
                        embeds: [new EmbedBuilder()
                            .setTitle('Setup Failed')
                            .setDescription('Failed to set up repository. Check permissions and try again.')
                            .setColor(0xed4245)],
                        components: [],
                    });
                }
            }
        });

        collector.on('end', (_, reason) => {
            if (reason === 'completed') return;
            reply.edit({
                embeds: [new EmbedBuilder()
                    .setTitle('Setup Timed Out')
                    .setDescription('No selection made. Run `!setrepo` again to start over.')
                    .setColor(0x99aab5)],
                components: [],
            }).catch(() => {});
        });
    },
};

async function createGithubWebhook(repoName, token) {
    const targetUrl = webhookUrl.replace(/\/webhook\/?$/, '').replace(/\/$/, '') + '/webhook';
    const headers = { Authorization: `token ${token}` };

    // Check if webhook already exists
    const { data: hooks } = await axios.get(
        `https://api.github.com/repos/${repoName}/hooks`,
        { headers, params: { per_page: 100 } },
    );

    const existing = hooks.find(h => h.config?.url === targetUrl);
    if (existing) return { alreadyExists: true };

    const config = { url: targetUrl, content_type: 'json' };
    if (webhookSecret) config.secret = webhookSecret;

    await axios.post(
        `https://api.github.com/repos/${repoName}/hooks`,
        {
            name: 'web',
            active: true,
            events: ['push', 'pull_request', 'issues', 'create', 'delete'],
            config,
        },
        { headers },
    );
    return { alreadyExists: false };
}
