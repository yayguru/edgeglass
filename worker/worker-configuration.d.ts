interface D1Database {
  prepare(query: string): D1PreparedStatement
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement
  first<T = unknown>(): Promise<T | null>
  all<T = unknown>(): Promise<{ results: T[] }>
  run(): Promise<unknown>
}

interface Env {
  DB?: D1Database
  EDGEGLASS_TG_BOT_TOKEN?: string
  TELEGRAM_WEBHOOK_SECRET?: string
}
