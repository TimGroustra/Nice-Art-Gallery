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
    // capture common shapes
    const message = err?.reason || err?.message || String(err);
    return { ok: false, error: message, raw: err };
  }
}