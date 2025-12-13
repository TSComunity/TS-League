const sharp = require('sharp')
const { uploadToImgBB } = require('../utils/canvas.js')
const { getActiveSeason } = require('../utils/season.js')

const gameModes = require('../config/gameModes.json')
const config = require('../config/league.js')

/**
 * Selecciona sets aleatorios (modo + mapa) que aún no se han jugado en la jornada anterior.
 * Usa los pesos de modos y mapas definidos en el JSON.
 * @returns {Object} sets - los sets elegidos.
 */
const generateRandomSets = async () => {
  const defaultSetsLength = config.match.defaultSetsLength
  const season = await getActiveSeason()

  // Mapas ya usados EN LA JORNADA ANTERIOR
  const playedMapIds = new Set()
  for (const division of season.divisions) {
    const rounds = division.rounds
    // Solo miramos el penúltimo round (jornada anterior)
    if (rounds.length >= 2) {
      const previousRound = rounds[rounds.length - 1]
      if (previousRound && previousRound.sets && Array.isArray(previousRound.sets)) {
        for (const set of previousRound.sets) {
          if (set?.map) playedMapIds.add(set.map)
        }
      }
    }
  }

  // Crear lista de modos con pesos (sin repetir modo)
  const availableModes = gameModes

  const weightedModes = []
  for (const mode of availableModes) {
    for (let i = 0; i < mode.weight; i++) {
      weightedModes.push(mode)
    }
  }

  const selectedModes = []
  const usedModeIds = new Set()

  while (selectedModes.length < defaultSetsLength && weightedModes.length > 0) {
    const mode = weightedModes[Math.floor(Math.random() * weightedModes.length)]
    if (!usedModeIds.has(mode.id)) {
      selectedModes.push(mode)
      usedModeIds.add(mode.id)
    }
  }

  if (selectedModes.length < defaultSetsLength) {
    throw new Error(`No hay suficientes modos distintos disponibles para ${defaultSetsLength} sets.`)
  }

  // Para cada modo, seleccionar un mapa por peso
  const sets = []
  for (let i = 0; i < defaultSetsLength; i++) {
    const mode = selectedModes[i]
    
    // Primero intentar con mapas no jugados en la jornada anterior
    let availableMaps = mode.maps.filter(map => !playedMapIds.has(map.id))
    
    // Si no hay mapas disponibles (todos se jugaron), usar todos los mapas del modo
    if (availableMaps.length === 0) {
      availableMaps = mode.maps
    }

    const weightedMaps = []
    for (const map of availableMaps) {
      for (let j = 0; j < map.weight; j++) {
        weightedMaps.push(map)
      }
    }

    const map = weightedMaps[Math.floor(Math.random() * weightedMaps.length)]

    sets.push({
      mode: mode.id,
      map: map.id,
      winner: null
    })
  }

  return sets
}

async function generateMapCollage({ sets }) {
  // sets: array de 3 sets con { mapURL }

  function getMapData(mapId) {
    for (const mode of gameModes) {
      const map = mode.maps.find(m => m.id === mapId)
      if (map) return map
    }
    return null
  }

  // Descargar las imágenes de los mapas de cada set
  const imagesBuffers = await Promise.all(
    sets.map(async set => {
      const mapData = getMapData(set.map)
      if (!mapData?.imageURL) return null

      const res = await fetch(mapData.imageURL)
      const arrayBuffer = await res.arrayBuffer()
      return Buffer.from(arrayBuffer)
    })
  )

  // Redimensionar todas a la misma altura (ej: 200px)
  const resizedBuffers = await Promise.all(
    imagesBuffers.map(buf => sharp(buf).resize({ height: 200 }).toBuffer())
  )

  // Combinar horizontalmente
  const collage = await sharp({
    create: {
      width: 200 * 3, // 3 imágenes de 200px de ancho cada una
      height: 200,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  })
    .composite([
      { input: resizedBuffers[0], left: 0, top: 0 },
      { input: resizedBuffers[1], left: 200, top: 0 },
      { input: resizedBuffers[2], left: 400, top: 0 }
    ])
    .png()
    .toBuffer()

    const url = await uploadToImgBB(collage)

  return url
}


module.exports = { generateRandomSets, generateMapCollage }