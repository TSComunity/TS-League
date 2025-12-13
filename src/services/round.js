const Team = require('../models/Team.js')
const ScheduledFunction = require('../models/ScheduledFunction.js')
const { generateMatchmaking } = require('./matchmaking.js')
const { addScheduledFunction } = require('./scheduledFunction.js')
const { calculatePromotionRelegation, endSeason } = require('./season.js')
const { generateRandomSets } = require('./sets.js')
const { getActiveSeason } = require('../utils/season.js')
const { sendAnnouncement } = require('../discord/send/general.js')
const { getRoundAddedEmbed } = require('../discord/embeds/round.js')
const { getDivisionEndedEmbed, getDivisionRoundAddedEmbed } = require('../discord/embeds/division.js')

const { season: seasonConfig, round, roles, guild } = require('../config/league.js')
const { maxRounds } = seasonConfig
const emojis = require('../config/emojis.json')
const { startDay, startHour } = round

const skipRound = async () => {
  const season = await getActiveSeason()
  
  if (!season || season.status !== 'active') {
    throw new Error('No hay una temporada activa.')
  }

  // Encontrar el número de jornada actual (la más alta)
  const currentRoundIndex = Math.max(
    0, 
    ...season.divisions.map(d => d.rounds?.length || 0)
  )

  if (currentRoundIndex === 0) {
    throw new Error('No hay ninguna jornada para skipear.')
  }

  // Obtener la función programada actual
  const currentScheduled = await ScheduledFunction.findOne({ functionName: 'addRound' })
  
  if (!currentScheduled) {
    throw new Error('No hay ninguna función de addRound programada.')
  }

  // Calcular nueva fecha: 7 días después
  const newScheduledDate = new Date(currentScheduled.scheduledFor)
  newScheduledDate.setDate(newScheduledDate.getDate() + 7)

  // Actualizar la fecha directamente
  currentScheduled.scheduledFor = newScheduledDate
  await currentScheduled.save()

  return {
    skippedRound: currentRoundIndex + 1,
    newScheduledDate: newScheduledDate
  }
}

const addRound = async ({ client }) => {
  let season = await getActiveSeason()

  const divisionsSkipped = []
  const divisionsWithNewRounds = []

  const setsForThisRound = await generateRandomSets()

  // Procesar todas las divisiones
  for (const division of season.divisions) {
    const { divisionId, status, teams, rounds } = division

    // Estado previo para etiquetas
    const wasEnded = status === 'ended'
    const roundsBefore = rounds?.length || 0

    let endedJustNow = false
    let alreadyEnded = false
    let newMatchesDocs = []
    let newRestingTeamsDocs = []
    let nextRoundIndex = roundsBefore + 1

    // Si la división ya estaba terminada
    if (wasEnded) {
      alreadyEnded = true
      endedJustNow = false
      divisionsSkipped.push({ divisionDoc: divisionId, alreadyEnded, endedJustNow })
      continue
    }

    // Si ya llegó al máximo de rondas
    if (roundsBefore >= maxRounds) {
      division.status = 'ended'
      endedJustNow = true
      alreadyEnded = false
      divisionsSkipped.push({ divisionDoc: divisionId, alreadyEnded, endedJustNow })
      continue
    }

    const matchesDocs = rounds.flatMap(r => r.matches.map(m => m.matchId))
    const teamsDocs = teams.map(t => t.teamId);

    const matchmakingResult = await generateMatchmaking({
      client,
      matchesDocs,
      teamsDocs,
      season,
      division,
      nextRoundIndex,
      setsForThisRound
    })

    newMatchesDocs = matchmakingResult.newMatchesDocs || []
    newRestingTeamsDocs = matchmakingResult.newRestingTeamsDocs || []
    // Si no hay partidos posibles, terminar la división
    if (!newMatchesDocs.length) {
      division.status = 'ended'
      endedJustNow = true
      alreadyEnded = false
      divisionsSkipped.push({ divisionDoc: divisionId, alreadyEnded, endedJustNow })
      continue
    }

    const newRound = {
      roundIndex: nextRoundIndex,
      matches: newMatchesDocs.map((match) => ({ matchId: match._id })),
      resting: newRestingTeamsDocs.map((team) => ({ teamId: team.teamId })),
      sets: setsForThisRound
    }

    division.rounds.push(newRound)

    // Añadir a divisiones con nueva ronda
    divisionsWithNewRounds.push({
      divisionDoc: divisionId,
      newMatchesDocs,
      newRestingTeamsDocs,
      roundIndex: nextRoundIndex,
      alreadyEnded: false,
      endedJustNow: false
    })
  }

  await season.save()
  season = await getActiveSeason()
  const promotionData = await calculatePromotionRelegation({ client, season, updateDb: false})

  // Si todas las divisiones están terminadas, termina la temporada
  if (divisionsSkipped.length === season.divisions.length) {
    await endSeason({ client })
    return season
  }

  // 1. Ordena las divisiones por tier
  const orderedDivisions = [...season.divisions].sort((a, b) => a.divisionId.tier - b.divisionId.tier)

  // 2. Si hay al menos una con nueva ronda, envía embed general
  if (divisionsWithNewRounds.length > 0) {
    const latestRoundIndex = Math.max(
      ...divisionsWithNewRounds.map((d) => d.roundIndex)
    )

    await sendAnnouncement({
      client,
      content: `<@&${roles.ping.id}>`,
      embeds: [
        getRoundAddedEmbed({ divisionsWithNewRounds, season, nextRoundIndex: latestRoundIndex })
      ]
    })
  }

  // 3. Por cada división en orden por tier
  for (const division of orderedDivisions) {
    const divisionId = division.divisionId

    // Si terminó justo ahora, embed de fin de división
    const ended = divisionsSkipped.find(d => String(d.divisionDoc._id) === String(divisionId._id) && d.endedJustNow)
    if (ended) {
      const divisionData = promotionData.find(d => 
        String(d.divisionId._id) === String(divisionId._id)
      )      
      const container = getDivisionEndedEmbed({
        division: divisionData,
        promoted: divisionData.promoted,
        relegated: divisionData.relegated,
        stayed: divisionData.stayed,
        expelled: divisionData.expelled,
        winner: divisionData.winner,
        finishedBefore: true
      })

      await sendAnnouncement({
        client,
        components: [container],
        isComponentsV2: true
      })
      continue
    }
    
    const hasRounds = divisionsWithNewRounds.find(d => String(d.divisionDoc._id) === String(divisionId._id))
    if (hasRounds) {
    await sendAnnouncement({
      client,
      components: [getDivisionRoundAddedEmbed({ division })],
      isComponentsV2: true
    })
    continue
    }
  }

  // Actualizar scheduled event asociado a la temporada (si existe)
  // 🔄 Actualizar evento programado asociado a la temporada
  try {
    if (client && guild && guild.id && season?.scheduledEventId) {
      const guildObj = await client.guilds.fetch(guild.id);
      if (!guildObj) return;

      const ev = await guildObj.scheduledEvents.fetch(season.scheduledEventId).catch(() => null);
      if (!ev) return;

      // Cálculos actualizados
      const latestRoundIndex = Math.max(0, ...season.divisions.map(d => d.rounds?.length || 0));
      const roundNumberPadded = String(latestRoundIndex).padStart(2, '0');


      const eventName = `TS League — T${season.seasonIndex} · J${roundNumberPadded}`;
        const description = [
          `${emojis.season} Temporada ${season.name}`,
          `${emojis.round} Jornada: ${roundNumberPadded}`,
          `${emojis.match} Partidos: ${
            season.divisions.reduce((acc, d) => acc + d.rounds.reduce((a, r) => a + r.matches.length, 0), 0)
          }`
        ].join('\n');

      await ev.edit({
        name: eventName,
        description
      });
    }
  } catch (err) {
    console.error('Error actualizando scheduledEvent de la temporada:', err);
  }

   await addScheduledFunction({
     functionName: 'addRound',
     day: startDay,
     hour: startHour
   })

   return season
 }

 module.exports = { addRound, skipRound }