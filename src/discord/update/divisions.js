const {
  ContainerBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder,
  SectionBuilder,
  SeparatorBuilder,
  MessageFlags
} = require('discord.js')

const Division = require('../../models/Division.js')
const emojis = require('../../config/emojis.json')
const config = require('../../config/league.js')

const { getTeamsSummaryEmbed } = require('../embeds/team.js')
const { getTeamStatsButton } = require('../buttons/team.js')

const maxTeams = config.division.maxTeams
const Team = require('../../models/Team.js')

// chunk helper
function chunkArray(array, size) {
  const chunks = []
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size))
  }
  return chunks
}

// main
const updateDivisionsEmbed = async ({ client }) => {
  const isV2 = (msg) =>
    (msg.flags & MessageFlags.IsComponentsV2) === MessageFlags.IsComponentsV2

  const guild = await client.guilds.fetch(config.guild.id)
  const channel = await client.channels.fetch(config.channels.divisions.id)
  if (!channel || !channel.isTextBased())
    throw new Error('Canal no encontrado o no es de texto.')

  const fetchedMessages = await channel.messages.fetch({ limit: 100 })
  const sortedMessages = Array.from(fetchedMessages.values()).sort(
    (a, b) => a.createdTimestamp - b.createdTimestamp
  )
  // solo mensajes del bot
  const botMessages = sortedMessages.filter((msg) => msg.author.id === client.user.id)

  const summaryMsg = botMessages.find((msg) => !isV2(msg))
  const divisionMsgs = botMessages.filter((msg) => isV2(msg))

  const divisions = await Division.find().sort({ tier: 1 }).exec()

  // build containers para todas las divisiones (no borrar nada aún)
  const containersByDivision = []
  for (const division of divisions) {
    const teams = await Team.find({ divisionId: division._id })
      .populate('members.userId')
      .sort({ name: 1 })
      .exec()
    const containers = buildDivisionContainers(division, teams, guild) // devuelve array de ContainerBuilder
    containersByDivision.push(containers)
  }

  // flatten
  const flatContainers = containersByDivision.reduce((acc, arr) => acc.concat(arr), [])

  // ACTUALIZA O CREA resumen (no borramos el resto)
  if (summaryMsg) {
    try {
      await summaryMsg.edit({
        embeds: [
          getTeamsSummaryEmbed({
            divisionsCount: divisions.length,
            teamsInDivisionsCount: await Team.countDocuments({ divisionId: { $ne: null } }),
            teamsCount: await Team.countDocuments({ isDeleted: { $in: [false, null] } })
          })
        ]
      })
    } catch (err) {
      // si no se puede editar, ignoramos y seguiremos (no borramos todo)
    }
  } else {
    await channel.send({
      embeds: [
        getTeamsSummaryEmbed({
          divisionsCount: divisions.length,
          teamsInDivisionsCount: await Team.countDocuments({ divisionId: { $ne: null } }),
          teamsCount: await Team.countDocuments({ isDeleted: { $in: [false, null] } })
        })
      ]
    })
  }

  // ahora intentamos EDITAR los mensajes existentes en orden y solo enviar/eliminar los necesarios
  // divisionMsgs está ordenado por createdTimestamp asc
  const targetCount = flatContainers.length
  // editar los que existen
  const minCount = Math.min(divisionMsgs.length, targetCount)
  for (let i = 0; i < minCount; i++) {
    const msg = divisionMsgs[i]
    const container = flatContainers[i]
    try {
      await msg.edit({
        components: [container],
        flags: MessageFlags.IsComponentsV2,
        allowedMentions: { parse: [] }
      })
    } catch (err) {
      // si falla al editar (mensaje borrado o error), reemplazamos: borramos el viejo y enviamos uno nuevo
      try {
        await msg.delete().catch(() => {})
      } catch (e) {}
      await channel.send({
        components: [container],
        flags: MessageFlags.IsComponentsV2,
        allowedMentions: { parse: [] }
      })
    }
  }

  // si faltan, enviamos los que hagan falta
  if (targetCount > divisionMsgs.length) {
    for (let i = divisionMsgs.length; i < targetCount; i++) {
      const container = flatContainers[i]
      await channel.send({
        components: [container],
        flags: MessageFlags.IsComponentsV2,
        allowedMentions: { parse: [] }
      })
    }
  }

  // si sobran, eliminamos los sobrantes (solo los que estaban como divisionMsgs)
  if (divisionMsgs.length > targetCount) {
    for (let i = targetCount; i < divisionMsgs.length; i++) {
      await divisionMsgs[i].delete().catch(() => {})
    }
  }
}

// build containers: devuelve array de ContainerBuilder (1..N)
function buildDivisionContainers(division, teams, guild, chunkSize = 5) {
  const teamChunks = chunkArray(teams, chunkSize)
  const containers = []
  const safeColor = division && division.color ? division.color.replace('#', '') : '2f3136'
  const accent = parseInt(safeColor, 16)

  // si la división está vacía, devolvemos un único contenedor con encabezado y aviso
  if (teams.length === 0) {
    const container = new ContainerBuilder()
      .setAccentColor(accent)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `### ${division.emoji || emojis.division} División ${division.name || 'Sin nombre'} — 0/${maxTeams}`
        )
      )
      .addSeparatorComponents(new SeparatorBuilder())
      .addTextDisplayComponents(new TextDisplayBuilder().setContent('*División sin equipos.*'))
    containers.push(container)
    return containers
  }

  for (let chunkIndex = 0; chunkIndex < teamChunks.length; chunkIndex++) {
    const teamGroup = teamChunks[chunkIndex]
    const container = new ContainerBuilder().setAccentColor(accent)

    // solo el primer mensaje del grupo lleva el título de la división
    if (chunkIndex === 0) {
      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `### ${division.emoji || emojis.division} División ${division.name || 'Sin nombre'} — ${teams.length}/${maxTeams}`
        )
      )
    }

    for (let j = 0; j < teamGroup.length; j++) {
      const team = teamGroup[j]
      const { name, iconURL, members } = team

      const rolePriority = { leader: 0, 'sub-leader': 1, member: 2 }
      const sortedMembers = [...(members || [])].sort(
        (a, b) => (rolePriority[a.role] ?? 99) - (rolePriority[b.role] ?? 99)
      )

      const formattedList = sortedMembers
        .map((m) => {
          const userId = (m.userId && m.userId.discordId) ? m.userId.discordId : (m.userId ? m.userId : '???')
          const roleLabel =
            m.role === 'leader'
              ? '<:leader:1395916423695564881>'
              : m.role === 'sub-leader'
              ? '<:subleader:1395916298025832519>'
              : '<:member:1395916668869283860>'
          return `${roleLabel} <@${userId}>`
        })
        .join('\n') || '_Sin miembros_'

      const thumbnailComponent = new ThumbnailBuilder({ media: { url: iconURL } })

      const sectionComponent = new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`### ${name}\n${formattedList}`))
        .setThumbnailAccessory(thumbnailComponent)

      const sectionComponent2 = new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('** ­**'))
        .setButtonAccessory(getTeamStatsButton({ teamName: name }))

      // no añadir SeparatorBuilder si es el primer equipo del mensaje (ya visualmente separado)
      if (!(chunkIndex > 0 && j === 0)) {
        container.addSeparatorComponents(new SeparatorBuilder())
      }

      container.addSectionComponents(sectionComponent, sectionComponent2)
    }

    containers.push(container)
  }

  return containers
}

module.exports = { updateDivisionsEmbed }