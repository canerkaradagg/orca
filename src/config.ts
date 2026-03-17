export const API_BASE = import.meta.env?.DEV
  ? ''
  : ((import.meta.env?.VITE_API_BASE as string) ?? '')
