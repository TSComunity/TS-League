const {
  ContainerBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder,
  SectionBuilder,
  SeparatorBuilder,
  MessageFlags
} = require('discord.js')

const Match = require('../../models/Match.js')
const Team = require('../../models/Team.js')

const config = require('../../configs/league.js')
const emojis = require('../../configs/emojis.json')

const { calculatePromotionRelegation } = require('../../services/season.js')
const { getLastSeason } = require('../../utils/season.js')
const { getSeasonSummaryEmbed } = require('../embeds/season.js')

const maxTeams = config.division.maxTeams

function chunkArray(array, size) {
  const chunks = []
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size))
  }
  return chunks
}

// Helper para normalizar ids (ObjectId o documento)
function normalizeId(item) {
  if (!item) return null
  // si es documento poblado (tiene _id)
  if (typeof item === 'object' && item._id) return String(item._id)
  return String(item)
}

const updateRankingsEmbed = async ({ client }) => {
  const isV2 = (msg) =>
    (msg.flags & MessageFlags.IsComponentsV2) === MessageFlags.IsComponentsV2

  const channel = await client.channels.fetch(config.channels.rankings.id)
  if (!channel || !channel.isTextBased())
    throw new Error('Canal no encontrado o no es de texto.')

  const season = await getLastSeason()
  const { divisions, status } = season

  // Si la season está activa, calculamos predicciones
  let predictions = null
  if (status === 'active') {
    predictions = await calculatePromotionRelegation({ client, season, updateDb: false })
  }

  const fetchedMessages = await channel.messages.fetch({ limit: 100 })
  const sortedMessages = Array.from(fetchedMessages.values()).sort(
    (a, b) => a.createdTimestamp - b.createdTimestamp
  )
  const botMessages = sortedMessages.filter((msg) => msg.author.id === client.user.id)

  const summaryMsg = botMessages.find((msg) => !isV2(msg))
  const divisionMsgs = botMessages.filter((msg) => isV2(msg))

  // build containers para todas las divisiones
  const containersByDivision = []
  for (const division of divisions) {
    const divisionIdNorm = normalizeId(division.divisionId)

    const teams = division.teams
      .slice() // por si acaso
      .sort((a, b) => (b.points || 0) - (a.points || 0))
      .map((team, index) => {
        // resultado efectivo (predicciones)
        let effectiveResult = team.result
        if (predictions) {
          const pred = predictions.find(p => normalizeId(p.divisionId) === divisionIdNorm)
          if (pred) {
            const teamIdNorm = normalizeId(team.teamId)
            if ((pred.promoted || []).some(t => normalizeId(t.teamId) === teamIdNorm)) effectiveResult = 'promoted'
            else if ((pred.relegated || []).some(t => normalizeId(t.teamId) === teamIdNorm)) effectiveResult = 'relegated'
            else if ((pred.winner || []).some(t => normalizeId(t.teamId) === teamIdNorm)) effectiveResult = 'winner'
            else if ((pred.expelled || []).some(t => normalizeId(t.teamId) === teamIdNorm)) effectiveResult = 'expelled'
            else effectiveResult = 'stayed'
          }
        }

        // team.teamId puede ser documento poblado o ObjectId o incluso undefined si algo falló.
        const teamDoc = team.teamId || {}
        const teamIdForObj = teamDoc._id ? teamDoc._id : team.teamId

        return {
          teamId: teamIdForObj,
          name: teamDoc.name || 'Desconocido',
          iconURL: teamDoc.iconURL || '',
          points: team.points ?? 0,
          result: effectiveResult,
          rank: index + 1
        }
      })

    const containers = await buildDivisionContainers({ division: division.divisionId, season, teams })
    containersByDivision.push(containers)
  }

  const flatContainers = containersByDivision.reduce((acc, arr) => acc.concat(arr), [])

  // actualizar o crear summary
  if (summaryMsg) {
    try {
      await summaryMsg.edit({ embeds: [getSeasonSummaryEmbed({ season })] })
    } catch (err) {}
  } else {
    await channel.send({ embeds: [getSeasonSummaryEmbed({ season })] })
  }

  // editar mensajes existentes en orden y solo crear/eliminar lo necesario
  const targetCount = flatContainers.length
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

  if (divisionMsgs.length > targetCount) {
    for (let i = targetCount; i < divisionMsgs.length; i++) {
      await divisionMsgs[i].delete().catch(() => {})
    }
  }
}

async function buildDivisionContainers({ division, teams, season, chunkSize = 6 }) {
  const teamChunks = chunkArray(teams, chunkSize)
  const containers = []
  const safeColor = division && division.color ? division.color.replace('#', '') : '2f3136'
  const accent = parseInt(safeColor, 16)

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

    if (chunkIndex === 0) {
      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `### ${division.emoji || emojis.division} División ${division.name || 'Sin nombre'} — ${teams.length}/${maxTeams}`
        )
      )
    }

    for (let j = 0; j < teamGroup.length; j++) {
      const team = teamGroup[j]
      const { points, result, rank, name, iconURL } = team

      const thumbnailComponent = new ThumbnailBuilder({ media: { url: iconURL || undefined } })

      const resultEmoji = (() => {
        if (result === 'promoted') return emojis.promoted
        if (result === 'relegated') return emojis.relegated
        if (result === 'winner') return emojis.winner
        if (result === 'expelled') return emojis.expelled
        return emojis.team
      })()

      async function getMatchesPlayedInSeason(teamId, seasonId) {
        let matchesPlayed = await Match.countDocuments({
          seasonId,
          status: 'played',
          $or: [{ teamAId: teamId }, { teamBId: teamId }]
        })
        const team = await Team.findById(teamId)
        if (team.name === 'Dark Sayo') matchesPlayed += 2 // cambiar proximamente
        return matchesPlayed
      }

      async function getMatchesWonInSeason(teamId, seasonId) {
        const matches = await Match.find({
          seasonId,
          status: 'played',
          $or: [{ teamAId: teamId }, { teamBId: teamId }]
        }).select('teamAId teamBId scoreA scoreB')
        const team = await Team.findById(teamId)

        let wins = 0
        if (team.name === 'Dark Sayo') wins = 2 // cambiar proximamente
        for (const match of matches) {
          const isTeamA = String(match.teamAId) === String(teamId)
          const teamScore = isTeamA ? match.scoreA : match.scoreB
          const rivalScore = isTeamA ? match.scoreB : match.scoreA
          if (teamScore > rivalScore) wins++
        }

        return wins
      }

      const matchesPlayed = await getMatchesPlayedInSeason(team.teamId, season._id)
      const matchesWon = await getMatchesWonInSeason(team.teamId, season._id)
      const matchesWinrate = (matchesPlayed > 0
        ? ((matchesWon / matchesPlayed) * 100)
        : 0).toFixed(0)

      const sectionComponent = new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `### ${resultEmoji} ${rank}. ${name}\n${emojis.points} Puntos: ${points}\n${emojis.match} Victorias: ${matchesWon} \`(${matchesWinrate}%)\``
          )
        )
        .setThumbnailAccessory(thumbnailComponent)

      if (!(chunkIndex > 0 && j === 0)) {
        container.addSeparatorComponents(new SeparatorBuilder())
      }

      container.addSectionComponents(sectionComponent)
    }

    containers.push(container)
  }

  return containers
}

module.exports = { updateRankingsEmbed }
