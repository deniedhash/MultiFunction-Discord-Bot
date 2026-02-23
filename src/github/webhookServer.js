const express = require('express');
const crypto = require('crypto');
const { webhookPort, webhookSecret } = require('../../config');
const { handleGithubEvent } = require('./eventHandler');
const { getGuildsForRepo } = require('./repoSetupModel');
const { createBugFromExternal } = require('../bugs/bugManager');
const { createTodoFromExternal } = require('../todos/todoManager');
const Webhook = require('./webhookModel'); // Import the Webhook model

function startWebhookServer(client) {
    const app = express();

    app.get('/webhook', (req, res) => {
        res.json({ status: 'ok', message: 'Webhook server is running' });
    });

    // ── Bug creation API ──
    app.post('/bugs', express.json(), async (req, res) => {
        try {
            if (webhookSecret && webhookSecret.length > 0) {
                const auth = req.headers['authorization'];
                if (!auth || auth !== `Bearer ${webhookSecret}`) {
                    return res.status(401).json({ error: 'Unauthorized' });
                }
            }

            const { repoName, title, description, steps, severity, platform, reporter } = req.body;

            if (!repoName || !title || !platform || !reporter) {
                return res.status(400).json({ error: 'Missing required fields: repoName, title, platform, reporter' });
            }

            const repoGuilds = await getGuildsForRepo(repoName);
            if (!repoGuilds.length) {
                return res.status(404).json({ error: 'No guilds are tracking this repository' });
            }

            const results = [];
            for (const repoConfig of repoGuilds) {
                const bug = await createBugFromExternal(client, {
                    guildId: repoConfig.guildId,
                    repoName,
                    title,
                    description,
                    steps: steps || '',
                    severity: severity || 'normal',
                    reporterPlatform: platform,
                    reporterName: reporter,
                });
                if (bug) results.push({ guildId: repoConfig.guildId, bugId: bug._id.toString() });
            }

            res.status(201).json({ created: results });
        } catch (err) {
            console.error('Error creating bug via API:', err);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    // ── TODO creation API ──
    app.post('/todos', express.json(), async (req, res) => {
        try {
            if (webhookSecret && webhookSecret.length > 0) {
                const auth = req.headers['authorization'];
                if (!auth || auth !== `Bearer ${webhookSecret}`) {
                    return res.status(401).json({ error: 'Unauthorized' });
                }
            }

            const { repoName, title, description, priority, platform, reporter, dueDate, tags } = req.body;

            if (!repoName || !title || !platform || !reporter) {
                return res.status(400).json({ error: 'Missing required fields: repoName, title, platform, reporter' });
            }

            const repoGuilds = await getGuildsForRepo(repoName);
            if (!repoGuilds.length) {
                return res.status(404).json({ error: 'No guilds are tracking this repository' });
            }

            const results = [];
            for (const repoConfig of repoGuilds) {
                const todo = await createTodoFromExternal(client, {
                    guildId: repoConfig.guildId,
                    repoName,
                    title,
                    description,
                    priority: priority || 'medium',
                    creatorPlatform: platform,
                    creatorName: reporter,
                    dueDate: dueDate || null,
                    tags: Array.isArray(tags) ? tags : [],
                });
                if (todo) results.push({ guildId: repoConfig.guildId, todoId: todo._id.toString() });
            }

            res.status(201).json({ created: results });
        } catch (err) {
            console.error('Error creating todo via API:', err);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    app.post('/webhook', express.json(), (req, res) => {
        if (webhookSecret && webhookSecret.length > 0) {
            const signature = req.headers['x-hub-signature-256'];
            if (!signature) return res.status(401).send('Missing signature');

            const body = JSON.stringify(req.body);
            if (!body) return res.status(400).send('Missing body');

            const expected = 'sha256=' + crypto
                .createHmac('sha256', webhookSecret)
                .update(body)
                .digest('hex');

            if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
                return res.status(401).send('Invalid signature');
            }
        }

        const eventType = req.headers['x-github-event'];
        if (!eventType) return res.status(400).send('Missing event type');

        if (!req.body) return res.status(400).send('Missing body');

        res.status(200).send('OK');

        handleGithubEvent(eventType, req.body, client).catch(err => {
            console.error('Error handling GitHub event:', err);
        });

        saveWebhookPayload(eventType, req.body);
    });

    const port = webhookPort || 3000;
    app.listen(port, '0.0.0.0', () => {
        console.log(`GitHub webhook server listening on port ${port}`);
    });
}

async function saveWebhookPayload(eventType, payload) {
    try {
        const webhookData = {
            eventType: eventType,
            rawPayload: payload,
        };

        if (payload?.repository) {
            webhookData.repository = {
                name: payload.repository.name,
                owner:
                    payload.repository.owner?.name ||
                    payload.repository.owner?.login ||
                    (typeof payload.repository.owner === 'string' ? payload.repository.owner : undefined),
                url: payload.repository.html_url || payload.repository.url,
            };
        }

        if (payload?.pusher) {
            webhookData.pusher = {
                name: payload.pusher.name,
                email: payload.pusher.email,
            };
        }

        if (payload.ref) webhookData.ref = payload.ref;
        if (payload.before) webhookData.before = payload.before;
        if (payload.after) webhookData.after = payload.after;
        if (payload.compare) webhookData.compare = payload.compare;

        if (Array.isArray(payload?.commits)) {
            webhookData.commits = payload.commits
                .filter(commit => commit && typeof commit === 'object')
                .map(commit => ({
                    id: commit.id,
                    message: commit.message,
                    timestamp: commit.timestamp,
                    url: commit.url,
                    author: {
                        name: commit.author?.name,
                        email: commit.author?.email,
                        username: commit.author?.username,
                    },
                    committer: {
                        name: commit.committer?.name,
                        email: commit.committer?.email,
                        username: commit.committer?.username,
                    },
                    added: Array.isArray(commit.added) ? commit.added : [],
                    removed: Array.isArray(commit.removed) ? commit.removed : [],
                    modified: Array.isArray(commit.modified) ? commit.modified : [],
                }));
        }

        if (payload?.head_commit && typeof payload.head_commit === 'object') {
            webhookData.head_commit = {
                id: payload.head_commit.id,
                message: payload.head_commit.message,
                timestamp: payload.head_commit.timestamp,
                url: payload.head_commit.url,
                author: {
                    name: payload.head_commit.author?.name,
                    email: payload.head_commit.author?.email,
                    username: payload.head_commit.author?.username,
                },
                committer: {
                    name: payload.head_commit.committer?.name,
                    email: payload.head_commit.committer?.email,
                    username: payload.head_commit.committer?.username,
                },
                added: Array.isArray(payload.head_commit.added) ? payload.head_commit.added : [],
                removed: Array.isArray(payload.head_commit.removed) ? payload.head_commit.removed : [],
                modified: Array.isArray(payload.head_commit.modified) ? payload.head_commit.modified : [],
            };
        }

        const newWebhook = new Webhook(webhookData);
        await newWebhook.save();
        console.log(`Webhook payload for event type "${eventType}" saved to database.`);
    } catch (error) {
        console.error('Failed to save webhook payload:', error);
        // Do not re-throw, as this function should not block the main webhook processing
    }
}

module.exports = { startWebhookServer };
