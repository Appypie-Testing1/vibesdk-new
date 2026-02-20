export class GlobalDurableObject {
  ctx: DurableObjectState;
  env: Env;

  constructor(ctx: DurableObjectState, env: Env) {
    this.ctx = ctx;
    this.env = env;
  }

  async fetch(request: Request) {

    // Create table automatically
    await this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT,
        completed INTEGER
      )
    `);

    const url = new URL(request.url);

    if (url.pathname === "/add") {
      await this.ctx.storage.sql.exec(
        "INSERT INTO tasks (title, completed) VALUES (?, ?)",
        ["Test Task", 0]
      );
      return new Response("Inserted");
    }

    if (url.pathname === "/list") {
      const rows = this.ctx.storage.sql
        .exec("SELECT * FROM tasks")
        .toArray();

      return Response.json(rows);
    }

    return new Response("DO Running");
  }
}
