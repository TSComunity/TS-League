# TSLeague

[![Stars](https://img.shields.io/github/stars/Zer0Dev-exe/TSLeague?style=for-the-badge&color=yellow)](https://github.com/Zer0Dev-exe/TSLeague/stargazers)
[![Forks](https://img.shields.io/github/forks/Zer0Dev-exe/TSLeague?style=for-the-badge&color=blue)](https://github.com/Zer0Dev-exe/TSLeague/network/members)
[![Issues](https://img.shields.io/github/issues/Zer0Dev-exe/TSLeague?style=for-the-badge&color=orange)](https://github.com/Zer0Dev-exe/TSLeague/issues)
[![Pull Requests](https://img.shields.io/github/issues-pr/Zer0Dev-exe/TSLeague?style=for-the-badge&color=purple)](https://github.com/Zer0Dev-exe/TSLeague/pulls)

---

# Descripción General

Sistema avanzado para la gestión y automatización de ligas competitivas de Brawl Stars en Discord. Desarrollado con Node.js, Discord.js y MongoDB, con una arquitectura modular y visualmente profesional. Permite gestionar toda la liga de forma automática, con paneles visuales, imágenes customizadas y algoritmos inteligentes para la organización de partidos, equipos y rondas.

---

# Librerías y Tecnologías Utilizadas

- **Node.js**: Entorno de ejecución principal.
- **discord.js**: Interacción avanzada con la API de Discord y componentes visuales.
- **mongoose**: Modelado y gestión de la base de datos MongoDB.
- **canvas**: Generación de imágenes personalizadas para partidos y resultados.
- **axios**: Peticiones HTTP para integración con APIs externas (ImgBB, Brawl Stars).
- **luxon**: Manipulación avanzada de fechas y horarios.
- **dotenv**: Gestión de variables de entorno y configuración segura.
- **sharp**: Procesamiento de imágenes adicional.
- **colors**: Coloreado de logs y mensajes en consola.

---

# Estructura del Proyecto

```
src/
  ├─ slashCommands/      # Comandos avanzados por rol
  ├─ prefixCommands/     # Comandos legacy y utilidades
  ├─ discord/            # Botones, menús, modals, embeds, inputs
  ├─ services/           # Lógica de negocio y automatización
  ├─ models/             # Modelos Mongoose: Season, Division, Team, Match, User
  ├─ config/            # Configuración, colores, emojis, modos/mapas
  ├─ utils/              # Funciones para fechas, imágenes, rounds, etc.
  ├─ handlers/           # Carga modular de eventos y comandos
  ├─ events/             # Listeners para interacciones y mensajes
  └─ assets/             # Recursos gráficos para imágenes
```

---

# Funcionalidades Destacadas

## Automatización Total
- Generación automática de jornadas, partidos, canales, roles, imágenes y avisos.
- Scheduling avanzado: rondas, deadlines, limpieza y asignación de horarios sin intervención manual.
- Algoritmos para evitar partidos repetidos y gestionar descansos de equipos.

## Paneles Visuales e Interactivos
- Paneles de divisiones y rankings que se actualizan tras cada partido.
- Botones, menús select y modals para gestionar equipos, partidos y usuarios.
- Experiencia visual con emojis, colores personalizados y assets gráficos.

## Imágenes Customizadas
- Generación dinámica de imágenes de partidos y resultados con Canvas.
- Integración directa en Discord mediante ImgBB.
- Personalización visual con fondos, iconos y colores de equipos.

## Integración con Brawl Stars
- Verificación y estadísticas en tiempo real de jugadores y equipos usando la API oficial.
- Control de elegibilidad y gestión de ascensos/descensos de equipos.
- Sincronización automática de datos y stats.

## Algoritmos Inteligentes y Gestión Avanzada
- Sorteo de modos y mapas con pesos personalizados y sin repeticiones.
- Gestión automática de ascensos, descensos y expulsiones según rendimiento.
- Limpieza automática de equipos vacíos y canales huérfanos.
- Programación de funciones para eventos futuros (rondas, deadlines, avisos).

## Sistema de Roles y Permisos
- Roles configurables para líderes, sublíderes, miembros y staff.
- Permisos personalizados para cada acción relevante en la liga.

## Base de Datos y Tecnología
- Backend con Discord.js y MongoDB (Mongoose) para máxima flexibilidad y escalabilidad.
- Estructura modular y mantenible, fácil de ampliar y adaptar.

---

# Comunidad y Soporte

Este sistema está desarrollado específicamente para la comunidad de [discord.gg/8nu3ZdDkp7](https://discord.gg/8nu3ZdDkp7), donde se gestiona la liga y se ofrece soporte directo a los participantes.