const process = require('node:process')

const { Client, GatewayIntentBits, Partials, Collection, AttachmentBuilder } = require('discord.js')

const { loadEvents } = require('./handlers/handlerEventos.js')
const { loadCommands } = require('./handlers/handlerComandos.js')
const { loadPrefix } = require('./handlers/handlerComandosPrefix.js')

const { TOKEN } = require('./config/config.js')

const wait = require('node:timers/promises').setTimeout
const { sendLog } = require('./discord/send/staff.js');

process.on('unhandledRejection', async (reason, promise) => {
  console.error('Unhandled Rejection:', reason)
  if (client?.isReady()) {
    await sendLog({ client, error: reason })
  }
})

process.on('uncaughtException', async (err) => {
  console.error('Uncaught Exception:', err)
  if (client?.isReady()) {
    await sendLog({ client, error: err })
  }
})

process.on('uncaughtExceptionMonitor', async (err, origin) => {
  console.error('Uncaught Exception Monitor:', err, origin)
  if (client?.isReady()) {
    await sendLog({ client, error: err })
  }
})

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent, // Importante para leer mensajes si usas comandos de prefijo
    GatewayIntentBits.GuildMembers, // Necesario para roles y miembros
    // Añade cualquier otro intent que necesites para tu bot
  ],
  partials: [
    Partials.Message,
    Partials.Channel,
    Partials.Reaction,
    Partials.User,
    Partials.GuildMember,
    // Añade cualquier otro partial que necesites
  ],
  allowedMentions: {
      parse: ["users", "roles"]
    },
})

client.commands = new Collection()
client.prefixs = new Collection()
client.aliases = new Collection()

client.login(TOKEN).then(() => {
  loadEvents(client)
  loadCommands(client)
  loadPrefix(client)
})

module.exports = client

// Logica de la liga

const { updateRankingsEmbed } = require('./discord/update/rankings.js')
const { updateDivisionsEmbed } = require('./discord/update/divisions.js')
const { executeDueScheduledFunctions } = require('./services/scheduledFunction.js')
const { updateUsersPingRole, syncFreeAgents } = require('./services/user.js')
const { applyDefaultDates, processScheduledMatches, monitorOnGoingMatches } = require('./services/match.js')
const { updateTeamsChannels } = require('./services/team.js')

function runInterval(tasks, intervalMs) {
  const run = async () => {
    try {
      const results = await Promise.allSettled(tasks.map(fn => fn()));
      for (const result of results) {
        if (result.status === 'rejected') {
          await sendLog({ client, error: result.reason })
        }
      }
    } catch (err) {
      await sendLog({ client, error: err })
    } finally {
      setTimeout(run, intervalMs)
    }
  }
  run()
}

client.once('clientReady', () => {
  runInterval(
    [
      () => processScheduledMatches({ client }),
      () => monitorOnGoingMatches({ client })
    ],
    1000 * 60 // 1 min
  )

  runInterval(
    [
      () => updateRankingsEmbed({ client }),
      () => updateDivisionsEmbed({ client }),
      () => executeDueScheduledFunctions({ client }),
      () => applyDefaultDates({ client })
    ],
    1000 * 60 * 30 // 30 min
  )

  runInterval(
    [
      () => updateUsersPingRole({ client }),
      () => syncFreeAgents({ client }),
      () => updateTeamsChannels({ client })
    ],
    1000 * 60 * 120 // 2 horas
  )
})