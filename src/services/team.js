const { PermissionsBitField, ChannelType } = require('discord.js')

const Season = require('../models/Season.js')
const Division = require('../models/Division.js')
const Match = require('../models/Match.js')
const Team = require('../models/Team.js')
const User = require('../models/User.js')

const { updatePermissionsForMatch, cancelMatch } = require('./match.js')

const { getActiveSeason } = require('../utils/season.js')
const { findTeam } = require('../utils/team.js')

const { sendTeamAnnouncement } = require('../discord/send/team.js')
const { getTeamChannelCreatedEmbed } = require('../discord/embeds/team.js')

const colors = require('../config/colors.json')
const config = require('../config/league.js')
const maxMembers = config.team.maxMembers
const emojis = require('../config/emojis.json')

const checkTeamEligibility = (team) => {
  return team.members.length >= 3 || (team.divisionId !== null && team.divisionId !== undefined)
}

const applyTeamPermissions = async (guild, channel, team) => {
  const leaderIds = team.members.filter(m => m.role === 'leader').map(m => m.userId?.discordId).filter(Boolean)
  const subLeaderIds = team.members.filter(m => m.role === 'sub-leader').map(m => m.userId?.discordId).filter(Boolean)
  const memberIds = team.members.filter(m => m.role === 'member').map(m => m.userId?.discordId).filter(Boolean)

  const fetchMember = async id => { try { return await guild.members.fetch(id) } catch { return null } }
  const leaderMembers = (await Promise.all([...leaderIds].map(fetchMember))).filter(Boolean)
  const subLeaderMembers = (await Promise.all([...subLeaderIds].map(fetchMember))).filter(Boolean)
  const normalMembers = (await Promise.all(memberIds.map(fetchMember))).filter(Boolean)

  const fetchRole = async id => { try { return await guild.roles.fetch(id) } catch { return null } }
  const staffRolesResolved = (await Promise.all((config.roles.staff || []).map(fetchRole))).filter(Boolean)

  const parsePerms = names => names.map(name => PermissionsBitField.Flags[name])
  const memberPermissions = parsePerms(config.channels.permissions.member)
  const leaderPermissions = [...memberPermissions, ...parsePerms(config.channels.permissions.leader)]
  const subLeaderPermissions = [...memberPermissions, ...parsePerms(config.channels.permissions.subLeader || [])]
  const staffPermissions = [...memberPermissions, ...parsePerms(config.channels.permissions.staff)]

  const permissionOverwrites = [
    { id: guild.roles.everyone.id, deny: [PermissionsBitField.Flags.ViewChannel] },
    ...leaderMembers.map(m => ({ id: m.id, allow: leaderPermissions })),
    ...subLeaderMembers.map(m => ({ id: m.id, allow: subLeaderPermissions })),
    ...normalMembers.map(m => ({ id: m.id, allow: memberPermissions })),
    ...staffRolesResolved.map(r => ({ id: r.id, allow: staffPermissions }))
  ]

  await channel.permissionOverwrites.set(permissionOverwrites)
}

const createTeamChannel = async ({ client, team, categoryId }) => {
  const guild = await client.guilds.fetch(config.guild.id)
  if (!team.members || !team.members.length || !team.members[0].userId?.discordId) {
    await team.populate('members.userId')
  }

  const expectedName = `${config.team.channels.prefix}${team.name.toLowerCase()}`
  let channel = null

  if (team.channelId) {
    channel = await guild.channels.fetch(team.channelId).catch(() => null)
  }

  if (!channel) {
    channel = guild.channels.cache.find(c => c.name === expectedName && c.parentId === categoryId) || null
  }

  if (channel) {
    if (channel.name !== expectedName) await channel.setName(expectedName)
    if (categoryId && channel.parentId !== categoryId) await channel.setParent(categoryId)
    await applyTeamPermissions(guild, channel, team)
    if (team.channelId !== channel.id) {
      team.channelId = channel.id
      await team.save()
    }
    return channel
  }

  // crear canal nuevo
  channel = await guild.channels.create({
    name: expectedName,
    type: ChannelType.GuildText,
    parent: categoryId
  })
  await applyTeamPermissions(guild, channel, team)
  await channel.send({ content: `<@&${config.roles.ping.id}>`, embeds: [getTeamChannelCreatedEmbed({ team })] })

  team.channelId = channel.id
  await team.save()
  return channel
}

const checkTeamUserHasPerms = async ({ discordId }) => {
  const team = await findTeam({ discordId })

  const member = team.members.find(m => m.userId.discordId === discordId)
  if (!member) return false

  return (member.role === 'leader' || member.role === 'sub-leader')
}

const checkTeamUserIsLeader = async ({ discordId }) => {
  const team = await findTeam({ discordId })

  const member = team.members.find(m => m.userId.discordId === discordId)
  if (!member) return false

  return (member.role === 'leader')
}

const updateTeamsChannels = async ({ client }) => {
  const guild = await client.guilds.fetch(config.guild.id)
  const divisions = await Division.find({})
  const divisionMap = Object.fromEntries(divisions.map(d => [d._id.toString(), d.teamsCategoryId]))

  const teams = await Team.find({}).populate('members.userId')

  for (const team of teams) {
    const eligible = checkTeamEligibility(team)

    if (!eligible && team.channelId) {
      try {
        const ch = await guild.channels.fetch(team.channelId).catch(() => null)
        if (ch) await ch.delete('Equipo no elegible - limpieza de canal')
      } catch (err) { console.error('Error eliminando canal no elegible:', err) }
      team.channelId = null
      await team.save()
      continue
    }
    if (!eligible) continue

  if (team.channelId) {
    const ch = await guild.channels.fetch(team.channelId).catch(() => null)
    if (ch) {

      if (ch.name !== `${config.team.channels.prefix}${team.name.toLowerCase().replace(/ /g, '-')}`) {
        await ch.setName(`${config.team.channels.prefix}${team.name}`).catch(console.error)
      }
      // Obtener categoría correcta según división
      const categoryId = team.divisionId
        ? divisionMap[team.divisionId.toString()]
        : config.categories.teams.withOutDivision.id

      // Mover el canal si no está en la categoría correcta
      if (ch.parentId !== categoryId) {
        await ch.setParent(categoryId, { lockPermissions: false }).catch(err => console.error('Error moviendo canal:', err))
      }

      // Aplicar permisos
      await applyTeamPermissions(guild, ch, team)
    }
  } else {
    // Crear canal si no existe
    const categoryId = team.divisionId
      ? divisionMap[team.divisionId.toString()]
      : config.categories.teams.withOutDivision.id

    await createTeamChannel({ client, team, categoryId })
  }
  }
}

/**
 * Genera un codigo random y unico
 */
const generateTeamCode = async () => {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

  let code
  let exist = true

  while (exist) {
    code = ''
    for (let i = 0; i < 8; i++) {
      code += characters.charAt(Math.floor(Math.random() * characters.length))
    }

    // Buscar si ya existe en la colección Team
    const team = await Team.findOne({ code })
    exist = !!team
  }

  return code
}

/**
 * Cambia el codigo de un equipo por uno random
 */
const updateTeamCode = async ({ teamName = null, teamCode = null, discordId = null }) => {
  const team = await findTeam({ teamName, teamCode, discordId })

  team.code = await generateTeamCode()

  await team.save()
  return team
}

/**
 * Crea un nuevo equipo con un único miembro (presidente).
 * @param {Object} params
 * @param {String} params.name - Nombre del equipo.
 * @param {String} params.iconURL - URL del ícono del equipo.
 * @param {String} params.color - Label del color (ej: "Rojo oscuro").
 * @param {String} params.presidentDiscordId - ID de Discord del presidente.
 * @returns {Object} equipo creado.
 */
const createTeam = async ({ name, iconURL, presidentDiscordId, color = 'Blue' }) => {

  if (!name || !iconURL) {
    throw new Error('Faltan datos: name o iconURL.')
  }
  
  const user = await User.findOne({ discordId: presidentDiscordId })
  if (!user) throw new Error('El usuario no esta verificado.')
  if (user.teamId) {
    throw new Error('El usuario ya se encuentra en un equipo.')
  }

  const searchedTeam = await Team.findOne({ name })
  if (searchedTeam) {
    throw new Error('Ya existe un equipo con ese nombre.')
  }

  const team = new Team({
    name,
    iconURL,
    color,
    code: await generateTeamCode(),
    members: [{ userId: user._id, role: 'leader' }],
    isEligible: false
  })

  user.teamId = team._id
  user.isFreeAgent = false
  await user.save()
  await team.save()
  await team.populate('members.userId')
  return team
}

/**
 * Actualiza los datos de un equipo.
 * @param {Object} params
 * @param {String} params.oldName - Nombre actual.
 * @param {String} [params.newName] - Nuevo nombre.
 * @param {String} [params.iconURL] - Nuevo icono.
 * @param {String} [params.color] - Nuevo label del color.
 * @returns {Object} equipo actualizado.
 */
const updateTeam = async ({ teamName = null, teamCode = null, discordId = null, name, iconURL, color }) => {
  const team = await findTeam({ teamName, teamCode, discordId })

  const searchedTeam = await Team.findOne({ name })
  if (searchedTeam) {
    throw new Error('Ya existe un equipo con ese nombre.')
  }

  if (name) team.name = name
  if (iconURL) team.iconURL = iconURL
  if (color) {
    // Elimina un emoji al principio seguido de espacios (si lo hay)
    const normalizedColor = color.replace(/^\p{Extended_Pictographic}\s*/u, '').trim()

    const colorObj = colors.find(c => c.value === normalizedColor)
    if (!colorObj) throw new Error('Color no válido.')

    team.color = colorObj.value // <--- usar el value, no el label
  }

  await team.save()
  return team
}

/**
 * Añade un equipo a una división, validando límite máximo.
 * Mantiene los puntos previos en la temporada activa.
 * @param {Object} params
 * @param {String} [params.teamName] - Nombre del equipo a añadir.
 * @param {String} [params.teamCode] - Código del equipo.
 * @param {String} [params.discordId] - DiscordId de algún miembro del equipo.
 * @param {String} params.divisionName - Nombre de la división destino.
 * @param {Number} params.maxTeams - Máximo de equipos permitidos por división.
 * @returns {Object} team actualizado.
 */
const addTeamToDivision = async ({ client, teamName = null, teamCode = null, discordId = null, divisionName, maxTeams }) => {
  // 🔹 Buscar división destino
  const division = await Division.findOne({ name: divisionName })
  if (!division) throw new Error('División no encontrada')

  // 🔹 Buscar equipo
  const team = await findTeam({ teamName, teamCode, discordId })
  if (!team) throw new Error('Equipo no encontrado')

  // 🔹 Si ya estaba en esta división, lanzar error
  if (team.divisionId?.toString() === division._id.toString()) {
    throw new Error('El equipo ya está en esta división')
  }

  // 🔹 Validar límite de equipos en la división
  const teamCount = await Team.countDocuments({ divisionId: division._id })
  if (teamCount >= maxTeams) {
    throw new Error('La división ya tiene el número máximo de equipos')
  }

  // 🔹 Manejar temporada activa
  let previousPoints = 0
  const activeSeason = await Season.findOne({ status: 'active' })
  if (activeSeason) {
    const currentDivision = activeSeason.divisions.find(d =>
      d.teams.some(t => t.teamId.toString() === team._id.toString())
    )
    if (currentDivision) {
      const existingTeam = currentDivision.teams.find(t => t.teamId.toString() === team._id.toString())
      previousPoints = existingTeam?.points || 0
      currentDivision.teams = currentDivision.teams.filter(t => t.teamId.toString() !== team._id.toString())
      await activeSeason.save()
    }
  }

  // 🔹 Actualizar división del equipo
  team.divisionId = division._id
  await team.save()
  await team.populate('divisionId')

  // 🔹 Añadir a la nueva división en la temporada activa
  if (activeSeason) {
    const seasonDivision = activeSeason.divisions.find(d =>
      d.divisionId.toString() === division._id.toString()
    )
    if (seasonDivision) {
      seasonDivision.teams.push({
        teamId: team._id,
        points: previousPoints
      })
      await activeSeason.save()
    }
  }

  // 🔹 Notificación al equipo
  await sendTeamAnnouncement({
    client,
    team,
    content: `### ${emojis.division} Nueva división\n` +
             `Vuestro equipo, **${team.name}**, ha sido añadido a la división **${division.name}**.`
  })

  return team
}

const removeTeamFromDivision = async ({ client, teamName = null, teamCode = null, discordId = null }) => {
  const team = await findTeam({ teamName, teamCode, discordId })
  if (!team.divisionId) {
    throw new Error('El equipo no pertenece a ninguna división')
  }

  const divisionId = team.divisionId
  const division = await Division.findById(divisionId)

  // 🔹 Actualizar Team
  team.divisionId = null
  await team.save()

  // 🔹 Si hay temporada activa, sincronizar
  const activeSeason = await Season.findOne({ status: 'active' })
  if (activeSeason) {
    const seasonDivision = activeSeason.divisions.find(d =>
        (d.divisionId?._id.toString() || d.divisionId) === (divisionId?._id.toString() || divisionId)
      )
    if (seasonDivision) {
      seasonDivision.teams = seasonDivision.teams.filter(
        t => t.teamId.toString() !== team._id.toString()
      )
      await activeSeason.save()
    }
  }

  // 🔹 Notificación al equipo
  await sendTeamAnnouncement({
    client,
    team,
    content: `### ${emojis.expelled} Eliminación de división\n` +
             `Vuestro equipo, **${team.name}**, ha sido eliminado de la división **${division?.name || 'desconocida'}**.`
  })

  return team
}

/**
 * Añade un miembro al equipo usando su Discord ID.
 * @param {Object} params
 * @param {String} params.discordId - ID de Discord del usuario.
 * @returns {Object} equipo actualizado.
 */
const addMemberToTeam = async ({ client, teamName = null, teamCode = null, discordId }) => {
  if (!discordId) {
    throw new Error('Faltan datos: discordId.')
  }

  const user = await User.findOne({ discordId })
  if (user && user.teamId) throw new Error('El usuario ya se encuentra en un equipo.')
  
  const team = await findTeam({ teamName, teamCode, discordId })

  if (team.members.length >= maxMembers) {
    throw new Error(`El equipo ya tiene el maximo de miembros: \`${maxMembers}\``)
  }

  team.members.push({
    userId: user._id,
    role: 'member'
  })
  await team.save()

  user.team = team._id
  user.isFreeAgent = false

  await user.save()

  if (checkTeamEligibility(team) && !team.channelId) {
    let categoryId
    
    if (team.divisionId) {
      const division = await Division.findById(team.divisionId);
      categoryId = division?.teamsCategoryId || config.categories.teams.withOutDivision.id;
    } else {
      categoryId = config.categories.teams.withOutDivision.id;
    }

    await createTeamChannel({ client, team, categoryId });
  }

  if (team.channelId) {
    const guild = await client.guilds.fetch(config.guild.id);
    const channel = await guild.channels.fetch(team.channelId).catch(() => null);
    if (channel) {
      await applyTeamPermissions(guild, channel, team);
    }
  }
  
  const matches = await Match.find({
    $or: [{ teamAId: team._id }, { teamBId: team._id }],
    channelId: { $exists: true, $ne: null }
  })

  for (const match of matches) {
    await updatePermissionsForMatch({ client, match });
  }

  return team
}

const removeMemberFromTeam = async ({ teamName = null, teamCode = null, discordId, client }) => {
  const team = await findTeam({ teamName, teamCode, discordId })
  if (!team) throw new Error('Equipo no encontrado.')

  const user = await User.findOne({ discordId })
  if (!user) throw new Error('Usuario no encontrado.')

  const memberToRemove = team.members.find(m => m.userId?.discordId === discordId)
  if (!memberToRemove) throw new Error('El usuario no está en el equipo.')

  // 1️⃣ Transferir rol si el que se va es líder
  if (memberToRemove.role === 'leader') {
    const subLeaders = team.members.filter(m => m.role === 'sub-leader' && m.userId?.discordId !== discordId)
    const otherMembers = team.members.filter(m => m.userId?.discordId !== discordId)

    let newLeader
    if (subLeaders.length > 0) {
      newLeader = subLeaders[Math.floor(Math.random() * subLeaders.length)]
      newLeader.role = 'leader'
    } else if (otherMembers.length > 0) {
      newLeader = otherMembers[Math.floor(Math.random() * otherMembers.length)]
      newLeader.role = 'leader'
    }
  }

  // 2️⃣ Quitar al usuario del equipo
  team.members = team.members.filter(m => m.userId?.discordId !== discordId)
  user.teamId = null
  await user.save()

  const originalTeamName = team.name

  // 3️⃣ Si no quedan miembros, cancelar partidos y limpiar referencias
  if (team.members.length === 0) {
    const teamId = team._id

    const matches = await Match.find({
      $or: [{ teamAId: teamId }, { teamBId: teamId }],
      status: 'scheduled'
    }).populate('teamAId teamBId')

    for (const match of matches) {
      await cancelMatch({
        client,
        matchIndex: match.matchIndex,
        seasonIndex: match.seasonIndex,
        teamAName: match.teamAId?.name,
        teamBName: match.teamBId?.name,
        reason: `El equipo **${originalTeamName}** se ha eliminado.`
      })
    }

    const activeSeason = await Season.findOne({ status: 'active' })
    if (activeSeason) {
      for (const division of activeSeason.divisions) {
        division.teams = division.teams.filter(t => !t.teamId.equals(teamId))
      }
      await activeSeason.save()
    }

    if (team.channelId) {
      const channel = await client.channels.fetch(team.channelId).catch(() => null)
      if (channel) await channel.delete('Equipo eliminado').catch(() => null)
    }

    team.name = `Equipo Eliminado #${team._id.toString().slice(-5)}`
    team.divisionId = null
    team.code = null
    team.channelId = null
    team.isDeleted = true
  }

  await team.save()

  if (team.channelId && !team.isDeleted) {
    const guild = await client.guilds.fetch(config.guild.id)
    const channel = await guild.channels.fetch(team.channelId).catch(() => null)
    if (channel) {
      await applyTeamPermissions(guild, channel, team)
    }
  }
  
  const matches = await Match.find({
    $or: [{ teamAId: team._id }, { teamBId: team._id }],
    channelId: { $exists: true, $ne: null }
  })

  for (const match of matches) {
    await updatePermissionsForMatch({ client, match });
  }
  return team
}

const changeMemberRole = async ({ teamName = null, teamCode = null, discordId, newRole, client }) => {
  if (!discordId || !newRole) {
    throw new Error('Faltan datos: discordId o newRole.')
  }

  const team = await findTeam({ teamName, teamCode, discordId })
  if (!team) throw new Error('Equipo no encontrado.')

  const member = team.members.find(m => m.userId?.discordId === discordId)
  if (!member) throw new Error('Miembro no encontrado.')

  const isCurrentLeader = member.role === 'leader'

  // :x: No se puede quitar el rol de líder directamente
  if (isCurrentLeader && newRole !== 'leader') {
    throw new Error('No se puede quitar el rol de líder. Asigna primero a otro miembro como líder.')
  }

  if (newRole === 'leader') {
    if (isCurrentLeader) {
      throw new Error('Este miembro ya es líder.')
    }

    // Buscar al líder actual
    const currentLeader = team.members.find(m => m.role === 'leader')
    if (currentLeader) {
      currentLeader.role = 'sub-leader'
    }

    // Promocionar a este miembro como líder
    member.role = 'leader'
  } else {
    // Cambiar a cualquier otro rol (member o sub-leader)
    member.role = newRole
  }

  await team.save()

  const matches = await Match.find({
    $or: [{ teamAId: team._id }, { teamBId: team._id }],
    channelId: { $exists: true, $ne: null }
  })

  for (const match of matches) {
    await updatePermissionsForMatch({ client, match });
  }

  return team
}

const addPointsToTeam = async ({ teamName, points }) => {
  const season = await getActiveSeason()
  let finded = false
  for (const division of season.divisions) {
    for (const team of division.teams) {
      if (team.teamId.name === teamName) {
        finded = true
        team.points += parseInt(points)
      }
    }
  }
  if (!finded) {
    throw new Error('No se ha encontrado el equipo.')
  }
  await season.save()
  return season
}

const removePointsFromTeam = async ({ teamName, points }) => {
  const season = await getActiveSeason()
  let finded = false
  for (const division of season.divisions) {
    for (const team of division.teams) {
      if (team.teamId.name === teamName) {
        finded = true
        team.points -= parseInt(points)
      }
    }
  }
  if (!finded) {
    throw new Error('No se ha encontrado el equipo.')
  }
  await season.save()
  return season
}

module.exports = {
  checkTeamUserHasPerms,
  checkTeamUserIsLeader,
  updateTeamsChannels,
  generateTeamCode,
  updateTeamCode,
  createTeam,
  updateTeam,
  addTeamToDivision,
  removeTeamFromDivision,
  addMemberToTeam,
  removeMemberFromTeam,
  changeMemberRole,
  addPointsToTeam,
  removePointsFromTeam
}
