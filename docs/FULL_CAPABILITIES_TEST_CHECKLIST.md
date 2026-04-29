# Full Capabilities Test Checklist

Use this checklist when validating the whole Konesans+ platform in production or pre-production.

## Preconditions

- Frontend deployed and reachable on the public portal and admin portal
- Backend deployed on EC2 and healthy at `/health`
- Production database reachable
- SMTP configured and able to send OTP emails
- Google OAuth configured if social login is part of the session
- Arena runtime ready on EC2: backend, Redis, LiveKit, and LiveKit Egress
- `ARENA_YOUTUBE_RTMP_URL` configured on EC2 for the YouTube public stream path
- At least 4 accounts available:
  - 1 admin
  - 1 moderator
  - 2 student competitors

## 1. Public Access

1. Open the public site landing page.
2. Confirm the main navigation, hero, and public pages load correctly on desktop and mobile.
3. Open the admin portal hostname and confirm it routes to the admin login page.

Expected result:

- Public portal and admin portal resolve correctly.
- No broken layout on mobile.

## 2. Authentication And Registration

1. Register a new student account.
2. Confirm the OTP email is received.
3. Enter a wrong OTP once and confirm the error message is clear.
4. Use resend OTP and confirm the cooldown is enforced.
5. Enter the correct OTP and complete registration.
6. Log out and log back in with the new account.

Expected result:

- OTP request, resend, validation, and login all work.
- Friendly anti-abuse messages appear when needed.

## 3. Student Experience

1. Log in as a student.
2. Complete profile if required.
3. Open the student dashboard.
4. Start at least one quiz session.
5. Submit answers and confirm results display correctly.
6. Open duel or any active challenge surface if available.

Expected result:

- Dashboard loads without role errors.
- Quiz flow works end to end.

## 4. Admin Core Management

1. Log in as admin.
2. Create or edit one level/class.
3. Create or edit one subject.
4. Create one question.
5. Verify the question appears in the admin list.
6. Create one admin broadcast/message if this feature is active.
7. Upload or edit one sponsor if sponsor management is enabled.

Expected result:

- CRUD actions work.
- New content is visible where expected.

## 5. Moderator Creation With OTP

1. From admin, create a moderator account.
2. Confirm the moderator OTP email is received.
3. Test resend once.
4. Validate the correct OTP.
5. Log in as the new moderator.

Expected result:

- Moderator creation completes only after OTP validation.

## 6. Arena Competition Setup

1. From admin, create a new Arena competition.
2. Open registrations.
3. As student A and student B, register for the competition.
4. As admin, approve registrations.
5. Assign the moderator if not already assigned.

Expected result:

- Competition lifecycle moves from pending to approved cleanly.

## 7. Arena Private Live Stage

1. Launch the competition.
2. Open the private live page as moderator.
3. Join the stage as student A.
4. Join the stage as student B.
5. Confirm all three can access the private scene.
6. Start a round and verify timer and state updates.

Expected result:

- Private RTC scene works for moderator and both competitors.
- Spectators do not join the private RTC stage.

## 8. Arena Public YouTube Stream

1. In admin, paste the public YouTube watch URL for the competition.
2. Save the YouTube public stream configuration.
3. As moderator, click to open the public stream.
4. Open the spectator page for the competition.
5. Confirm the page embeds YouTube and still shows leaderboard, round, and timer.
6. Confirm the public YouTube watch link opens in a new tab.
7. Stop the public stream and confirm the spectator page updates accordingly.

Expected result:

- Public spectator video is served by YouTube.
- Platform state remains synchronized independently of YouTube video delivery.

## 9. Arena Match Completion

1. Run at least one round to completion.
2. Adjust score or moderate if needed.
3. End the competition with a winner.
4. Confirm the spectator page reflects the stopped state.
5. Confirm completed competition history is visible where expected.

Expected result:

- Match closes cleanly.
- Winner and history are persisted.

## 10. Deployment Smoke Checks

1. Confirm `https://api.connaissanceplus.net/health` returns success.
2. On EC2, confirm `docker compose ps` shows backend, Redis, LiveKit, and LiveKit Egress up.
3. Confirm backend logs show no repeated crash loop.
4. Confirm LiveKit and Egress logs do not show startup failure.

Expected result:

- All required runtime services are healthy.

## 11. Sign-Off

Mark the session successful only if all items below are true:

- student registration OTP works
- admin moderator OTP works
- quiz flows work
- admin management works
- Arena private stage works
- Arena public YouTube spectator flow works
- completed match data persists
- production health endpoint stays green