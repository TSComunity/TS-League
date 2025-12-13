const {
  ActionRowBuilder,
  ContainerBuilder,
  TextDisplayBuilder,
  MediaComponentBuilder,
  ThumbnailBuilder,
  SectionBuilder,
  SeparatorBuilder,
  MessageFlags,
  EmbedBuilder
} = require('discord.js');

const emojis = require('../../config/emojis.json')

const getDivisionEndedEmbed = ({ division, promoted = [], relegated = [], stayed = [], expelled = [], winner = [], finishedBefore = false }) => {
  // division puede ser { divisionId: <doc> } o directamente el doc
  const div = (division && division.divisionId) ? division.divisionId : division

  const container = new ContainerBuilder()
    .setAccentColor(parseInt(div?.color?.replace('#', ''), 16) || 3447003)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `### ${div?.emoji || emojis.division} División ${div?.name || 'Sin nombre'} — Finalizada`
      )
    )
    .addSeparatorComponents(new SeparatorBuilder())

  let desc = ''
  const appendList = (arr, emojiName) => {
    (arr || []).forEach(t => {
      const teamDoc = t?.teamId || {}
      const name = teamDoc?.name || 'Desconocido'
      const points = typeof t?.points === 'number' ? t.points : (teamDoc?.points ?? 0)
      desc += `${emojiName} ${name} (${emojis.points} ${points})\n`
    })
  }

  appendList(winner, emojis.winner)
  appendList(promoted, emojis.promoted)
  appendList(stayed, emojis.team)
  appendList(relegated, emojis.relegated)
  appendList(expelled, emojis.expelled)

  if ([...winner, ...promoted, ...relegated, ...stayed, ...expelled].length === 0) {
    desc = '*División sin equipos.*'
  }

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(desc)
  )

  if (finishedBefore) {
    container.addSeparatorComponents(new SeparatorBuilder())
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `Estos datos son aproximados debido a que la división ha terminado antes del fin de la temporada, una vez terminada la temporada se enviarán los resultados definitivos de la división.`
      )
    )
  }

  return container
}

// Embed de partidos de nueva ronda y descansos, robusto ante datos nulos
const getDivisionRoundAddedEmbed = ({ division }) => {

  const rounds = Array.isArray(division.rounds) ? division.rounds : Object.values(division.rounds)
  const round = rounds[rounds.length - 1]

  if (!round) throw new Error('No se ha encontrado la ronda.')

  const divisionDoc = division.divisionId
  const divisionName = divisionDoc?.name || 'División sin nombre'

  const matches = round?.matches ?? []
  const resting = round?.resting ?? []

  const container = new ContainerBuilder()
    .setAccentColor(parseInt(divisionDoc?.color?.replace('#', '') || '0000FF', 16))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `### ${divisionDoc?.emoji || emojis.division} División ${divisionName} — Nuevos Partidos`
      )
    )

  // Partidos nuevos
  for (const matchObj of matches) {
    const match = matchObj.matchId
    const teamAName = match.teamAId?.name || 'Sin nombre'
    const teamBName = match.teamBId?.name || 'Sin nombre'
    const channel = match.channelId ? `<#${match.channelId}>` : 'Sin canal'

    container.addSeparatorComponents(new SeparatorBuilder())
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `### ${emojis.match} ${teamAName} vs ${teamBName}\n${emojis.channel} ${channel}`
      )
    )
  }

  // Equipos en descanso
  for (const restingTeamObj of resting) {
    const restingTeam = restingTeamObj.teamId
    const teamName = restingTeam?.name || 'Sin nombre'

    container.addSeparatorComponents(new SeparatorBuilder())
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `### ${emojis.rest} ${teamName}`
      )
    )
  }

  return container
}

module.exports = { getDivisionEndedEmbed, getDivisionRoundAddedEmbed }