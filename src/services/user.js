const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js')
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

const FREE_AGENT_DURATION_MS = 7 * 24 * 60 * 60 * 1000

/**
 * Toggle Free Agent status (cuando el user pulsa botón)
 */
async function toggleFreeAgent({ client, discordId }) {
  if (!client || !discordId) throw new Error("Faltan datos: client o discordId.")

  const user = await User.findOne({ discordId })
  if (!user) throw new Error("Usuario no encontrado.")

  const channel = await client.channels.fetch(channels.freeAgents.id)
  if (!channel || !channel.isTextBased()) {
    throw new Error("Canal de agentes libres no encontrado.")
  }

  // DESACTIVAR FREE AGENT
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
    user.freeAgentExpiresAt = null
    await user.save()
    return user
  }

  // ACTIVAR FREE AGENT
  let data = null
  if (user.brawlId) {
    data = await getUserBrawlData({ brawlId: user.brawlId }).catch(() => null)
  }

  const embed = await getUserStatsEmbed({
    client,
    user,
    data,
    isFreeAgent: true
  })

  const contactButton = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel('Contactar')
      .setStyle(ButtonStyle.Link)
      .setURL(`https://discord.com/users/${user.discordId}`)
  )

  const msg = await channel.send({
    embeds: [embed],
    components: [contactButton]
  })

  user.isFreeAgent = true
  user.freeAgentMessageId = msg.id
  user.freeAgentExpiresAt = new Date(Date.now() + FREE_AGENT_DURATION_MS)
  await user.save()

  return user
}

async function sendDM(client, discordId, payload) {
  try {
    const user = await client.users.fetch(discordId)
    if (!user) return false
    await user.send(payload)
    return true
  } catch (err) {
    if (err?.code === 50007) return false
    console.warn(`No se pudo enviar MD a ${discordId}:`, err.code ?? err)
    return false
  }
}

async function syncFreeAgents({ client }) {
  const channel = await client.channels.fetch(channels.freeAgents.id)
  if (!channel || !channel.isTextBased()) {
    throw new Error("Canal de agentes libres no encontrado o no es de texto.")
  }

  const users = await User.find({})

  for (const user of users) {
    if (!user.isFreeAgent) continue
    /* =================================================
     * 1️⃣ USER CON EQUIPO → SOLO SI ERA FREE AGENT
     * ================================================= */
    if (user.teamId) {
      const wasFreeAgent = user.isFreeAgent || user.freeAgentMessageId
      if (!wasFreeAgent) continue

      // Eliminar mensaje
      if (user.freeAgentMessageId) {
        const msg = await channel.messages.fetch(user.freeAgentMessageId).catch(() => null)
        if (msg) await msg.delete()
      }

      // Limpiar estado
      user.isFreeAgent = false
      user.freeAgentMessageId = null
      user.freeAgentExpiresAt = null
      await user.save()

      // MD opcional
      await sendDM(client, user.discordId, {
        embeds: [
          new EmbedBuilder()
            .setTitle('Estado de agente libre actualizado')
            .setDescription(
              `Tu estado de **agente libre** ha sido retirado automáticamente porque ahora formas parte de un equipo.\n\n` +
              `Tu anuncio ha sido eliminado del canal <#${channels.freeAgents.id}>.`
            )
            .setColor(0x2ECC71)
        ]
      })

      continue
    }

    /* ======================================================
     * 2️⃣ GUARD: FREE AGENT ACTIVO SIN expiresAt → EXPIRA YA
     * ====================================================== */
    if (user.isFreeAgent && !user.freeAgentExpiresAt) {
      user.freeAgentExpiresAt = new Date()
      await user.save()
    }

    /* =========================
     * 3️⃣ FREE AGENT EXPIRADO
     * ========================= */
    if (user.freeAgentExpiresAt <= new Date()) {
      // Eliminar mensaje
      if (user.freeAgentMessageId) {
        const msg = await channel.messages.fetch(user.freeAgentMessageId).catch(() => null)
        if (msg) await msg.delete()
      }

      // Limpiar estado
      user.isFreeAgent = false
      user.freeAgentMessageId = null
      user.freeAgentExpiresAt = null
      await user.save()

      // MD opcional
      const renewButton = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('userRenewFreeAgent')
          .setLabel('Renovar Agente Libre')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('🔍')
      )

      await sendDM(client, user.discordId, {
        embeds: [
          new EmbedBuilder()
            .setTitle('Estado de agente libre expirado')
            .setDescription(
              `Tu estado de **agente libre** ha expirado tras **7 días** sin unirte a ningún equipo.\n\n` +
              `Tu anuncio ha sido eliminado del canal <#${channels.freeAgents.id}>.\n\n` +
              `Puedes renovarlo usando el botón inferior.`
            )
            .setColor(0xE67E22)
        ],
        components: [renewButton]
      })

      continue
    }

    /* ==============================
     * 4️⃣ FREE AGENT ACTIVO → SYNC
     * ============================== */
    let data = null
    if (user.brawlId) {
      data = await getUserBrawlData({ brawlId: user.brawlId }).catch(() => null)
    }

    const embed = await getUserStatsEmbed({
      client,
      user,
      data,
      isFreeAgent: true
    })

    const contactButton = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel('Contactar')
        .setStyle(ButtonStyle.Link)
        .setURL(`https://discord.com/users/${user.discordId}`)
    )

    if (!user.freeAgentMessageId) {
      const msg = await channel.send({
        embeds: [embed],
        components: [contactButton]
      })
      user.freeAgentMessageId = msg.id
      await user.save()
    } else {
      const msg = await channel.messages.fetch(user.freeAgentMessageId).catch(() => null)
      if (msg) {
        await msg.edit({
          embeds: [embed],
          components: [contactButton]
        })
      } else {
        const newMsg = await channel.send({
          embeds: [embed],
          components: [contactButton]
        })
        user.freeAgentMessageId = newMsg.id
        await user.save()
      }
    }
  }
}

module.exports = { checkUserIsVerified, verifyUser, addPingRoleToUser, updateUsersPingRole, getUserDisplayName, toggleFreeAgent, syncFreeAgents }