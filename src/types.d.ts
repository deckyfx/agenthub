/** SQL files imported with `with { type: "text" }` (embedded migrations). */
declare module "*.sql" {
  const sql: string;
  export default sql;
}
