const axios = require('axios')
const { IMGBB_API_KEY } = require('../config/config.js')

async function uploadToImgBB(buffer) {
  try {
    const base64 = buffer.toString('base64')
    const form = new URLSearchParams()
    form.append('key', IMGBB_API_KEY)
    form.append('image', base64)

    const res = await axios.post('https://api.imgbb.com/1/upload', form)
    return res.data?.data?.display_url || res.data?.data?.url
  } catch (err) {
    console.error('❌ Error al subir imagen:', err)
    return null
  }
}

module.exports = { uploadToImgBB }
