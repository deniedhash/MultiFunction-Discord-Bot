const {
  Events,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const bugModel = require("../bugs/bugModel");
const bugManager = require("../bugs/bugManager");
const todoModel = require("../todos/todoModel");
const todoManager = require("../todos/todoManager");
const featureModel = require("../features/featureModel");
const featureManager = require("../features/featureManager");
const { getGuildRepoList } = require("../github/repoSetupModel");

module.exports = {
  name: Events.InteractionCreate,
  once: false,

  async execute(interaction) {
    try {
      if (interaction.isButton()) {
        await handleButton(interaction);
      } else if (interaction.isStringSelectMenu()) {
        await handleSelectMenu(interaction);
      } else if (interaction.isModalSubmit()) {
        await handleModal(interaction);
      }
    } catch (err) {
      console.error("Interaction error:", err);
      const reply = { content: "Something went wrong.", flags: 64 };
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply(reply).catch(() => {});
      } else {
        await interaction.reply(reply).catch(() => {});
      }
    }
  },
};

async function handleButton(interaction) {
  const id = interaction.customId;

  if (id === "bug_add") {
    const repos = await getGuildRepoList(interaction.guild.id);
    if (!repos || repos.length === 0) {
      return interaction.reply({
        content:
          "No GitHub repos are set up in this server. Ask an admin to use `!setrepo` first.",
        flags: 64,
      });
    }
    return interaction.reply({
      content: "Select a repository for this bug:",
      components: [bugManager.buildRepoSelectMenu(repos)],
      flags: 64,
    });
  }

  if (id === "todo_add") {
    const repos = await getGuildRepoList(interaction.guild.id);
    return interaction.reply({
      content: "Select a repository for this TODO (or choose General):",
      components: [todoManager.buildRepoSelectMenu(repos || [])],
      flags: 64,
    });
  }

  if (id === "feature_add") {
    const repos = await getGuildRepoList(interaction.guild.id);
    return interaction.reply({
      content: "Select a repository for this Feature (or choose General):",
      components: [featureManager.buildRepoSelectMenu(repos || [])],
      flags: 64,
    });
  }

  if (id.startsWith("bug_wip_")) {
    return handleWip(interaction, id.replace("bug_wip_", ""));
  }

  if (id.startsWith("bug_update_")) {
    const bugId = id.replace("bug_update_", "");
    return interaction.showModal(bugManager.buildUpdateModal(bugId));
  }

  if (id.startsWith("bug_resolve_")) {
    return handleResolve(interaction, id.replace("bug_resolve_", ""));
  }

  if (id.startsWith("bug_reopen_")) {
    return handleReopen(interaction, id.replace("bug_reopen_", ""));
  }

  if (id.startsWith("todo_wip_")) {
    return handleTodoWip(interaction, id.replace("todo_wip_", ""));
  }

  if (id.startsWith("todo_update_")) {
    const todoId = id.replace("todo_update_", "");
    return interaction.showModal(todoManager.buildUpdateModal(todoId));
  }

  if (id.startsWith("todo_resolve_")) {
    return handleTodoResolve(interaction, id.replace("todo_resolve_", ""));
  }

  if (id.startsWith("todo_reopen_")) {
    return handleTodoReopen(interaction, id.replace("todo_reopen_", ""));
  }

  if (id.startsWith("feature_wip_")) {
    return handleFeatureWip(interaction, id.replace("feature_wip_", ""));
  }

  if (id.startsWith("feature_update_")) {
    const featureId = id.replace("feature_update_", "");
    return interaction.showModal(featureManager.buildUpdateModal(featureId));
  }

  if (id.startsWith("feature_complete_")) {
    return handleFeatureComplete(
      interaction,
      id.replace("feature_complete_", ""),
    );
  }

  if (id.startsWith("feature_reject_")) {
    return handleFeatureReject(interaction, id.replace("feature_reject_", ""));
  }

  if (id.startsWith("feature_reopen_")) {
    return handleFeatureReopen(interaction, id.replace("feature_reopen_", ""));
  }
}

async function handleSelectMenu(interaction) {
  const id = interaction.customId;

  if (id === "bug_select_repo") {
    const repoName = interaction.values[0];
    return interaction.showModal(bugManager.buildAddBugModal(repoName));
  }

  if (id === "todo_select_repo") {
    const repoName = interaction.values[0];
    return interaction.showModal(todoManager.buildAddTodoModal(repoName));
  }

  if (id === "feature_select_repo") {
    const repoName = interaction.values[0];
    return interaction.showModal(featureManager.buildAddFeatureModal(repoName));
  }
}

async function handleModal(interaction) {
  const id = interaction.customId;

  if (id.startsWith("bug_modal_add:")) {
    const repoName = id.split(":").slice(1).join(":");
    return handleBugCreate(interaction, repoName);
  }

  if (id.startsWith("bug_modal_update_")) {
    return handleBugUpdate(interaction, id.replace("bug_modal_update_", ""));
  }

  if (id.startsWith("todo_modal_add:")) {
    const repoName = id.split(":").slice(1).join(":");
    return handleTodoCreate(interaction, repoName);
  }

  if (id.startsWith("todo_modal_update_")) {
    return handleTodoUpdate(interaction, id.replace("todo_modal_update_", ""));
  }

  if (id.startsWith("feature_modal_add:")) {
    const repoName = id.split(":").slice(1).join(":");
    return handleFeatureCreate(interaction, repoName);
  }

  if (id.startsWith("feature_modal_update_")) {
    return handleFeatureUpdate(
      interaction,
      id.replace("feature_modal_update_", ""),
    );
  }
}

// ── Bug creation ──

async function handleBugCreate(interaction, repoName) {
  await interaction.deferReply({ flags: 64 });

  const title = interaction.fields.getTextInputValue("bug_title");
  const description =
    interaction.fields.getTextInputValue("bug_description") || "";
  const steps = interaction.fields.getTextInputValue("bug_steps") || "";
  const rawSeverity = (
    interaction.fields.getTextInputValue("bug_severity") || "normal"
  )
    .toLowerCase()
    .trim();
  const severity = ["low", "normal", "high", "critical"].includes(rawSeverity)
    ? rawSeverity
    : "normal";

  const guild = interaction.guild;

  const bug = await bugModel.createBug({
    guildId: guild.id,
    repoName,
    title,
    description,
    steps,
    severity,
    reportedBy: interaction.user.id,
    reporterPlatform: "discord",
    reporterName: interaction.user.username,
  });

  const bugId = bug._id.toString();

  const category = await bugManager.ensureBugsCategoryForRepo(guild, repoName);
  const channel = await bugManager.createBugChannel(guild, category, bug);
  await bugModel.setBugChannelId(bugId, channel.id);

  const embedMsg = await channel.send({
    embeds: [bugManager.buildBugDetailEmbed(bug)],
    components: [bugManager.buildBugChannelButtons(bug)],
  });
  await bugModel.setBugEmbedMessageId(bugId, embedMsg.id);

  const updatedBug = await bugModel.getBug(bugId);
  await bugManager.updateBugListMessage(interaction.client, updatedBug);

  await interaction.editReply({ content: `Bug reported! See ${channel}.` });
}

// ── TODO creation ──

async function handleTodoCreate(interaction, repoName) {
  await interaction.deferReply({ flags: 64 });

  const title = interaction.fields.getTextInputValue("todo_title");
  const description =
    interaction.fields.getTextInputValue("todo_description") || "";
  const rawPriority = (
    interaction.fields.getTextInputValue("todo_priority") || "medium"
  )
    .toLowerCase()
    .trim();
  const priority = ["low", "medium", "high"].includes(rawPriority)
    ? rawPriority
    : "medium";
  const rawDueDate = (
    interaction.fields.getTextInputValue("todo_due_date") || ""
  ).trim();
  let dueDate = null;
  if (rawDueDate) {
    const parsed = new Date(rawDueDate);
    if (!Number.isNaN(parsed.getTime())) {
      dueDate = parsed;
    }
  }

  const guild = interaction.guild;
  const isGeneral = repoName === "general";
  const actualRepo = isGeneral ? null : repoName;

  const todo = await todoModel.createTodo({
    guildId: guild.id,
    repoName: actualRepo,
    title,
    description,
    priority,
    dueDate,
    createdBy: interaction.user.id,
    creatorPlatform: "discord",
    creatorName: interaction.user.username,
  });

  const todoId = todo._id.toString();

  const category = actualRepo
    ? await todoManager.ensureTodosCategoryForRepo(guild, actualRepo)
    : await todoManager.ensureTodosCategoryGeneral(guild);
  const channel = await todoManager.createTodoChannel(guild, category, todo);
  await todoModel.setTodoChannelId(todoId, channel.id);

  const embedMsg = await channel.send({
    embeds: [todoManager.buildTodoDetailEmbed(todo)],
    components: [todoManager.buildTodoChannelButtons(todo)],
  });
  await todoModel.setTodoEmbedMessageId(todoId, embedMsg.id);

  const updatedTodo = await todoModel.getTodo(todoId);
  await todoManager.updateTodoListMessage(interaction.client, updatedTodo);

  await interaction.editReply({ content: `TODO added! See ${channel}.` });
}

// ── Feature creation ──

async function handleFeatureCreate(interaction, repoName) {
  await interaction.deferReply({ flags: 64 });

  const title = interaction.fields.getTextInputValue("feature_title");
  const description =
    interaction.fields.getTextInputValue("feature_description") || "";
  const rawPriority = (
    interaction.fields.getTextInputValue("feature_priority") || "medium"
  )
    .toLowerCase()
    .trim();
  const priority = ["low", "medium", "high"].includes(rawPriority)
    ? rawPriority
    : "medium";
  const rawDueDate = (
    interaction.fields.getTextInputValue("feature_due_date") || ""
  ).trim();
  let dueDate = null;
  if (rawDueDate) {
    const parsed = new Date(rawDueDate);
    if (!Number.isNaN(parsed.getTime())) {
      dueDate = parsed;
    }
  }
  const tags = (interaction.fields.getTextInputValue("feature_tags") || "")
    .split(",")
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);

  const guild = interaction.guild;
  const isGeneral = repoName === "general";
  const actualRepoName = isGeneral ? null : repoName;

  const feature = await featureModel.createFeature({
    guildId: guild.id,
    repositoryName: actualRepoName,
    title,
    description,
    priority,
    dueDate,
    tags,
    createdBy: interaction.user.id,
  });

  const featureId = feature._id.toString();

  const category = actualRepoName
    ? await featureManager.ensureFeaturesCategoryForRepo(guild, actualRepoName)
    : await featureManager.ensureFeaturesCategoryGeneral(guild);
  const channel = await featureManager.createFeatureChannel(
    guild,
    category,
    feature,
  );
  await featureModel.setFeatureChannelId(featureId, channel.id);

  const embedMsg = await channel.send({
    embeds: [featureManager.buildFeatureDetailEmbed(feature)],
    components: [featureManager.buildFeatureChannelButtons(feature)],
  });
  await featureModel.setFeatureEmbedMessageId(featureId, embedMsg.id);

  const updatedFeature = await featureModel.getFeature(featureId);
  await featureManager.updateFeatureListMessage(
    interaction.client,
    updatedFeature,
  );

  await interaction.editReply({ content: `Feature proposed! See ${channel}.` });
}

// ── WIP ──

async function handleWip(interaction, bugId) {
  await interaction.deferReply({ flags: 64 });

  const updated = await bugModel.atomicSetWip(
    bugId,
    interaction.user.id,
    interaction.user.username,
  );
  if (!updated) {
    return interaction.editReply({
      content: "This bug is already being worked on or is no longer open.",
    });
  }

  await interaction.channel.send(
    `**WIP** — <@${interaction.user.id}> is working on this bug.`,
  );

  try {
    const msg = await interaction.channel.messages.fetch(
      updated.embedMessageId,
    );
    await msg.edit({
      embeds: [bugManager.buildBugDetailEmbed(updated)],
      components: [bugManager.buildBugChannelButtons(updated)],
    });
  } catch {
    /* embed message may be gone */
  }

  await bugManager.updateBugListMessage(interaction.client, updated);

  await interaction.editReply({ content: "You claimed this bug as WIP." });
}

// ── Feature In Progress ──

async function handleFeatureWip(interaction, featureId) {
  await interaction.deferReply({ flags: 64 });

  const updated = await featureModel.atomicSetInProgress(
    featureId,
    interaction.user.id,
  );
  if (!updated) {
    return interaction.editReply({
      content: "This feature is already in progress or no longer proposed.",
    });
  }

  await interaction.channel.send(
    `**In Progress** — <@${interaction.user.id}> is working on this feature.`,
  );

  try {
    const msg = await interaction.channel.messages.fetch(
      updated.embedMessageId,
    );
    await msg.edit({
      embeds: [featureManager.buildFeatureDetailEmbed(updated)],
      components: [featureManager.buildFeatureChannelButtons(updated)],
    });
  } catch {
    /* embed message may be gone */
  }

  await featureManager.updateFeatureListMessage(interaction.client, updated);

  await interaction.editReply({
    content: "You claimed this feature as In Progress.",
  });
}

// ── Update ──

async function handleBugUpdate(interaction, bugId) {
  await interaction.deferReply({ flags: 64 });

  const text = interaction.fields.getTextInputValue("bug_update_text");

  const updated = await bugModel.addUpdate(bugId, {
    userId: interaction.user.id,
    username: interaction.user.username,
    text,
  });

  if (!updated) {
    return interaction.editReply({ content: "Bug not found." });
  }

  await interaction.channel.send(
    `**Update** by <@${interaction.user.id}>:\n${text}`,
  );
  await interaction.editReply({ content: "Update posted." });
}

// ── TODO Update ──

async function handleTodoUpdate(interaction, todoId) {
  await interaction.deferReply({ flags: 64 });

  const text = interaction.fields.getTextInputValue("todo_update_text");

  const updated = await todoModel.addUpdate(todoId, {
    userId: interaction.user.id,
    username: interaction.user.username,
    text,
  });

  if (!updated) {
    return interaction.editReply({ content: "TODO not found." });
  }

  await interaction.channel.send(
    `**Update** by <@${interaction.user.id}>:\n${text}`,
  );
  await interaction.editReply({ content: "Update posted." });
}

// ── Feature Update ──

async function handleFeatureUpdate(interaction, featureId) {
  await interaction.deferReply({ flags: 64 });

  const text = interaction.fields.getTextInputValue("feature_update_text");

  const updated = await featureModel.addUpdate(featureId, {
    userId: interaction.user.id,
    username: interaction.user.username,
    text,
  });

  if (!updated) {
    return interaction.editReply({ content: "Feature not found." });
  }

  await interaction.channel.send(
    `**Update** by <@${interaction.user.id}>:\n${text}`,
  );
  await interaction.editReply({ content: "Update posted." });
}

// ── Resolve ──

async function handleResolve(interaction, bugId) {
  await interaction.deferReply({ flags: 64 });

  const updated = await bugModel.atomicSetStatus(bugId, "wip", "resolved");
  const updatedFromOpen = !updated
    ? await bugModel.atomicSetStatus(bugId, "open", "resolved")
    : null;
  const bug = updated || updatedFromOpen;

  if (!bug) {
    return interaction.editReply({
      content: "This bug is already resolved or not found.",
    });
  }

  const reopenRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`bug_reopen_${bugId}`)
      .setLabel("Open Again")
      .setStyle(ButtonStyle.Danger),
  );
  await interaction.channel.send({
    content: `**Resolved** by <@${interaction.user.id}>.`,
    components: [reopenRow],
  });

  try {
    const msg = await interaction.channel.messages.fetch(bug.embedMessageId);
    await msg.edit({
      embeds: [bugManager.buildBugDetailEmbed(bug)],
      components: [],
    });
  } catch {
    /* embed may be gone */
  }

  const { itemDeleteDelay } = require("../../config");
  const delayMs = itemDeleteDelay * 1000;
  await bugModel.setDeletionScheduled(bugId, new Date(Date.now() + delayMs));
  bugManager.scheduleDeletion(interaction.client, bugId, delayMs);

  const freshBug = await bugModel.getBug(bugId);
  await bugManager.updateBugListMessage(interaction.client, freshBug);

  await interaction.editReply({
    content: "Bug marked as resolved. Channel will be cleaned up later.",
  });
}

// ── TODO Resolve ──

async function handleTodoResolve(interaction, todoId) {
  await interaction.deferReply({ flags: 64 });

  const updated = await todoModel.atomicSetStatus(
    todoId,
    "in_progress",
    "done",
  );
  const updatedFromOpen = !updated
    ? await todoModel.atomicSetStatus(todoId, "open", "done")
    : null;
  const todo = updated || updatedFromOpen;

  if (!todo) {
    return interaction.editReply({
      content: "This TODO is already done or not found.",
    });
  }

  const reopenRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`todo_reopen_${todoId}`)
      .setLabel("Open Again")
      .setStyle(ButtonStyle.Danger),
  );
  await interaction.channel.send({
    content: `**Done** by <@${interaction.user.id}>.`,
    components: [reopenRow],
  });

  try {
    const msg = await interaction.channel.messages.fetch(todo.embedMessageId);
    await msg.edit({
      embeds: [todoManager.buildTodoDetailEmbed(todo)],
      components: [],
    });
  } catch {
    /* embed may be gone */
  }

  const { itemDeleteDelay } = require("../../config");
  const delayMs = itemDeleteDelay * 1000;
  await todoModel.setDeletionScheduled(todoId, new Date(Date.now() + delayMs));
  todoManager.scheduleDeletion(interaction.client, todoId, delayMs);

  const freshTodo = await todoModel.getTodo(todoId);
  await todoManager.updateTodoListMessage(interaction.client, freshTodo);

  await interaction.editReply({
    content: "TODO marked as done. Channel will be cleaned up later.",
  });
}

// ── Feature Complete ──

async function handleFeatureComplete(interaction, featureId) {
  await interaction.deferReply({ flags: 64 });

  const updated = await featureModel.atomicSetStatus(
    featureId,
    "in_progress",
    "completed",
  );
  const updatedFromProposed = !updated
    ? await featureModel.atomicSetStatus(featureId, "proposed", "completed")
    : null;
  const feature = updated || updatedFromProposed;

  if (!feature) {
    return interaction.editReply({
      content: "This feature is already completed or not found.",
    });
  }

  const reopenRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`feature_reopen_${featureId}`)
      .setLabel("Reopen")
      .setStyle(ButtonStyle.Danger),
  );
  await interaction.channel.send({
    content: `**Completed** by <@${interaction.user.id}>.`,
    components: [reopenRow],
  });

  try {
    const msg = await interaction.channel.messages.fetch(
      feature.embedMessageId,
    );
    await msg.edit({
      embeds: [featureManager.buildFeatureDetailEmbed(feature)],
      components: [],
    });
  } catch {
    /* embed may be gone */
  }

  const { featureDeleteDelay } = require("../../config");
  const delayMs = featureDeleteDelay * 1000;
  await featureModel.setDeletionScheduled(
    featureId,
    new Date(Date.now() + delayMs),
  );
  featureManager.scheduleDeletion(interaction.client, featureId, delayMs);

  const freshFeature = await featureModel.getFeature(featureId);
  await featureManager.updateFeatureListMessage(
    interaction.client,
    freshFeature,
  );

  await interaction.editReply({
    content: "Feature marked as completed. Channel will be cleaned up later.",
  });
}

// ── Feature Reject ──

async function handleFeatureReject(interaction, featureId) {
  await interaction.deferReply({ flags: 64 });

  const updated = await featureModel.atomicSetStatus(
    featureId,
    "in_progress",
    "rejected",
  );
  const updatedFromProposed = !updated
    ? await featureModel.atomicSetStatus(featureId, "proposed", "rejected")
    : null;
  const feature = updated || updatedFromProposed;

  if (!feature) {
    return interaction.editReply({
      content: "This feature is already rejected or not found.",
    });
  }

  const reopenRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`feature_reopen_${featureId}`)
      .setLabel("Reopen")
      .setStyle(ButtonStyle.Danger),
  );
  await interaction.channel.send({
    content: `**Rejected** by <@${interaction.user.id}>.`,
    components: [reopenRow],
  });

  try {
    const msg = await interaction.channel.messages.fetch(
      feature.embedMessageId,
    );
    await msg.edit({
      embeds: [featureManager.buildFeatureDetailEmbed(feature)],
      components: [],
    });
  } catch {
    /* embed may be gone */
  }

  const { featureDeleteDelay } = require("../../config");
  const delayMs = featureDeleteDelay * 1000;
  await featureModel.setDeletionScheduled(
    featureId,
    new Date(Date.now() + delayMs),
  );
  featureManager.scheduleDeletion(interaction.client, featureId, delayMs);

  const freshFeature = await featureModel.getFeature(featureId);
  await featureManager.updateFeatureListMessage(
    interaction.client,
    freshFeature,
  );

  await interaction.editReply({
    content: "Feature marked as rejected. Channel will be cleaned up later.",
  });
}

// ── Reopen ──

async function handleReopen(interaction, bugId) {
  await interaction.deferReply({ flags: 64 });

  const bug = await bugModel.getBug(bugId);
  if (!bug) {
    return interaction.editReply({ content: "Bug not found." });
  }
  if (bug.status !== "resolved") {
    return interaction.editReply({ content: "This bug is not resolved." });
  }

  bugManager.cancelDeletion(bugId);
  await bugModel.clearDeletionScheduled(bugId);

  const updated = await bugModel.addReopenEntry(bugId, {
    userId: interaction.user.id,
    username: interaction.user.username,
  });
  if (!updated) {
    return interaction.editReply({ content: "Failed to reopen bug." });
  }

  const guild = interaction.guild;
  const repoName = updated.repoName;
  const category = repoName
    ? await bugManager.ensureBugsCategoryForRepo(guild, repoName)
    : await bugManager.ensureBugsCategory(guild);
  let channel = updated.channelId
    ? guild.channels.cache.get(updated.channelId)
    : null;

  if (!channel) {
    channel = await bugManager.createBugChannel(guild, category, updated);
    await bugModel.setBugChannelId(bugId, channel.id);
    const replayBug = await bugModel.getBug(bugId);
    await bugManager.replayUpdatesToChannel(channel, replayBug);
  } else {
    await channel.send(`**Reopened** by <@${interaction.user.id}>.`);
    try {
      const msg = await channel.messages.fetch(updated.embedMessageId);
      await msg.edit({
        embeds: [bugManager.buildBugDetailEmbed(updated)],
        components: [bugManager.buildBugChannelButtons(updated)],
      });
    } catch {
      const embedMsg = await channel.send({
        embeds: [bugManager.buildBugDetailEmbed(updated)],
        components: [bugManager.buildBugChannelButtons(updated)],
      });
      await bugModel.setBugEmbedMessageId(bugId, embedMsg.id);
    }
  }

  const freshBug = await bugModel.getBug(bugId);
  await bugManager.updateBugListMessage(interaction.client, freshBug);

  await interaction.editReply({
    content: `Bug has been reopened. See ${channel}.`,
  });
}

// ── TODO Reopen ──

async function handleTodoReopen(interaction, todoId) {
  await interaction.deferReply({ flags: 64 });

  const todo = await todoModel.getTodo(todoId);
  if (!todo) {
    return interaction.editReply({ content: "TODO not found." });
  }
  if (todo.status !== "done") {
    return interaction.editReply({ content: "This TODO is not done." });
  }

  todoManager.cancelDeletion(todoId);
  await todoModel.clearDeletionScheduled(todoId);

  const updated = await todoModel.addReopenEntry(todoId, {
    userId: interaction.user.id,
    username: interaction.user.username,
  });
  if (!updated) {
    return interaction.editReply({ content: "Failed to reopen TODO." });
  }

  const guild = interaction.guild;
  const repoName = updated.repoName;
  const category = repoName
    ? await todoManager.ensureTodosCategoryForRepo(guild, repoName)
    : await todoManager.ensureTodosCategoryGeneral(guild);
  let channel = updated.channelId
    ? guild.channels.cache.get(updated.channelId)
    : null;

  if (!channel) {
    channel = await todoManager.createTodoChannel(guild, category, updated);
    await todoModel.setTodoChannelId(todoId, channel.id);
    const replayTodo = await todoModel.getTodo(todoId);
    await todoManager.replayUpdatesToChannel(channel, replayTodo);
  } else {
    await channel.send(`**Reopened** by <@${interaction.user.id}>.`);
    try {
      const msg = await channel.messages.fetch(updated.embedMessageId);
      await msg.edit({
        embeds: [todoManager.buildTodoDetailEmbed(updated)],
        components: [todoManager.buildTodoChannelButtons(updated)],
      });
    } catch {
      const embedMsg = await channel.send({
        embeds: [todoManager.buildTodoDetailEmbed(updated)],
        components: [todoManager.buildTodoChannelButtons(updated)],
      });
      await todoModel.setTodoEmbedMessageId(todoId, embedMsg.id);
    }
  }

  const freshTodo = await todoModel.getTodo(todoId);
  await todoManager.updateTodoListMessage(interaction.client, freshTodo);

  await interaction.editReply({
    content: `TODO has been reopened. See ${channel}.`,
  });
}

// ── Feature Reopen ──

async function handleFeatureReopen(interaction, featureId) {
  await interaction.deferReply({ flags: 64 });

  const feature = await featureModel.getFeature(featureId);
  if (!feature) {
    return interaction.editReply({ content: "Feature not found." });
  }
  if (feature.status !== "completed" && feature.status !== "rejected") {
    return interaction.editReply({
      content: "This feature is not completed or rejected.",
    });
  }

  featureManager.cancelDeletion(featureId);
  await featureModel.clearDeletionScheduled(featureId);

  const updated = await featureModel.addReopenEntry(featureId, {
    userId: interaction.user.id,
    username: interaction.user.username,
  });
  if (!updated) {
    return interaction.editReply({ content: "Failed to reopen feature." });
  }

  const guild = interaction.guild;
  const repoName = updated.repositoryName;
  const category = repoName
    ? await featureManager.ensureFeaturesCategoryForRepo(guild, repoName)
    : await featureManager.ensureFeaturesCategoryGeneral(guild);
  let channel = updated.channelId
    ? guild.channels.cache.get(updated.channelId)
    : null;

  if (!channel) {
    channel = await featureManager.createFeatureChannel(
      guild,
      category,
      updated,
    );
    await featureModel.setFeatureChannelId(featureId, channel.id);
    const replayFeature = await featureModel.getFeature(featureId);
    await featureManager.replayUpdatesToChannel(channel, replayFeature);
  } else {
    await channel.send(`**Reopened** by <@${interaction.user.id}>.`);
    try {
      const msg = await channel.messages.fetch(updated.embedMessageId);
      await msg.edit({
        embeds: [featureManager.buildFeatureDetailEmbed(updated)],
        components: [featureManager.buildFeatureChannelButtons(updated)],
      });
    } catch {
      const embedMsg = await channel.send({
        embeds: [featureManager.buildFeatureDetailEmbed(updated)],
        components: [featureManager.buildFeatureChannelButtons(updated)],
      });
      await featureModel.setFeatureEmbedMessageId(featureId, embedMsg.id);
    }
  }

  const freshFeature = await featureModel.getFeature(featureId);
  await featureManager.updateFeatureListMessage(
    interaction.client,
    freshFeature,
  );

  await interaction.editReply({
    content: `Feature has been reopened. See ${channel}.`,
  });
}

// ── TODO In Progress ──

async function handleTodoWip(interaction, todoId) {
  await interaction.deferReply({ flags: 64 });

  const updated = await todoModel.atomicSetInProgress(
    todoId,
    interaction.user.id,
  );
  if (!updated) {
    return interaction.editReply({
      content: "This TODO is already being worked on or is no longer open.",
    });
  }

  await interaction.channel.send(
    `**In Progress** — <@${interaction.user.id}> is working on this TODO.`,
  );

  try {
    const msg = await interaction.channel.messages.fetch(
      updated.embedMessageId,
    );
    await msg.edit({
      embeds: [todoManager.buildTodoDetailEmbed(updated)],
      components: [todoManager.buildTodoChannelButtons(updated)],
    });
  } catch {
    /* embed message may be gone */
  }

  await todoManager.updateTodoListMessage(interaction.client, updated);

  await interaction.editReply({
    content: "You claimed this TODO as In Progress.",
  });
}
