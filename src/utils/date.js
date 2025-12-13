// services/dates.js
// ✅ Versión definitiva: determinista y con semanas de LUNES a DOMINGO.
// - defaultDate → próxima ocurrencia (entre defaultStartDays) → la más cercana en el futuro.
// - deadline → ocurrencia de ESTA SEMANA (lunes-domingo). Si ya pasó → la de la próxima semana.

const { DateTime } = require('luxon')
const config = require('../config/league.js')

// ------------------------------------------------------
// Validación de configuración base
// ------------------------------------------------------
function validateconfig() {
  if (!config || !config.match) throw new Error('config.match no está definido')
  const m = config.match
  if (!Number.isInteger(m.deadlineDay) || m.deadlineDay < 0 || m.deadlineDay > 6)
    throw new Error(`config.match.deadlineDay inválido (${m.deadlineDay}). Debe ser 0..6 (0=domingo).`)
  if (!Number.isInteger(m.deadlineHour) || m.deadlineHour < 0 || m.deadlineHour > 23)
    throw new Error(`config.match.deadlineHour inválido (${m.deadlineHour}). Debe ser 0..23.`)
  if (!Number.isInteger(m.deadlineMinute) || m.deadlineMinute < 0 || m.deadlineMinute > 59)
    throw new Error(`config.match.deadlineMinute inválido (${m.deadlineMinute}). Debe ser 0..59.`)

  if (m.defaultStartDays) {
    if (!Array.isArray(m.defaultStartDays) || m.defaultStartDays.some(d => !Number.isInteger(d) || d < 0 || d > 6))
      throw new Error('config.match.defaultStartDays debe ser Array de enteros 0..6 (0=domingo).')
  }
}

// ------------------------------------------------------
// Helpers: mapeo de días
// Luxon: weekday = 1 (lunes) .. 7 (domingo)
// config: 0=domingo .. 6=sábado
// ------------------------------------------------------
function luxonWeekdayToIndex(luxonWeekday) {
  return luxonWeekday % 7 // domingo(7)->0, lunes(1)->1, ..., sábado(6)->6
}

// ------------------------------------------------------
// getNextOccurrence
// Devuelve la próxima ocurrencia futura del día/hora indicado.
// ------------------------------------------------------
function getNextOccurrence(day, hour = 0, minute = 0, now = new Date()) {
  if (!Number.isInteger(day) || day < 0 || day > 6)
    throw new Error("getNextOccurrence: 'day' debe ser 0..6 (0=domingo)")
  const dtNow = DateTime.fromJSDate(now).setZone('Europe/Madrid')
  const todayIdx = luxonWeekdayToIndex(dtNow.weekday)

  let daysToAdd = (day - todayIdx + 7) % 7
  const targetSameDay = dtNow.set({ hour, minute, second: 0, millisecond: 0 })
  if (daysToAdd === 0 && targetSameDay <= dtNow) {
    daysToAdd = 7 // ya pasó hoy → próxima semana
  }

  const result = dtNow.plus({ days: daysToAdd }).set({ hour, minute, second: 0, millisecond: 0 })
  return result.toJSDate()
}

// ------------------------------------------------------
// getPreviousOccurrence
// Última ocurrencia pasada (<= now) del día/hora indicado.
// ------------------------------------------------------
function getPreviousOccurrence(day, hour = 0, minute = 0, now = new Date()) {
  if (!Number.isInteger(day) || day < 0 || day > 6)
    throw new Error("getPreviousOccurrence: 'day' debe ser 0..6 (0=domingo)")
  const dtNow = DateTime.fromJSDate(now).setZone('Europe/Madrid')
  const todayIdx = luxonWeekdayToIndex(dtNow.weekday)

  let daysBack = (todayIdx - day + 7) % 7
  let candidate = dtNow.minus({ days: daysBack }).set({ hour, minute, second: 0, millisecond: 0 })
  if (candidate > dtNow) {
    candidate = candidate.minus({ weeks: 1 })
  }

  return candidate.toJSDate()
}

// ------------------------------------------------------
// pickClosestNextDay
// Escoge la ocurrencia futura más cercana entre una lista de días.
// ------------------------------------------------------
function pickClosestNextDay(defaultDayList, hour = 0, minute = 0, now = new Date()) {
  if (!Array.isArray(defaultDayList) || defaultDayList.length === 0)
    throw new Error('pickClosestNextDay: defaultDayList debe ser array no vacío');

  const dtNow = DateTime.fromJSDate(now).setZone('Europe/Madrid');
  const candidates = [];

  for (const d of defaultDayList) {
    if (!Number.isInteger(d) || d < 0 || d > 6) continue;
    const candidateDate = DateTime.fromJSDate(getNextOccurrence(d, hour, minute, now)).setZone('Europe/Madrid');
    if (candidateDate >= dtNow) {
      candidates.push(candidateDate.toJSDate());
    }
  }

  if (candidates.length === 0) {
    // Si no hay candidatos en el futuro, usar el primero como fallback
    const fallbackDay = defaultDayList[0];
    return { day: fallbackDay, date: getNextOccurrence(fallbackDay, hour, minute, now) };
  }

  // Elegir uno al azar
  const randomIndex = Math.floor(Math.random() * candidates.length);
  return { day: candidates[randomIndex].getDay(), date: candidates[randomIndex] };
}

// ------------------------------------------------------
// getDate
// Próxima ocurrencia del día/hora indicado (útil para helpers)
// ------------------------------------------------------
function getDate({ day, hour = 0, minute = 0 }, now = new Date()) {
  if (!Number.isInteger(day) || day < 0 || day > 6)
    throw new Error("El parámetro 'day' debe ser un número entre 0 y 6 (0=domingo).")
  if (!Number.isInteger(hour) || hour < 0 || hour > 23)
    throw new Error("El parámetro 'hour' debe estar entre 0 y 23.")
  if (!Number.isInteger(minute) || minute < 0 || minute > 59)
    throw new Error("El parámetro 'minute' debe estar entre 0 y 59.")

  const dtNow = DateTime.fromJSDate(now).setZone('Europe/Madrid')
  const todayIdx = luxonWeekdayToIndex(dtNow.weekday)
  let daysToAdd = (day - todayIdx + 7) % 7
  const sameDayTarget = dtNow.set({ hour, minute, second: 0, millisecond: 0 })
  if (daysToAdd === 0 && sameDayTarget <= dtNow) {
    daysToAdd = 7
  }

  const result = dtNow.plus({ days: daysToAdd }).set({ hour, minute, second: 0, millisecond: 0 })
  return result.toJSDate()
}

// ------------------------------------------------------
// checkDeadline
// Devuelve { passed, deadline, defaultDate }
// - deadline = ocurrencia de ESTA semana (lunes a domingo). Si ya pasó, la de la próxima.
// - defaultDate = próxima ocurrencia futura entre defaultStartDays.
// ------------------------------------------------------
function checkDeadline(match, now = new Date()) {
  validateconfig();

  if (match?.scheduledAt) {
    return {
      passed: false,
      deadline: match.scheduledAt,
      defaultDate: match.scheduledAt
    };
  }

  const dtNow = DateTime.fromJSDate(now).setZone('Europe/Madrid');
  const { deadlineDay, deadlineHour = 0, deadlineMinute = 0, defaultStartDays, defaultStartHour = 0 } = config.match;

  // Lunes de esta semana (weekday=1)
  const monday = dtNow.set({ weekday: 1 }).startOf('day');

  // Deadline de la semana actual
  // deadlineDay: 0=domingo ... 6=sábado
  // Como Luxon lunes=1 ... domingo=7, hacemos:
  const luxonDay = (deadlineDay === 0 ? 7 : deadlineDay); // domingo=7
  let deadline = monday.plus({ days: luxonDay - 1 })
    .set({ hour: deadlineHour, minute: deadlineMinute, second: 0, millisecond: 0 });

  // Si ya pasó, passed=true, pero nunca sumar semana
  const passed = dtNow > deadline;

  // Próxima fecha por defecto según tus días/hora configurados
  const closest = pickClosestNextDay(defaultStartDays, defaultStartHour, 0, now);

  return {
    passed,
    deadline: deadline.toJSDate(),
    defaultDate: closest.date
  };
}

// ------------------------------------------------------
// Export
// ------------------------------------------------------
module.exports = {
  getNextOccurrence,
  getPreviousOccurrence,
  pickClosestNextDay,
  getDate,
  checkDeadline
}