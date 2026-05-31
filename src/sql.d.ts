/** Allow importing .sql files as text strings (Bun import attributes: type "text") */
declare module "*.sql" {
  const content: string;
  export default content;
}
