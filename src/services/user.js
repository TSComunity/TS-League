const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js')
const Team = require('../models/Team.js')
const User = require('../models/User.js')

const { sendLog } = require('../discord/send/staff.js')
const { getUserBrawlData } = require('../utils/user.js')
const { getUserStatsEmbed } = require('../discord/embeds/user.js')
const { roles, guild: configGuild, channels } = require('../config/league.js')

const checkUserIsVerified = async ({ discordId }) => {
  const user = await User.findOne({ discordId })
  if (!user) return false

  const isVerified = !!user.brawlId

  // actualizar el flag global
  user.isVerified = isVerified
  await user.save()

  return isVerified
}

const verifyUser = async ({ discordId, brawlId, client }) => {
  if (!discordId || !brawlId)
    throw new Error('Faltan datos: discordId o brawlId')

  const formattedBrawlId = brawlId.startsWith('#')
    ? brawlId.toUpperCase()
    : `#${brawlId.toUpperCase()}`

  const res = await getUserBrawlData({ brawlId: formattedBrawlId })

  if (!res)
    throw new Error(`No existe ninguna cuenta con el ID \`${formattedBrawlId}\` como ID en brawl.`)

  let user = await User.findOne({ discordId })

  if (!user)
    user = await User.create({ discordId, brawlId: formattedBrawlId, isVerified: true })
  else {
    user.brawlId = formattedBrawlId
    user.isVerified = true
    await user.save()
  }

  await sendLog({
    content: `El usuario se ha verificado con el tag **${formattedBrawlId}**.`,
    client,
    type: 'success',
    userId: discordId,
    eventType: 'team'
  })

  return user
}


const addPingRoleToUser = async ({ client, discordId }) => {
    if (!client || !discordId) {
        throw new Error('Faltan datos: client o discordId.')
    }

    try {
        // Obtener la Guild usando el ID de tu archivo de configuración
        const guildInstance = await client.guilds.fetch(configGuild.id)

        if (!guildInstance) {
            throw new Error(`No se encontró el servidor con el ID ${configGuild.id}.`)
        }

        // Obtener el rol de ping usando el ID de tu archivo de configuración
        const pingRole = guildInstance.roles.cache.get(roles.ping.id)

        if (!pingRole) {
            throw new Error(`No se encontró un rol con el ID ${roles.ping.id} en el servidor ${guildInstance.name}.`)
        }

        const member = await guildInstance.members.fetch(discordId)

        if (!member) {
            throw new Error(`No se encontró al miembro con el ID ${discordId} en el servidor ${guildInstance.name}.`)
        }

        // Verificar si el miembro ya tiene el rol
        if (member.roles.cache.has(pingRole.id)) {
            return member // Ya lo tiene, no hacemos nada más
        }

        // Añadir el rol
        const updatedMember = await member.roles.add(pingRole)
        return updatedMember

    } catch (error) {
        // Propagar el error con un mensaje más descriptivo si es necesario
        throw new Error(`Error al añadir el rol al miembro con ID ${discordId}: ${error.message}`)
    }
}

/**
 * Verifica y añade el rol de ping a todos los miembros de todos los equipos elegibles.
 * Esta función busca los equipos y sus miembros directamente en la base de datos.
 *
 * @param {import('discord.js').Client} client - La instancia del cliente de Discord (tu bot).
 */
const updateUsersPingRole = async ({ client }) => {

    if (!client) {
        throw new Error('Faltan datos: client.')
    }

    try {
        const teams = await Team.find({}).populate({
            path: 'members.userId',
            model: 'User', // El modelo a poblar
            select: 'discordId' // Solo necesitamos el discordId del usuario
        })

        if (!teams || teams.length === 0) {
            throw new Error('Advertencia: No se encontraron equipos en la base de datos.')
        }

        for (const team of teams) {
            if (!team.members || team.members.length === 0) return

            for (const teamMember of team.members) {
                // teamMember.userId será el objeto User poblado, o null si no se pudo poblar
                const userId = teamMember.userId?.discordId

                if (!userId) continue

                try {
                    await addPingRoleToUser({ client, discordId: userId })
                } catch (memberError) {
                    throw new Error(`❌ Error procesando el rol para el usuario ${userId} en el equipo ${team.name}: ${memberError.message}`)
                }
            }
        }
    } catch (error) {
        throw new Error(`❌ Error al obtener los equipos o procesar roles: ${error.message}`)
    }
}

/**
 * Obtiene el nombre visible de un usuario en un servidor (nickname o username).
 * @param {string} userId - El ID del usuario.
 * @returns {Promise<string>} El nickname si lo tiene, o el username.
 */
const getUserDisplayName = async ({ guild, discordId }) => {
  try {
    const member = await guild.members.fetch(discordId)
    return member.displayName
  } catch (error) {
    throw new Error(`No se pudo obtener el nombre del usuario ${discordId}`)
  }
}

/**
 * Toggle Free Agent status (cuando el user pulsa botón)
 * @param {Client} client - Discord client
 * @param {User} user - Documento del usuario en Mongo
 */
async function toggleFreeAgent({ client, discordId }) {
  if (!client || !discordId) throw new Error("Faltan datos: client o discordId.")
  const user = await User.findOne({ discordId })
  const channel = await client.channels.fetch(channels.freeAgents.id)
  if (!channel || !channel.isTextBased()) throw new Error("Canal de agente libres no encontrado.")

  // Si ya está marcado como agente libre
  if (user.isFreeAgent) {
    try {
      if (user.freeAgentMessageId) {
        const msg = await channel.messages.fetch(user.freeAgentMessageId).catch(() => null)
        if (msg) await msg.delete()
      }
    } catch (e) {
      console.error("Error al borrar mensaje de agente libre:", e)
    }

    user.isFreeAgent = false
    user.freeAgentMessageId = null
    await user.save()
    return user
  }

  // Si no estaba → crear mensaje con stats
  let data = null
  if (user.brawlId) {
    data = await getUserBrawlData({ brawlId: user.brawlId }).catch(() => null)
  }

  const embed = await getUserStatsEmbed({ client, user, data, isFreeAgent: true })

  const msg = await channel.send({ embeds: [embed] })

  user.isFreeAgent = true
  user.freeAgentMessageId = msg.id
  await user.save()

  return user
}

/**
 * Sincroniza los Free Agents con el canal
 * - Borra los que ya tienen equipo
 * - Recrea los que faltan
 * - Actualiza los mensajes existentes con stats en tiempo real
 * @param {Client} client - Discord client
 */
async function syncFreeAgents({ client }) {
  const channel = await client.channels.fetch(channels.freeAgents.id)
  if (!channel || !channel.isTextBased()) throw new Error("Canal no encontrado o no es de texto.")

  const freeAgents = await User.find({})

  for (const user of freeAgents) {
    // Si ya tiene equipo → eliminar mensaje y limpiar
    if (user.teamId) {
      try {
        if (user.freeAgentMessageId) {
          const msg = await channel.messages.fetch(user.freeAgentMessageId)
          if (msg) await msg.delete()
        }
      } catch (e) {
        console.error("Error al borrar agente libre de usuario con equipo:", e)
      }

      user.isFreeAgent = false
      user.freeAgentMessageId = null
      await user.save()
      continue
    }
    if (user.isFreeAgent === false) continue
    // Obtener datos actualizados de Brawl
    let data = null
    if (user.brawlId) {
      data = await getUserBrawlData({ brawlId: user.brawlId }).catch(() => null)
    }

    const embed = await getUserStatsEmbed({ client, user, data, isFreeAgent: true })
    const contactButton = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel('Contactar')
        .setStyle(ButtonStyle.Link)
        .setURL(`https://discord.com/users/${user.discordId}`)
    )
    
    // Si no existe su mensaje → crear
    if (!user.freeAgentMessageId) {
      const msg = await channel.send({ embeds: [embed], components: [contactButton] })
      user.freeAgentMessageId = msg.id
      await user.save()
    } else {
      // Si existe → actualizar embed
      try {
        const msg = await channel.messages.fetch(user.freeAgentMessageId).catch(() => null)
        if (msg) {
          await msg.edit({ embeds: [embed], components: [contactButton] })
        } else {
          // Si no existe el mensaje en Discord pero sí en BD → recrear
          const newMsg = await channel.send({ embeds: [embed], components: [contactButton] })
          user.freeAgentMessageId = newMsg.id
          await user.save()
        }
      } catch (e) {
        console.error("Error al actualizar mensaje de agente libre:", e)
      }
    }
  }
}

module.exports = { checkUserIsVerified, verifyUser, addPingRoleToUser, updateUsersPingRole, getUserDisplayName, toggleFreeAgent, syncFreeAgents }
