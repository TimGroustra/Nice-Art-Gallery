import { Contract } from "ethers";

/**
 * Safely calls a contract method and returns a structured result object.
 * @param contract The ethers Contract instance.
 * @param method The name of the method to call.
 * @param args Arguments for the method call.
 * @returns { ok: true, value: any } on success, or { ok: false, error: string, raw: any } on failure.
 */
export async function safeCall(contract: Contract, method: string, args: any[] = []) {
  try {
    // @ts-ignore dynamic invoke
    const value = await contract[method](...args);
    return { ok: true, value };
  } catch (err: any) {
    // Capture common shapes
    const message = err?.reason || err?.message || String(err);
    
    // Check for common revert/call exceptions which indicate a token might not exist
    const isRevertError = 
      err.code === 'CALL_EXCEPTION' || 
      message.includes('missing revert data') || 
      message.includes('execution reverted');

    if (isRevertError) {
      return { ok: false, error: "Token does not exist or contract call failed (revert)", raw: err };
    }

    // Capture other errors (like batch size too large)
    return { ok: false, error: message, raw: err };
  }
}