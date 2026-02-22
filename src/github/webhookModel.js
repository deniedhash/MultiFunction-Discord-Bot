const mongoose = require('mongoose');

const WebhookSchema = new mongoose.Schema({
    repository: {
        name: { type: String },
        owner: { type: String },
        url: { type: String },
    },
    pusher: {
        name: { type: String },
        email: { type: String },
    },
    ref: { type: String },
    before: { type: String },
    after: { type: String },
    compare: { type: String },
    commits: [
        {
            id: { type: String },
            message: { type: String },
            timestamp: { type: Date },
            url: { type: String },
            author: {
                name: { type: String },
                email: { type: String },
                username: { type: String },
            },
            committer: {
                name: { type: String },
                email: { type: String },
                username: { type: String },
            },
            added: [{ type: String }],
            removed: [{ type: String }],
            modified: [{ type: String }],
        },
    ],
    head_commit: {
        id: { type: String },
        message: { type: String },
        timestamp: { type: Date },
        url: { type: String },
        author: {
            name: { type: String },
            email: { type: String },
            username: { type: String },
        },
        committer: {
            name: { type: String },
            email: { type: String },
            username: { type: String },
        },
        added: [{ type: String }],
        removed: [{ type: String }],
        modified: [{ type: String }],
    },
    timestamp: { type: Date, default: Date.now },
    eventType: { type: String }, // e.g., 'push', 'pull_request', 'issues'
    rawPayload: { type: mongoose.Schema.Types.Mixed, required: true }, // Store the full raw payload
});

module.exports = mongoose.model('Webhook', WebhookSchema);
