import { handleSendDue } from '../_lib/handlers.js';
import { header, makeSender, readEnv, respond } from '../_lib/http.js';
import type { Req, Res } from '../_lib/http.js';
import { getStore } from '../_lib/store.js';

/** Called every 5 minutes by an external scheduler (cron-job.org) with the x-cron-secret header. */
export default async function handler(req: Req, res: Res) {
  await respond(req, res, 'POST', () => {
    const env = readEnv();
    return handleSendDue(header(req, 'x-cron-secret'), env, getStore(), makeSender(env), Date.now());
  });
}
