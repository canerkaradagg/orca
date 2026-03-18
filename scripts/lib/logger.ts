/**
 * ORCA – Structured logging (Pino)
 * Dev: pino-pretty ile okunabilir çıktı. Production: JSON.
 */

import pino from 'pino'

const isDev = process.env.NODE_ENV !== 'production'
const level = process.env.LOG_LEVEL || 'info'

const logger = pino({
  level,
  ...(isDev && {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
      },
    },
  }),
})

export default logger
