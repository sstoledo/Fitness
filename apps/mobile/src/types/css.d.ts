// Type declarations for Expo web CSS imports used by the template.
// Committed so `tsc --noEmit` stays green before `expo start` generates
// `.expo/types` / `expo-env.d.ts` on a fresh clone.

declare module '*.module.css' {
  const classes: Readonly<Record<string, string>>;
  export default classes;
}

declare module '*.css';