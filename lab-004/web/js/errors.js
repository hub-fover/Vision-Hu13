import { ERROR_MESSAGES } from './contracts.js';
export function describeError(error){const code=error?.code||'INVALID_FRAME';return ERROR_MESSAGES[code]||error?.message||'处理失败。';}
