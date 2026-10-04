# Turning on workout reminders

The app code is done and tested. Reminders need these one-time steps in your accounts.

1. Vercel > Intervo > Settings > Environment Variables: add VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY,
   VAPID_SUBJECT and PUSH_CRON_SECRET. Their values are in the git-ignored file `.env.local`
   in this folder (never commit it or paste it in chat).
2. Vercel > Storage > create or connect Upstash for Redis to this project (or reuse the one
   living-in-harmony uses: copy its UPSTASH_REDIS_REST_URL and _TOKEN; keys are prefixed `intervo:`).
3. Redeploy (env vars apply only to new deployments).
4. cron-job.org: add a job, POST `https://<your-intervo-url>/api/push/send-due`, every 5 minutes,
   header `x-cron-secret: <PUSH_CRON_SECRET>` (same method as the living-in-harmony job).
5. On the phone, open the installed app > Settings > Workout reminders > turn on, allow notifications.
   On iPhone the app must be added to the Home Screen first.

Check: `POST /api/push/send-due` with the right header returns `{"status":"ok","checked":N,...}`;
with a wrong or missing header, 403; with no PUSH_CRON_SECRET set, 503.
