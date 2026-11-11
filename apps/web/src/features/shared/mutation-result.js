/**
 * @param {string} code
 * @param {Record<string, unknown>} data
 */
export function successResult(code, data) {
  return {
    ok: true,
    code,
    data,
    fieldErrors: {},
    formError: null,
  };
}

/**
 * @param {string} code
 * @param {Record<string, string[]>} [fieldErrors]
 * @param {string | null} [formError]
 */
export function failureResult(code, fieldErrors = {}, formError = null) {
  return {
    ok: false,
    code,
    data: {},
    fieldErrors,
    formError,
  };
}
