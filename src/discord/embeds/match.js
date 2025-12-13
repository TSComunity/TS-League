const {
  EmbedBuilder,
  ActionRowBuilder,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder
} = require('discord.js')
const { generateMapCollage } = require('../../services/sets.js')
const { getMatchChangeScheduleButton } = require('../buttons/match.js')
const emojis = require('../../config/emojis.json')
const modesData = require('../../config/gameModes.json')

/**
 * Genera el embed/container con info completa de un match
 * @param {Object} match - Documento de match de Mongo
 * @param {Boolean} showButtons - Mostrar botones de interacción
 * @returns {ContainerBuilder}
 */
const getMatchInfoEmbed = async ({ match, showButtons = false }) => {
  const {
    matchIndex,
    teamAId,
    teamBId,
    scoreA,
    scoreB,
    status,
    scheduledAt,
    sets,
    previewImageURL,
    resultsImageURL,
    reason,
    starPlayerId
  } = match

  const getModeData = (modeId) => modesData.find(m => m.id === modeId) || null
  const getMapData = (mapId) => {
    for (const mode of modesData) {
      const map = mode.maps.find(m => m.id === mapId)
      if (map) return map
    }
    return null
  }

  // Imagen principal según estado
  let imageURL = null
  if ((status === 'played') && resultsImageURL) imageURL = resultsImageURL
  if ((status === 'scheduled' || status === 'cancelled' || status === 'onGoing') && previewImageURL) imageURL = previewImageURL

  // Color según estado
  const statusColors = {
    scheduled: '#FFD700',
    cancelled: '#FF0000',
    played: '#1E90FF',
    onGoing: '#FFA500'
  }
  const accentColor = parseInt(statusColors[status]?.replace('#','') || '1E90FF', 16)

  // Título y texto principal
  const title = `## ${emojis.match} ${teamAId?.name || "Equipo A"} vs ${teamBId?.name || "Equipo B"}\n`
  let infoText = ''

  if (status === 'scheduled') {
    infoText += `${emojis.schedule} ${scheduledAt ? `<t:${Math.floor(new Date(scheduledAt).getTime()/1000)}> (<t:${Math.floor(new Date(scheduledAt).getTime()/1000)}:R>)\n` : "*Por definir*\n"}`
  } else if (status === 'onGoing') {
    infoText += `${emojis.onGoing} Partido en curso\n`
  } else if (status === 'played') {
    const winnerFirst = scoreA >= scoreB
      ? [teamAId.name, scoreA, scoreB]
      : [teamBId.name, scoreB, scoreA]

    infoText += `${emojis.winner} **${winnerFirst[0]}** (${winnerFirst[1]} - ${winnerFirst[2]})\n`
    if (starPlayerId) infoText += `${emojis.starPlayer} <@${starPlayerId.discordId}>\n`
  } else if (status === 'cancelled') {
    infoText += `${emojis.canceled} Cancelado${reason ? `\n> ${reason}` : ''}`
  }

  // Resumen de sets
// ...
  // Resumen de sets según estado
  if (sets?.length > 0) {
    infoText += `### Sets\n`

    sets.forEach((set, i) => {
      const mode = getModeData(set.mode)
      const map = getMapData(set.map)
      const modeEmoji = mode?.emoji || "🎮"
      const mapName = map?.name || `Mapa ${i + 1}`

      if (status === 'scheduled') {
        // Solo icono y nombre
        infoText += `${modeEmoji} ${mapName}\n`
      }

      else if (status === 'onGoing') {
        // Mostrar solo lo jugado
        infoText += `${modeEmoji} ${mapName}\n`
        if (set.winner) {
          let winnerText = `> ${emojis.winner} *No definido*\n`
          if (set.winner.equals(teamAId._id)) winnerText = `> ${emojis.winner} ${teamAId.name}\n`
          else if (set.winner.equals(teamBId._id)) winnerText = `> ${emojis.winner} ${teamBId.name}\n`

          let starPlayerText = set.starPlayerId
            ? `> ${emojis.starPlayer} <@${set.starPlayerId.discordId}>\n`
            : `> ${emojis.starPlayer} *No definido*\n`
          infoText += `${winnerText}${starPlayerText}`
        }
      }

      else if (status === 'played') {
        // Igual que ongoing pero mostrando todo
        let winnerText = ""
        if (set.winner) {
          if (set.winner.equals(teamAId._id)) winnerText = `> ${emojis.winner} ${teamAId.name}`
          else if (set.winner.equals(teamBId._id)) winnerText = `> ${emojis.winner} ${teamBId.name}`
        }

        let starPlayerText = set.starPlayerId
          ? `\n> ${emojis.starPlayer} <@${set.starPlayerId.discordId}>\n`
          : `> ${emojis.starPlayer} *No definido*\n`

        infoText += `${modeEmoji} ${mapName}\n${winnerText}${starPlayerText}`
      }

      else if (status === 'cancelled') {
        infoText += `${modeEmoji} ${mapName}\n`
        if (set.winner) {
          let winnerText = ""
          if (set.winner.equals(teamAId._id)) winnerText = `${emojis.winner} ${teamAId.name}\n`
          else if (set.winner.equals(teamBId._id)) winnerText = `${emojis.winner} ${teamBId.name}\n`

          let starPlayerText = set.starPlayerId
            ? `${emojis.starPlayer} <@${set.starPlayerId.discordId}>`
            : "*No definido*"
          infoText += `${winnerText}${starPlayerText}\n`
        }
      }
    })
  }

  // Construcción del container
  const container = new ContainerBuilder().setAccentColor(accentColor)

  if (imageURL) {
    const image = new MediaGalleryItemBuilder()
      .setURL(imageURL)
      .setDescription(`${teamAId?.name || "Equipo A"} vs ${teamBId?.name || "Equipo B"}`)

    const gallery = new MediaGalleryBuilder()
      .setId(1)
      .addItems([image])

    container.addMediaGalleryComponents([gallery])
    container.addSeparatorComponents(new SeparatorBuilder())
  }

  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(title))
  container.addSeparatorComponents(new SeparatorBuilder())
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(infoText))

  // Galería de sets
  if (sets?.length > 0) {
    const collageBuffer = await generateMapCollage({ sets })
    const gallery = new MediaGalleryBuilder()
      .setId(2)
      .addItems([
        new MediaGalleryItemBuilder()
          .setURL(collageBuffer, 'maps.png')
          .setDescription('Mapas de la partida')
      ])
    container.addSeparatorComponents(new SeparatorBuilder())
    container.addMediaGalleryComponents([gallery])
  }

  // Botón opcional
  if (showButtons && status === 'scheduled') {
    container.addSeparatorComponents(new SeparatorBuilder())
    container.addActionRowComponents(
      new ActionRowBuilder().addComponents(getMatchChangeScheduleButton({ matchIndex }))
    )
  }

  return container
}

/**
 * Embed para propuesta de cambio de horario
 */
const getMatchProposedScheduleEmbed = ({ interaction, oldTimestampUnix, timestampUnix, status = 'pending' }) => {
  let color = 'Yellow'
  let description = `### <@${interaction.user.id}> ha propuesto cambiar la hora del partido.`

  if (status === 'accepted') {
    color = 'Green'
    description = `### La propuesta ha sido aceptada por <@${interaction.user.id}>.`
  } else if (status === 'rejected') {
    color = 'Red'
    description = `### La propuesta ha sido rechazada por <@${interaction.user.id}>.`
  }

  return new EmbedBuilder()
    .setColor(color)
    .setDescription(description)
    .addFields(
      { name: `${emojis.schedule} Hora Actual`, value: oldTimestampUnix ? `<t:${oldTimestampUnix}:F>` : "*No definida*", inline: true },
      { name: `${emojis.schedule} Hora Propuesta`, value: `<t:${timestampUnix}:F>`, inline: true }
    )
}

const getOnGoingMatchEmbed = async ({ match }) => {
  const { teamAId, teamBId, sets } = match

  const getModeData = (modeId) => modesData.find(m => m.id === modeId) || null
  const getMapData = (mapId) => {
    for (const mode of modesData) {
      const map = mode.maps.find(m => m.id === mapId)
      if (map) return map
    }
    return null
  }

  const container = new ContainerBuilder().setAccentColor(0xFFA500)

  // Título
  const title = `## ${emojis.onGoing} ${teamAId?.name || "Equipo A"} vs ${teamBId?.name || "Equipo B"}`
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(title))
  container.addSeparatorComponents(new SeparatorBuilder())

  // Sets
  if (sets?.length > 0) {
    const blocks = sets.map((set, i) => {
      const mode = getModeData(set.mode)
      const map = getMapData(set.map)
      const modeEmoji = mode?.emoji || "🎮"
      const mapName = map?.name || `Mapa ${i + 1}`

      let winnerText = `${emojis.winner} *No definido*`
      if (set.winner) {
        if (set.winner.equals(teamAId._id)) winnerText = `${emojis.winner} **${teamAId.name}**`
        else if (set.winner.equals(teamBId._id)) winnerText = `${emojis.winner} **${teamBId.name}**`
      }

      let starPlayerText = `\n${emojis.starPlayer} *No definido*`
      if (set.starPlayerId) {
        starPlayerText = `\n${emojis.starPlayer} <@${set.starPlayerId.discordId}>`
      }

      return `### ${modeEmoji} ${mapName}\n${winnerText}${starPlayerText}`
    })

    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(blocks.join("\n")))
  } else {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent("Sets aún no definidos"))
  }

  container.addSeparatorComponents(new SeparatorBuilder())

  // Imagen con collage de mapas
  if (sets?.length > 0) {
    const collageBuffer = await generateMapCollage({ sets })
    if (collageBuffer) {
      const gallery = new MediaGalleryBuilder()
        .setId(1)
        .addItems([
          new MediaGalleryItemBuilder()
            .setURL(collageBuffer, "maps.png")
            .setDescription("Mapas de la partida")
        ])
      container.addMediaGalleryComponents([gallery])
    }
  }

  return container
}

const getMatchResultsEmbed = ({ match, team = null }) => {
  let orderedTeams;

  if (team) {
    if (team._id.toString() === match.teamAId._id.toString()) {
      orderedTeams = [
        { team: match.teamAId, score: match.scoreA },
        { team: match.teamBId, score: match.scoreB }
      ];
    } else {
      orderedTeams = [
        { team: match.teamBId, score: match.scoreB },
        { team: match.teamAId, score: match.scoreA }
      ];
    }
  } else {
    if (match.scoreA >= match.scoreB) {
      orderedTeams = [
        { team: match.teamAId, score: match.scoreA },
        { team: match.teamBId, score: match.scoreB }
      ];
    } else {
      orderedTeams = [
        { team: match.teamBId, score: match.scoreB },
        { team: match.teamAId, score: match.scoreA }
      ];
    }
  }

  let accentColor = 0x1E90FF;
  if (team) {
    const won =
      (team._id.toString() === match.teamAId._id.toString() && match.scoreA > match.scoreB) ||
      (team._id.toString() === match.teamBId._id.toString() && match.scoreB > match.scoreA);
    accentColor = won ? 0x00FF00 : 0xFF0000;
  }

  const scoreLine = team
    ? `## ${emojis.ended} Resultado de vuestro partido contra ${orderedTeams[1].team?.name || "Equipo B"}`
    : `## ${emojis.ended} ${orderedTeams[0].team?.name || "Equipo A"} vs ${orderedTeams[1].team?.name || "Equipo B"}`;

  let winnerText;
  if (match.scoreA === match.scoreB) {
    winnerText = 'Empate';
  } else if (match.scoreA > match.scoreB) {
    winnerText = match.teamAId.name;
  } else {
    winnerText = match.teamBId.name;
  }

  let statsText = `${emojis.winner} **${winnerText}** (${match.scoreA} - ${match.scoreB})`;
  if (match.starPlayerId) {
    statsText += `\n${emojis.starPlayer} <@${match.starPlayerId.discordId}>`;
  }

  const container = new ContainerBuilder()
    .setAccentColor(accentColor)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(scoreLine))
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(statsText))
    .addSeparatorComponents(new SeparatorBuilder());

  if (match.resultsImageURL) {
    const gallery = new MediaGalleryBuilder()
      .setId(1)
      .addItems([
        new MediaGalleryItemBuilder()
          .setURL(match.resultsImageURL)
          .setDescription(`Resultados de ${match.teamAId?.name || "Equipo A"} vs ${match.teamBId?.name || "Equipo B"}`)
      ]);
    container.addMediaGalleryComponents([gallery]);
  }

  return container;
};

module.exports = { getMatchInfoEmbed, getMatchProposedScheduleEmbed, getOnGoingMatchEmbed, getMatchResultsEmbed  }