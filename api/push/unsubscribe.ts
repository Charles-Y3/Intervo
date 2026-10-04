import { handleUnsubscribe } from '../_lib/handlers.js';
import { jsonBody, respond } from '../_lib/http.js';
import type { Req, Res } from '../_lib/http.js';
import { getStore } from '../_lib/store.js';

export default async function handler(req: Req, res: Res) {
  await respond(req, res, 'POST', () => handleUnsubscribe(jsonBody(req), getStore()));
}
