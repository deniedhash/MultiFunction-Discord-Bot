const mongoose = require('mongoose');

const gitAuthSchema = new mongoose.Schema({
    serverId: { type: String, required: true, unique: true },
    users: { type: Map, of: new mongoose.Schema({ token: String }, { _id: false }), default: {} },
});

const GitAuth = mongoose.model('GitAuth', gitAuthSchema);

async function getGitAuths(serverId) {
    let doc = await GitAuth.findOne({ serverId });
    if (!doc) {
        doc = await GitAuth.create({ serverId, users: {} });
    }
    return doc;
}

async function saveGitAuths(serverId, userData) {
    await GitAuth.findOneAndUpdate(
        { serverId },
        { serverId, users: userData },
        { upsert: true },
    );
}

module.exports = { getGitAuths, saveGitAuths };
