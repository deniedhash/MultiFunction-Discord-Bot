const express = require('express');
const crypto = require('crypto');
const { webhookPort, webhookSecret } = require('../../config');
const { handleGithubEvent } = require('./eventHandler');
const store = require('./store');
const { createBugFromExternal } = require('../bugs/bugManager');

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

            const repoGuilds = await store.getRepoGuilds(repoName);
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
    });

    const port = webhookPort || 3000;
    app.listen(port, '0.0.0.0', () => {
        console.log(`GitHub webhook server listening on port ${port}`);
    });
}

module.exports = { startWebhookServer };
