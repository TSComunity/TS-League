const { ChannelType, PermissionsBitField, MessageFlags } = require('discord.js')

const Division = require('../models/Division')
const Match = require('../models/Match')
const Team = require('../models/Team')
const User = require('../models/User')

const { sendTeamAnnouncement } = require('../discord/send/team.js')

const { getActiveSeason } = require('../utils/season.js')
const { getCurrentRoundNumber } = require('../utils/round.js')
const { findMatch } = require('../utils/match.js')
const { getDate, checkDeadline } = require('../utils/date.js')
const { generateMatchPreviewImageURL, generateMatchResultsImageURL } = require('../utils/canvas.js')

const { getMatchInfoEmbed, getOnGoingMatchEmbed, getMatchResultsEmbed } = require('../discord/embeds/match.js')

const { guild: guildConfig, channels, roles, match: matchConfig } = require('../configs/league.js')
const emojis = require('../configs/emojis.json')

const { BRAWL_STARS_API_KEY } = require('../configs/configs.js')

async function updatePermissionsForMatch({ client, match }) {
  if (!match || !client || !match?.channelId) return { ok: false, reason: 'no match or client or channelId' };

  const guild = await client.guilds.fetch(guildConfig.id).catch(err => { console.error('fetch guild err', err); return null; });
  if (!guild) return { ok: false, reason: 'guild not found' };

  // Poblar equipos y miembros
  const matchToUpd = await Match.findById(match._id)
    .populate({ path: 'teamAId teamBId', populate: { path: 'members.userId' } });

  if (!matchToUpd?.teamAId || !matchToUpd?.teamBId) return { ok: false, reason: 'teams not populated' };

  const parsePermissionsToBigInt = (names = []) => {
    let bits = 0n;
    for (const name of names) {
      if (PermissionsBitField.Flags[name]) bits |= BigInt(PermissionsBitField.Flags[name]);
    }
    return bits;
  };

  try {
    const channel = await guild.channels.fetch(matchToUpd.channelId).catch(() => null);
    if (!channel) return { ok: false, reason: 'channel not found' };

    // Check bot permissions
    const botMember = await guild.members.fetch(client.user.id).catch(() => null);
    if (!botMember) return { ok: false, reason: 'bot member not fetchable' };
    const botPerms = botMember.permissionsIn(channel);
    if (!botPerms.has(PermissionsBitField.Flags.ManageChannels)) {
      return { ok: false, reason: 'bot missing ManageChannels permission' };
    }

    // === Construir teamMemberIds (strings) y desiredMap (members + role overwrites) ===
    const desiredMap = new Map();
    const teamMemberIds = new Set();
    const botId = client.user.id;

    // Helper
    const fetchGuildMember = async (discordId) => {
      try { return await guild.members.fetch(discordId); } catch { return null; }
    };

    // Team members -> individual overwrites
    for (const teamDoc of [matchToUpd.teamAId, matchToUpd.teamBId]) {
      for (const m of teamDoc.members) {
        const discordId = m.userId?.discordId;
        if (!discordId) continue;
        const gm = await fetchGuildMember(discordId);
        if (!gm) {
          console.warn(`[updatePermissionsForMatch] Member ${discordId} not in guild, skipping`);
          continue;
        }
        teamMemberIds.add(gm.id);
        let permsArray = [...channels.permissions.member];
        if (m.role === 'leader') permsArray = [...permsArray, ...channels.permissions.leader];
        if (m.role === 'sub-leader') permsArray = [...permsArray, ...channels.permissions.subLeader];
        desiredMap.set(gm.id, parsePermissionsToBigInt(permsArray));
      }
    }

    // Staff roles -> role overwrites only
    const staffRolesResolved = [];
    for (const rId of roles.staff || []) {
      const r = await guild.roles.fetch(rId).catch(() => null);
      if (r) staffRolesResolved.push(r);
      else console.warn(`[updatePermissionsForMatch] Staff role ${rId} not found`);
    }
    for (const role of staffRolesResolved) {
      const bits = parsePermissionsToBigInt([...channels.permissions.member, ...channels.permissions.staff]);
      desiredMap.set(role.id, bits);
    }

    // Preserve bot entry
    desiredMap.set(botId, desiredMap.get(botId) || 0n);

    // === Leer overwrites actuales ===
    const existingOverwrites = channel.permissionOverwrites.cache.map(o => ({
      id: o.id,
      allow: BigInt(o.allow?.bitfield ?? o.allow?.value ?? 0n),
      deny: BigInt(o.deny?.bitfield ?? o.deny?.value ?? 0n),
      type: o.type
    }));

    // Intentar identificar qué overwrites actuales son miembros del guild (fetch en paralelo)
    const existingIds = existingOverwrites.map(x => x.id);
    const fetchPromises = existingIds.map(id =>
      guild.members.fetch(id).then(m => ({ id, member: m })).catch(() => ({ id, member: null }))
    );
    const fetchResults = await Promise.all(fetchPromises);
    const existingIsMemberMap = new Map(fetchResults.map(r => [r.id, !!r.member]));

    // === Construir finalMap empezando por los existentes (preservar roles/otros) ===
    const finalMap = new Map();
    for (const ex of existingOverwrites) finalMap.set(ex.id, { id: ex.id, allow: ex.allow, deny: ex.deny, type: ex.type });

    // Guarantee @everyone present
    const everyoneId = guild.roles.everyone.id;
    if (!finalMap.has(everyoneId)) finalMap.set(everyoneId, { id: everyoneId, allow: 0n, deny: 0n, type: 'role' });

    // Apply desired overwrites (override allow)
    for (const [id, allowBits] of desiredMap.entries()) {
      const prev = finalMap.get(id);
      finalMap.set(id, {
        id,
        allow: allowBits,
        deny: prev ? prev.deny : 0n,
        type: prev ? prev.type : 'member'
      });
    }

    // === Determine members to force-deny: those existing that are members (identified) AND
    //     NOT in teamMemberIds AND NOT the bot.
    const viewChannelBit = BigInt(PermissionsBitField.Flags.ViewChannel);
    const toForceDeny = [];

    for (const ex of existingOverwrites) {
      const id = ex.id;
      const isMemberOverwrite = existingIsMemberMap.get(id) === true || ex.type === 'member';
      if (!isMemberOverwrite) continue; // not a user member overwrite
      if (id === botId) continue;
      if (teamMemberIds.has(id)) continue; // current member -> keep as desiredMap above
      // Not a team member -> we will force deny ViewChannel and clear allow
      toForceDeny.push(id);
      const prev = finalMap.get(id);
      const prevDeny = prev ? prev.deny : ex.deny || 0n;
      finalMap.set(id, {
        id,
        allow: 0n,
        deny: (prevDeny || 0n) | viewChannelBit,
        type: 'member'
      });
    }

    // Ensure @everyone denies ViewChannel
    const everyoneEntry = finalMap.get(everyoneId);
    everyoneEntry.deny = (everyoneEntry.deny || 0n) | viewChannelBit;

    // Build array and apply atomically
    const finalArray = Array.from(finalMap.values()).map(entry => ({
      id: entry.id,
      allow: entry.allow,
      deny: entry.deny,
      type: entry.type
    }));

    await channel.permissionOverwrites.set(finalArray, `Sync perms for match ${matchToUpd._id}`);

    return { ok: true, applied: [...desiredMap.keys()].length, forcedDenied: toForceDeny.length, forcedDeniedIds: toForceDeny };
  } catch (err) {
    console.error('[updatePermissionsForMatch] error:', err);
    return { ok: false, reason: err.message || String(err) };
  }
}

const createMatchChannel = async ({ match, client }) => {
  try {
    const matchToUpd = await Match.findById(match._id)
      .populate({
        path: 'teamAId',
        model: 'Team',
        populate: { path: 'members.userId', model: 'User' }
      })
      .populate({
        path: 'teamBId',
        model: 'Team',
        populate: { path: 'members.userId', model: 'User' }
      })

    if (!matchToUpd) throw new Error('No se encontró el partido.')

    const teamA = matchToUpd.teamAId
    const teamB = matchToUpd.teamBId
    if (!teamA || !teamB) throw new Error('No se encontraron los equipos del partido')

    // IDs de miembros
    const leaderIds = [teamA, teamB].flatMap(t =>
      t.members.filter(m => m.role === 'leader').map(m => m.userId?.discordId)
    ).filter(Boolean)

    const subLeaderIds = [teamA, teamB].flatMap(t =>
      t.members.filter(m => m.role === 'sub-leader').map(m => m.userId?.discordId)
    ).filter(Boolean)

    const memberIds = [teamA, teamB].flatMap(t =>
      t.members.filter(m => m.role === 'member').map(m => m.userId?.discordId)
    ).filter(Boolean)

    const guild = await client.guilds.fetch(guildConfig.id)

    // Fetch miembros (evita fallo por no-cached)
    const fetchMember = async id => {
      try { return await guild.members.fetch(id) } catch { return null }
    }
    const leaderMembers = (await Promise.all(leaderIds.map(fetchMember))).filter(Boolean)
    const subLeaderMembers = (await Promise.all(subLeaderIds.map(fetchMember))).filter(Boolean)
    const normalMembers = (await Promise.all(memberIds.map(fetchMember))).filter(Boolean)

    // Fetch roles staff
    const fetchRole = async id => {
      try { return await guild.roles.fetch(id) } catch { return null }
    }
    const staffRolesResolved = (await Promise.all((roles.staff || []).map(fetchRole))).filter(Boolean)

    // Permisos: member base + extras
    const parsePerms = names => names.map(name => PermissionsBitField.Flags[name])
    const memberPermissions = parsePerms(channels.permissions.member)
    const leaderPermissions = [...memberPermissions, ...parsePerms(channels.permissions.leader)]
    const subLeaderPermissions = [...memberPermissions, ...parsePerms(channels.permissions.subLeader || [])]
    const staffPermissions = [...memberPermissions, ...parsePerms(channels.permissions.staff)]

    const permissionOverwrites = [
      { id: guild.roles.everyone.id, deny: [PermissionsBitField.Flags.ViewChannel] },
      ...leaderMembers.map(m => ({ id: m.id, allow: leaderPermissions })),
      ...subLeaderMembers.map(m => ({ id: m.id, allow: subLeaderPermissions })),
      ...normalMembers.map(m => ({ id: m.id, allow: memberPermissions })),
      ...staffRolesResolved.map(r => ({ id: r.id, allow: staffPermissions }))
    ]

    // Obtener categoría de la división
    const divisionId = teamA.divisionId?._id || teamA.divisionId
    const division = await Division.findById(divisionId)
    if (!division) throw new Error('No se encontró la división del partido')
    const categoryId = division.matchesCategoryId
    if (!categoryId) throw new Error('La división no tiene definida matchesCategoryId')

    // Nombre esperado
    const expectedName = `${matchConfig.channels.prefix}partido-${matchToUpd.matchIndex}`

    // Evitar duplicados: buscar por name+parent en cache
    let existingChannel = guild.channels.cache.find(c => c.name === expectedName && c.parentId === categoryId) || null

    // Si match ya tiene channelId, intentar fetch y usarlo
    if (!existingChannel && matchToUpd.channelId) {
      existingChannel = await client.channels.fetch(matchToUpd.channelId).catch(() => null)
    }

    // Si ya existe, actualizar channelId y overwrites y retornar
    if (existingChannel) {
      if (matchToUpd.channelId !== existingChannel.id) {
        matchToUpd.channelId = existingChannel.id
        await matchToUpd.save()
      }
      try { await existingChannel.permissionOverwrites.set(permissionOverwrites) } catch (err) { console.warn('No se pudieron aplicar overwrites al canal existente:', err) }
      return matchToUpd
    }

    // Antes de crear: re-lectura de match por si otro proceso creó el canal
    const freshMatch = await Match.findById(match._id)
    if (freshMatch?.channelId) {
      // intentar usar ese canal
      const ch = await client.channels.fetch(freshMatch.channelId).catch(() => null)
      if (ch) {
        // reaplicar perms y devolver
        try { await ch.permissionOverwrites.set(permissionOverwrites) } catch {}
        return freshMatch
      }
    }

    // Crear canal
    const channel = await guild.channels.create({
      name: expectedName,
      type: ChannelType.GuildText,
      parent: categoryId,
      topic: `Partido entre **${teamA.name}** y **${teamB.name}** — Jornada ${matchToUpd.roundIndex}`,
      permissionOverwrites
    })

    matchToUpd.channelId = channel.id

    await channel.send({ content: `<@&${roles.ping.id}> ¡Canal del partido creado!` })
    const infoMsg = await channel.send({
      components: [await getMatchInfoEmbed({ match: matchToUpd, showButtons: true })],
      flags: MessageFlags.IsComponentsV2,
      allowedMentions: { parse: [] }
    })
    await infoMsg.pin().catch(() => null)
    matchToUpd.infoMessageId = infoMsg.id

    await matchToUpd.save()
    return matchToUpd
  } catch (error) {
    // Limpieza en caso de error parcial
    if (match.channelId) {
      try {
        const channel = await client.channels.fetch(match.channelId)
        if (channel) await channel.delete('Error al crear el canal del partido, limpieza de canal')
      } catch (err) { console.error('No se pudo eliminar el canal tras error:', err) }
    }
    await Match.findByIdAndDelete(match._id).catch(() => {})
    throw error
  }
}

/**
 * Crea una instancia de partido (Match) sin guardarla.
 * @param {ObjectId} seasonId - ID de la temporada
 * @param {ObjectId} divisionId - ID de la division
 * @param {Number} roundIndex - Numero de la ronda
 * @param {ObjectId} teamAId - ID del equipo A
 * @param {ObjectId} teamBId - ID del equipo B
 * @returns {Match} Instancia de partido (sin guardar)
 */
const createMatch = async ({ client, seasonId, divisionDoc, roundIndex, teamADoc, teamBDoc, sets }) => {
  // Calcular matchIndex según los últimos partidos
  const lastMatch = await Match.findOne({}).sort({ matchIndex: -1 })
  const matchIndex = lastMatch ? lastMatch.matchIndex + 1 : 1

  // Generar preview antes de crear el match
  const previewImageURL = await generateMatchPreviewImageURL({
    divisionDoc,
    roundIndex,
    teamADoc,
    teamBDoc
  })

  let match
  try {
    // Crear el partido
    match = await Match.create({
      matchIndex,
      roundIndex,
      seasonId,
      divisionId: divisionDoc._id,
      teamAId: teamADoc._id,
      teamBId: teamBDoc._id,
      scoreA: 0,
      scoreB: 0,
      status: 'scheduled',
      sets,
      previewImageURL
    })

    // Crear canal de Discord y actualizar el match con channelId
    const updatedMatch = await createMatchChannel({ match, client })

    // Anuncios a equipos
    await sendTeamAnnouncement({
      client,
      team: teamADoc,
      content: `### ${emojis.match} Nuevo partido programado\nSe ha programado un nuevo partido para vuestro equipo **${teamADoc.name}**. El enfrentamiento será contra **${teamBDoc.name}** en la jornada ${roundIndex}.\n\nPodéis consultar todos los detalles y la información actualizada del partido en el canal <#${updatedMatch.channelId}>.`
    })

    await sendTeamAnnouncement({
      client,
      team: teamBDoc,
      content: `### ${emojis.match} Nuevo partido programado\nSe ha programado un nuevo partido para vuestro equipo **${teamBDoc.name}**. El enfrentamiento será contra **${teamADoc.name}** en la jornada ${roundIndex}.\n\nPodéis consultar todos los detalles y la información actualizada del partido en el canal <#${updatedMatch.channelId}>.`
    })

    return updatedMatch
  } catch (error) {
    // Limpieza si hubo error
    if (match?.channelId) {
      try {
        const channel = await client.channels.fetch(match.channelId)
        if (channel) await channel.delete('Error al crear el partido, limpieza de canal')
      } catch (err) {
        console.error('No se pudo eliminar el canal tras error:', err)
      }
    }

    if (match?._id) {
      await Match.findByIdAndDelete(match._id)
    }

    throw error
  }
}

/**
 * Crea un partido manualmente entre dos equipos por nombre, en la última ronda compartida.
 * @param {Object} params
 * @param {string} params.teamAName
 * @param {string} params.teamBName
 * @param {Client} params.client
 */
const createMatchManually = async ({ teamAName, teamBName, client }) => {
  if (teamAName === teamBName) {
    throw new Error('Un equipo no puede jugar contra sí mismo.')
  }

  const teamA = await Team.findOne({ name: teamAName })
  const teamB = await Team.findOne({ name: teamBName })

  if (!teamA) throw new Error(`No se encontró el equipo: ${teamAName}.`)
  if (!teamB) throw new Error(`No se encontró el equipo: ${teamBName}.`)

  const season = await getActiveSeason()
  if (!season) throw new Error('No hay ninguna temporada activa.')

  const activeDivisions = season.divisions.filter(d => d.status === 'active')

  const division = activeDivisions.find(d =>
    d.teams.some(t => t.teamId.equals(teamA._id)) &&
    d.teams.some(t => t.teamId.equals(teamB._id))
  )

  if (!division) {
    throw new Error('Ambos equipos deben estar en la misma división activa.')
  }

  const divisionId = division.divisionId._id
  const divisionDoc = division.divisionId
  const seasonId = season._id

  const roundIndex = getCurrentRoundNumber({ season })

  // Verifica si ya jugaron entre sí esta temporada
  const alreadyPlayed = await Match.exists({
    seasonId,
    divisionId,
    $or: [
      { teamAId: teamA._id, teamBId: teamB._id },
      { teamAId: teamB._id, teamBId: teamA._id }
    ]
  })

  if (alreadyPlayed) {
    throw new Error('Estos equipos ya se enfrentaron esta temporada.')
  }

  const lastMatch = await Match.findOne({}).sort({ matchIndex: -1 })
  const matchIndex = lastMatch ? lastMatch.matchIndex + 1 : 1

  const targetDivision = season.divisions.find(d => d.divisionId.equals(divisionId))
  const lastRound = targetDivision.rounds.at(-1)
  if (!lastRound) throw new Error('No hay rondas en esta división aún.')

  const referenceMatchId = lastRound.matches[0]?.matchId
  if (!referenceMatchId) throw new Error('No hay partidos en la última ronda para copiar sets.')

  const referenceMatch = await Match.findById(referenceMatchId)
  if (!referenceMatch || !referenceMatch.sets) throw new Error('El partido de referencia no tiene sets definidos.')

  const sets = referenceMatch.sets.map(set => ({
    mode: set.mode,
    map: set.map,
    winner: null
  }))

  const previewImageURL = await generateMatchPreviewImageURL({
    divisionDoc,
    roundIndex,
    teamADoc,
    teamBDoc
  })

  let match

  try {
    match = await Match.create({
      matchIndex,
      roundIndex,
      seasonId,
      divisionId,
      teamAId: teamA._id,
      teamBId: teamB._id,
      scoreA: 0,
      scoreB: 0,
      status: 'scheduled',
      sets,
      previewImageURL
    })

    // Agregar a la última ronda de la división
    const targetDivision = season.divisions.find(d => d.divisionId.equals(divisionId))
    const lastRound = targetDivision.rounds.at(-1)
    if (!lastRound) throw new Error('No hay rondas en esta división aún.')

    lastRound.matches.push({ matchId: match._id })
    await season.save()

    const updatedMatch = await createMatchChannel({ match, client })

    await sendTeamAnnouncement({
      client,
      team: teamADoc,
      content: `### ${emojis.match} Nuevo partido programado\nSe ha programado un nuevo partido para vuestro equipo **${teamAName}**. El enfrentamiento será contra **${teamBName}** en la jornada ${roundIndex}.\n\nPodéis consultar todos los detalles y la información actualizada del partido en el canal <#${updatedMatch.channelId}>.`
    })

    await sendTeamAnnouncement({
      client,
      team: teamBDoc,
      content: `### ${emojis.match} Nuevo partido programado\nSe ha programado un nuevo partido para vuestro equipo **${teamBName}**. El enfrentamiento será contra **${teamAName}** en la jornada ${roundIndex + 1}.\n\nPodéis consultar todos los detalles y la información actualizada del partido en el canal <#${updatedMatch.channelId}>.`
    })

    return updatedMatch

  } catch (error) {
    if (match && match?._id) {
      await Match.findByIdAndDelete(match?._id)
    }
    throw new Error(`Error al crear el partido: ${error.message}`)
  }
}

const cancelMatch = async ({
  client,
  matchIndex,
  seasonIndex,
  teamAName,
  teamBName,
  reason = 'Partido cancelado',
  freeWin = null // nombre del equipo ganador
}) => {
  // 🔹 Buscar match
  const match = await findMatch({ matchIndex, seasonIndex, teamAName, teamBName })
  if (!match) throw new Error('Partido no encontrado.')

  // 🔹 Validaciones
  if (match.status === 'played') {
    throw new Error('El partido ya está finalizado y no se puede cancelar.')
  }

  if (freeWin) {
    const validNames = [match.teamAId.name, match.teamBId.name]
    if (!validNames.includes(freeWin)) {
      throw new Error('freeWin debe ser el nombre de uno de los equipos del partido.')
    }
  }

  // 🔹 Cancelar
  match.status = 'cancelled'
  match.reason = reason

  // 🔹 Eliminar canal del partido
  if (match.channelId) {
    const channel = await client.channels.fetch(match.channelId).catch(() => null)
    if (channel) {
      await channel.delete('Partido cancelado, limpieza de canal').catch(() => null)
    }
    match.channelId = null
  }

  // 🔹 FREE WIN (opcional)
  let winner = null
  let loser = null

  if (freeWin) {
    const season = await getActiveSeason()
    if (!season) throw new Error('No hay temporada activa.')

    const division = season.divisions.find(
      d => d.divisionId._id.toString() === match.divisionId._id.toString()
    )
    if (!division) throw new Error('División no encontrada.')

    const teamASeason = division.teams.find(
      t => t.teamId._id.toString() === match.teamAId._id.toString()
    )
    const teamBSeason = division.teams.find(
      t => t.teamId._id.toString() === match.teamBId._id.toString()
    )

    const teamA = await Team.findById(match.teamAId).populate('members.userId')
    const teamB = await Team.findById(match.teamBId).populate('members.userId')
    if (!teamA || !teamB) throw new Error('Error cargando equipos.')

    winner = teamA.name === freeWin ? teamA : teamB
    loser  = teamA.name === freeWin ? teamB : teamA

    // 🏆 puntos administrativos (1 set)
    if (winner._id.toString() === teamA._id.toString()) teamASeason.points += 1
    else teamBSeason.points += 1

    // 📊 stats de equipo
    winner.stats.matchesWon += 1
    loser.stats.matchesLost += 1
    winner.stats.setsWon += 1
    loser.stats.setsLost += 1

    // 👤 stats de usuarios
    const updateMembersStats = async (team, won) => {
      for (const member of team.members) {
        const user = member.userId
        if (!user) continue

        if (won) user.leagueStats.matchesWon += 1
        else user.leagueStats.matchesLost += 1

        user.leagueStats.setsWon += won ? 1 : 0
        user.leagueStats.setsLost += won ? 0 : 1

        await user.save()
      }
    }

    await updateMembersStats(winner, true)
    await updateMembersStats(loser, false)

    await teamA.save()
    await teamB.save()
    await season.save()
  }

  // 🔹 Guardar match
  await match.save()

  // 🔹 Mensajes a AMBOS equipos
  const isFreeWin = Boolean(freeWin)

  const buildMessage = (selfTeam, rivalTeam) => {
    if (!isFreeWin) {
      return `### ❌ Partido cancelado
El partido contra **${rivalTeam.name}** ha sido cancelado.

**Motivo:**
> ${reason}`
    }

    const isWinner = selfTeam.name === freeWin

    return `### ${emojis} ${isWinner ? 'Victoria administrativa (Free Win)' : 'Derrota administrativa'}\n${isWinner ? `Habéis ganado el partido por decision administrativa, ya que vuestro partido contra **${rivalTeam.name}** ha sido cancelado.` : `La victoria administrativa ha sido otorgada a **${freeWin}**.\n\n**Motivo:** ${reason}` }`
  }

  await sendTeamAnnouncement({
    client,
    team: match.teamAId,
    content: buildMessage(match.teamAId, match.teamBId)
  })

  await sendTeamAnnouncement({
    client,
    team: match.teamBId,
    content: buildMessage(match.teamBId, match.teamAId)
  })

  return match
}

const endMatch = async ({ matchIndex, seasonIndex, teamAName, teamBName, client }) => {
  // 🔹 obtener match poblado con sets
  const match = await findMatch({ matchIndex, seasonIndex, teamAName, teamBName })
  if (!match) throw new Error('Partido no encontrado.')
  if (match.status === 'cancelled') throw new Error('El partido está cancelado y no se puede finalizar.')
  if (match.status === 'played') throw new Error('El partido ya está finalizado.')

  match.status = 'played'

  // 🔹 contar sets ganados y star players
  let setsWonA = 0, setsWonB = 0
  const starCounts = new Map() // userId => sets como star player

  for (const set of match.sets) {
    if (!set.winner) continue

    if (set.winner._id.toString() === match.teamAId._id.toString()) setsWonA++
    else if (set.winner._id.toString() === match.teamBId._id.toString()) setsWonB++

    if (set.starPlayerId) {
      const id = set.starPlayerId._id.toString()
      starCounts.set(id, (starCounts.get(id) || 0) + 1)
    }
  }

  match.scoreA = setsWonA
  match.scoreB = setsWonB

  // 🔹 obtener equipos con miembros
  const teamA = await Team.findById(match.teamAId._id).populate("members.userId")
  const teamB = await Team.findById(match.teamBId._id).populate("members.userId")

  // 🔹 actualizar stats de equipo y usuarios
  const updateStats = async (team, wonMatch, setsWon, setsLost) => {
    if (wonMatch) team.stats.matchesWon += 1
    else team.stats.matchesLost += 1
    team.stats.setsWon += setsWon
    team.stats.setsLost += setsLost
    await team.save()

    for (const member of team.members) {
      const user = member.userId
      if (!user) continue
      if (wonMatch) user.leagueStats.matchesWon += 1
      else user.leagueStats.matchesLost += 1

      user.leagueStats.setsWon += setsWon
      user.leagueStats.setsLost += setsLost
      await user.save()
    }
  }

  if (setsWonA > setsWonB) {
    await updateStats(teamA, true, setsWonA, setsWonB)
    await updateStats(teamB, false, setsWonB, setsWonA)
    match.winner = teamA._id
  } else if (setsWonB > setsWonA) {
    await updateStats(teamA, false, setsWonA, setsWonB)
    await updateStats(teamB, true, setsWonB, setsWonA)
    match.winner = teamB._id
  } else {
    await updateStats(teamA, false, setsWonA, setsWonB)
    await updateStats(teamB, false, setsWonB, setsWonA)
  }

  let starPlayerId = null
  let maxCount = 0
  let lastSetIndex = -1

  match.sets.forEach((set, index) => {
    if (!set.starPlayerId) return
    const id = set.starPlayerId._id.toString()
    const count = (starCounts.get(id) || 0)

    // condiciones:
    // 1. más apariciones
    // 2. mismo número, pero apareció en un set más reciente
    if (count > maxCount || (count === maxCount && index > lastSetIndex)) {
      maxCount = count
      starPlayerId = id
      lastSetIndex = index
    }
  })

  if (starPlayerId) {
    const user = await User.findById(starPlayerId)
    if (user) {
      user.leagueStats.matchStarPlayer += 1
      user.leagueStats.setStarPlayer += maxCount
      await user.save()
    }
    match.starPlayerId = starPlayerId
  }

  // 🔹 generar imagen de resultados y guardar
  const resultsImageURL = await generateMatchResultsImageURL({ client, match })
  match.resultsImageURL = resultsImageURL
  await match.save()
  
  const season = await getActiveSeason()
  const division = season.divisions.find(d => d.divisionId._id.toString() === match.divisionId._id.toString())
  const teamASeason = division.teams.find(t => t.teamId._id.toString() === match.teamAId._id.toString())
  const teamBSeason = division.teams.find(t => t.teamId._id.toString() === match.teamBId._id.toString())

  teamASeason.points += setsWonA
  teamBSeason.points += setsWonB

  await season.save()

  // 🔹 enviar mensajes a canales
  const guild = await client.guilds.fetch(guildConfig.id)
  const resultsChannel = await guild.channels.fetch(channels.results.id)
  const matchChannel = match.channelId ? await guild.channels.fetch(match.channelId) : null

  // Canal de resultados
  if (resultsChannel) {
    const embed = getMatchResultsEmbed({ match })
    await resultsChannel.send({ components: [embed], flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] } })
  }

  // Canal del partido
  if (matchChannel) {
    const embed = getMatchResultsEmbed({ match })
    const msg = await matchChannel.send({ components: [embed], flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] } })
    await msg.pin().catch(() => null)
    const infoMsg = await matchChannel.messages.fetch(match.infoMessageId).catch(() => null)
    if (infoMsg) {
      infoMsg.edit({
        components: [await getMatchInfoEmbed({ match })],
        flags: MessageFlags.IsComponentsV2,
        allowedMentions: { parse: [] }
      })
     }
  }          

  // Canal de cada equipo
  for (const teamObj of [teamA, teamB]) {

    if (!teamObj.channelId) {
      continue
    }

    const teamChannel = await guild.channels.fetch(teamObj.channelId).catch(() => null)
    if (!teamChannel) {
      continue
    }

    const embed = getMatchResultsEmbed({ match, team: teamObj })

    await teamChannel.send({
      components: [embed],
      flags: MessageFlags.IsComponentsV2,
      allowedMentions: { parse: [] }
    }).catch(err => {
      console.error(`[endMatch] ❌ Error enviando mensaje al canal de ${teamObj.name}:`, err)
    })
  }

  return match
}

/**
 * cambia la fecha de un partido
 */
const changeMatchScheduledAt = async ({ matchIndex, seasonIndex, teamAName, teamBName, day, hour, minute, client }) => {
  const match = await findMatch({ matchIndex, seasonIndex, teamAName, teamBName })
  if (!match) throw new Error('Partido no encontrado')

  if (match.status === 'cancelled') throw new Error('El partido está cancelado y no se puede reprogramar.')
  if (match.status === 'played') throw new Error('El partido ya está finalizado y no se puede reprogramar.')

  match.scheduledAt = getDate({ day, hour, minute })
  await match.save()

  const scheduledTimestamp = Math.floor(match.scheduledAt.getTime() / 1000)
  const teams = [match.teamAId, match.teamBId].filter(Boolean)

  const channel = await client.channels.fetch(match.channelId).catch(() => null)
  if (channel && channel.isTextBased && channel.isTextBased()) {
    const infoMessage = await channel.messages.fetch(match.infoMessageId).catch(() => null)
    if (infoMessage) {
      try {
        await infoMessage.edit({
          components: [await getMatchInfoEmbed({ match, showButtons: true })],
          flags: MessageFlags.IsComponentsV2,
          allowedMentions: { parse: [] }
        })
      } catch (err) {
        console.error('Error editando mensaje infoMessageId tras cambio de fecha:', err)
      }
    }
  }

  // Enviar anuncio a cada equipo
  for (const team of teams) {
    await sendTeamAnnouncement({
      client,
      team,
      content: `### ${emojis.schedule} Partido reprogramado\n` +
               `Vuestro partido contra el equipo **${team._id.equals(match.teamAId._id) ? match.teamBId.name : match.teamAId.name}** ha sido reprogramado.\n**Nueva fecha:** <t:${scheduledTimestamp}:F>.`
    })
  }

  return match
}

const applyDefaultDates = async ({ client }) => {
  const now = new Date()

  // Solo partidos sin scheduledAt y que no estén jugados/cancelados/ongoing
  const matches = await Match.find({
    $and: [
      {
        $or: [
          { scheduledAt: { $exists: false } },
          { scheduledAt: null }
        ]
      },
      { status: { $nin: ['played', 'cancelled', 'ongoing'] } }
    ]
  }).populate('teamAId teamBId divisionId seasonId')

  for (const match of matches) {
    try {
      const { passed, deadline, defaultDate } = checkDeadline(match, now)

      // Si no ha pasado el plazo, saltamos
      if (!passed || !defaultDate) continue

      // Aplicar fecha por defecto y guardar
      match.scheduledAt = defaultDate
      await match.save()

      const scheduledTimestamp = Math.floor(match.scheduledAt.getTime() / 1000)
      const deadlineTimestamp = deadline ? Math.floor(new Date(deadline).getTime() / 1000) : null

      // Obtener canal (cache o fetch)
      let matchChannel = null
      if (match.channelId) {
        matchChannel = client.channels.cache.get(match.channelId) || await client.channels.fetch(match.channelId).catch(() => null)
      }

      // 1) Mensaje principal en canal del partido (SIN PING)
      if (matchChannel && matchChannel.isTextBased && matchChannel.isTextBased()) {
      const content =
        `### ${emojis.schedule || '📅'} Fecha asignada automáticamente\n\n` +
        `El plazo para proponer horario ha finalizado (<t:${deadlineTimestamp}>), por lo que el partido ha sido programado automáticamente.\n\n` +
        `**Fecha asignada:** <t:${scheduledTimestamp}> (<t:${scheduledTimestamp}:R>)`

        try {
          await matchChannel.send({
            content,
            allowedMentions: { parse: [] } // SIN pings
          })
        } catch (err) {
          console.error(`[applyDefaultDates] fallo enviando mensaje principal para match ${match._id}:`, err)
        }

        // 1.b) En lugar de enviar el embed/info, EDITAR mensaje match.infoMessageId
        try {
          const embedComponent = await getMatchInfoEmbed({ match, showButtons: false })
          let infoMsg;
          try {
            infoMsg = await matchChannel.messages.fetch(match.infoMessageId);
          } catch (error) {
            console.error(`[applyDefaultDates] error fetch infoMessageId ${match.infoMessageId} para match ${match._id}:`, error);
          }

          if (infoMsg && infoMsg.edit) { // <-- verificamos que edit exista
            try {
              await infoMsg.edit({
                components: [embedComponent],
                flags: MessageFlags.IsComponentsV2,
                allowedMentions: { parse: [] }
              });
            } catch (err) {
              console.error(`[applyDefaultDates] error editando infoMessageId ${match.infoMessageId} para match ${match._id}:`, err);
            }
          }
        } catch (err) {
          console.error(`[applyDefaultDates] error preparando/actualizando embed para match ${match._id}:`, err)
        }
      }

      // 2) Notificar a cada equipo (sin cambios: seguimos usando sendTeamAnnouncement)
      const teams = [match.teamAId, match.teamBId].filter(Boolean)
      for (const team of teams) {
        try {
          const isTeamA = match.teamAId && match.teamAId._id
            ? team._id.equals(match.teamAId._id)
            : team._id.toString() === (match.teamAId ? match.teamAId.toString() : '')

          const rivalName = isTeamA ? (match.teamBId && match.teamBId.name ? match.teamBId.name : 'Rival') : (match.teamAId && match.teamAId.name ? match.teamAId.name : 'Rival')

          const content =
            `### ${emojis.schedule || '📅'} Fecha asignada automáticamente\n\n` +
            `El plazo para proponer horario ha finalizado (<t:${deadlineTimestamp}>), por lo que vuestro partido contra **${rivalName}** ha sido programado automáticamente.\n\n` +
            `**Fecha asignada:** <t:${scheduledTimestamp}> (<t:${scheduledTimestamp}:R>)\n\n` +
            `Revisad el canal ${emojis.channel || '🔗'} <#${match.channelId}> para más detalles y confirmad vuestra disponibilidad.`;

          await sendTeamAnnouncement({
            client,
            team,
            content
          })
        } catch (err) {
          console.error(`[applyDefaultDates] fallo notificando equipo ${team._id} del match ${match._id}:`, err)
        }
      }

    } catch (err) {
      console.error(`[applyDefaultDates] error procesando match ${match._id}:`, err)
    }
  }
}
  
async function processScheduledMatches({ client }) {
  const now = new Date()

  const matches = await Match.find({
    status: 'scheduled',
    scheduledAt: { $lte: now }
  }).populate('teamAId teamBId')

  for (const match of matches) {
    if (!match.channelId) continue
    const channel = await client.channels.fetch(match.channelId).catch(() => null)
    if (!channel) continue

    await channel.send({
      content: `<@&${roles.ping.id}> ¡Es hora de jugar vuestro partido!`,
    })
    const onGoingMsg = await channel.send({
      components: [await getOnGoingMatchEmbed({ match })],
      flags: MessageFlags.IsComponentsV2,
      allowedMentions: { parse: [] }
    })

    await onGoingMsg.pin().catch(() => null)
    match.onGoingMessageId = onGoingMsg.id
    match.status = 'onGoing'
    await match.save()

    const infoMessage = await channel.messages.fetch(match.infoMessageId).catch(() => null)
    if (infoMessage) {
      infoMessage.edit({
        components: [await getMatchInfoEmbed({ match, showButtons: false })],
        flags: MessageFlags.IsComponentsV2,
        allowedMentions: { parse: [] }
      }).catch(() => null)
    }
  }
}

async function monitorOnGoingMatches({ client }) {

  let matches;
  try {
    matches = await Match.find({ status: 'onGoing' })
      .populate({
        path: 'teamAId',
        populate: { path: 'members.userId' }
      })
      .populate({
        path: 'teamBId',
        populate: { path: 'members.userId' }
      })
      .populate('seasonId divisionId starPlayerId')
      .populate({
        path: 'sets.winner',
        model: 'Team'
      })
      .populate({
        path: 'sets.starPlayerId',
        model: 'User'
      })
  } catch {
    return;
  }

  for (let match of matches) {
    try {
      const teamAMembers = match.teamAId?.members?.map(m => m.userId).filter(Boolean) || [];
      const teamBMembers = match.teamBId?.members?.map(m => m.userId).filter(Boolean) || [];

      const cleanTag = tag => tag?.replace(/^#/, '').toUpperCase();
      const teamABrawlIds = teamAMembers.map(u => cleanTag(u.brawlId)).filter(Boolean);
      const teamBBrawlIds = teamBMembers.map(u => cleanTag(u.brawlId)).filter(Boolean);
      const allPlayerIds = [...new Set([...teamABrawlIds, ...teamBBrawlIds])];

      if (!allPlayerIds.length) {
        continue;
      }

      const battleLogResults = await Promise.allSettled(
        allPlayerIds.map(brawlId =>
          fetch(`https://api.brawlstars.com/v1/players/%23${encodeURIComponent(brawlId)}/battlelog`, {
            headers: { Authorization: `Bearer ${BRAWL_STARS_API_KEY}` }
          })
            .then(r => (r.ok ? r.json() : null))
            .catch(e => {
              return null;
            })
        )
      );

      const fulfilled = battleLogResults.filter(r => r.status === 'fulfilled' && r.value);

      const battleLogs = fulfilled.flatMap(r => r.value.items || []);
      if (!battleLogs.length) {
        continue;
      }

      let updated = false;

      for (const battle of battleLogs) {
        const battleTime = new Date(battle.battleTime);

        if (!battle.battle?.starPlayer) {
          continue;
        }

        const battleTeams = (battle.battle.teams || []).flat();
        const battleTags = battleTeams.map(p => cleanTag(p.tag));

        const teamACount = teamABrawlIds.filter(tag => battleTags.includes(tag)).length;
        const teamBCount = teamBBrawlIds.filter(tag => battleTags.includes(tag)).length;

        if (teamACount < 2 || teamBCount < 2) {
          continue;
        }


        const normalize = str => str?.toLowerCase().trim();
        const possibleSets = match.sets.filter(s =>
          normalize(s.map) === normalize(battle.event.map) &&
          normalize(s.mode) === normalize(battle.event.mode) &&
          !s.winner
        );

        if (!possibleSets.length) continue;

        const targetSet = possibleSets[0];
        let winner = null;

        const validBattleTags = battleTeams.flat().map(p => cleanTag(p.tag))
          .filter(tag => teamABrawlIds.includes(tag) || teamBBrawlIds.includes(tag))

        if (battle.battle.result === 'victory') {
          winner = validBattleTags.some(tag => teamABrawlIds.includes(tag))
            ? match.teamAId._id
            : match.teamBId._id
        } else if (battle.battle.result === 'defeat') {
          winner = validBattleTags.some(tag => teamABrawlIds.includes(tag))
            ? match.teamBId._id
            : match.teamAId._id
        }

        if (!winner) {
          continue
        }

        const spTag = cleanTag(battle.battle.starPlayer.tag);
        const starUser = [...teamAMembers, ...teamBMembers].find(u => cleanTag(u.brawlId) === spTag);
        const starPlayerId = starUser ? starUser._id : null;

        targetSet.winner = winner;
        targetSet.starPlayerId = starPlayerId;
        updated = true;
      }

      if (updated) {
        await match.save()
        match = await Match.findById(match._id)
        .populate({
          path: 'teamAId',
          populate: { path: 'members.userId' }
        })
        .populate({
          path: 'teamBId',
          populate: { path: 'members.userId' }
        })
        .populate('seasonId divisionId starPlayerId')
        .populate({
          path: 'sets.winner',
          model: 'Team'
        })
        .populate({
          path: 'sets.starPlayerId',
          model: 'User'
        })

        const teamAWins = match.sets.filter(s => s.winner && s.winner.equals(match.teamAId._id)).length;
        const teamBWins = match.sets.filter(s => s.winner && s.winner.equals(match.teamBId._id)).length;

        const totalSets = match.sets.length;
        const setsToWin = Math.floor(totalSets / 2) + 1;

        const matchHasWinner = teamAWins >= setsToWin || teamBWins >= setsToWin;

        if (match.onGoingMessageId && match.channelId) {
          try {
            const channel = await client.channels.fetch(match.channelId);
            if (channel?.isTextBased()) {
              const message = await channel.messages.fetch(match.onGoingMessageId).catch(() => null);
              if (message) {
                const embed = await getOnGoingMatchEmbed({ match });
                await message.edit({
                  components: [embed],
                  flags: MessageFlags.IsComponentsV2,
                  allowedMentions: { parse: [] }
                });
                if (matchHasWinner) {
                  await endMatch({ matchIndex: match.matchIndex, client });
                  continue;
                }
                const setsPlayed = match.sets.filter(s => s.winner).length;
                const totalSets = match.sets.length;
                await message.reply({
                  content: `### ${emojis.accept} Set ${setsPlayed}/${totalSets} registrado.\n${emojis.winner} **${match.sets[setsPlayed - 1].winner.equals(match.teamAId._id) ? match.teamAId.name : match.teamBId.name}**\n${emojis.starPlayer} ${match.sets[setsPlayed - 1].starPlayerId ? `<@${match.sets[setsPlayed - 1].starPlayerId.discordId}>` : 'N/A'}`,
                  allowedMentions: { parse: [] }
                })
              }
            }
          } catch (err) {
            throw new Error('Error monitoreando partidos.')
          }
        }
      }

    } catch (err) {
      throw new Error('Error monitoreando partidos.')
    }
  }
}

module.exports = {
  updatePermissionsForMatch,
  createMatchChannel,
  createMatch,
  createMatchManually,
  cancelMatch,
  endMatch,
  changeMatchScheduledAt,
  applyDefaultDates,
  processScheduledMatches,
  monitorOnGoingMatches
}
