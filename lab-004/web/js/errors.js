import { ERROR_MESSAGES } from './contracts.js';
export { ERROR_MESSAGES, cameraPoseError } from './contracts.js';
export function describeError(error){ return error?.code ? (ERROR_MESSAGES[error.code]||error.message||error.code) : String(error); }
