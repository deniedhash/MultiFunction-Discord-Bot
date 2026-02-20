const mongoose = require('mongoose');

const repoSetupSchema = new mongoose.Schema({
    serverId: { type: String, required: true, unique: true },
    repos: { type: mongoose.Schema.Types.Mixed, default: {} },
});

const RepoSetup = mongoose.model('RepoSetup', repoSetupSchema);

async function getRepoSetups(serverId) {
    let doc = await RepoSetup.findOne({ serverId });
    if (!doc) {
        doc = await RepoSetup.create({ serverId, repos: {} });
    }
    return doc;
}

async function saveRepoSetups(serverId, repoData) {
    await RepoSetup.findOneAndUpdate(
        { serverId },
        { serverId, repos: repoData },
        { upsert: true },
    );
}

async function getAllRepoSetups() {
    return RepoSetup.find({}).lean();
}

async function getGuildsForRepo(repoName) {
    const allDocs = await RepoSetup.find({}).lean();
    const results = [];
    for (const doc of allDocs) {
        const repos = doc.repos || {};
        if (repos[repoName]) {
            results.push({
                guildId: doc.serverId,
                categoryId: repos[repoName].categoryId,
                branch: repos[repoName].branch,
            });
        }
    }
    return results;
}

async function getGuildRepoList(guildId) {
    const doc = await RepoSetup.findOne({ serverId: guildId }).lean();
    if (!doc || !doc.repos) return [];
    return Object.keys(doc.repos).map(name => ({ repoName: name }));
}

module.exports = { getRepoSetups, saveRepoSetups, getAllRepoSetups, getGuildsForRepo, getGuildRepoList };
