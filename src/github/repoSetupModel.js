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

module.exports = { getRepoSetups, saveRepoSetups, getAllRepoSetups };
