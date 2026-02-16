const mongoose = require('mongoose');

const repoSchema = new mongoose.Schema({
    repoName: { type: String, required: true },
    guildId: { type: String, required: true },
    categoryId: { type: String, required: true },
    branches: { type: Map, of: String, default: {} },
});

repoSchema.index({ repoName: 1, guildId: 1 }, { unique: true });

const Repo = mongoose.model('Repo', repoSchema);

async function getRepoGuild(repoName, guildId) {
    return Repo.findOne({ repoName, guildId }).lean();
}

async function getRepoGuilds(repoName) {
    return Repo.find({ repoName }).lean();
}

async function saveRepoGuild(repoName, guildId, config) {
    await Repo.findOneAndUpdate(
        { repoName, guildId },
        { repoName, guildId, ...config },
        { upsert: true },
    );
}

async function removeRepoGuild(repoName, guildId) {
    await Repo.deleteOne({ repoName, guildId });
}

async function getGuildRepos(guildId) {
    return Repo.find({ guildId }).lean();
}

async function setBranch(repoName, guildId, branchName, channelId) {
    await Repo.updateOne(
        { repoName, guildId },
        { $set: { [`branches.${branchName}`]: channelId } },
    );
}

async function removeBranch(repoName, guildId, branchName) {
    await Repo.updateOne(
        { repoName, guildId },
        { $unset: { [`branches.${branchName}`]: '' } },
    );
}

module.exports = { getRepoGuild, getRepoGuilds, saveRepoGuild, removeRepoGuild, getGuildRepos, setBranch, removeBranch };
