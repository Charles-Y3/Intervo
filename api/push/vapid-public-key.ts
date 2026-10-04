import { handleVapidKey } from '../_lib/handlers.js';
import { readEnv, respond } from '../_lib/http.js';
import type { Req, Res } from '../_lib/http.js';

export default async function handler(req: Req, res: Res) {
  await respond(req, res, 'GET', () => handleVapidKey(readEnv()));
}
