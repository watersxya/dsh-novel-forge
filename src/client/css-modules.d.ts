/**
 * CSS module type shim (bundler injects the class map at build time).
 */

declare module '*.module.css' {
  const classes: Record<string, string>
  export default classes
}
