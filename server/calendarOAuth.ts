/**
 * Google Calendar OAuth callback handler.
 * Registered as a standalone Express route at /api/calendar/callback.
 *
 * Flow:
 * 1. User clicks "Connect Google Calendar" in Settings
 * 2. Frontend calls trpc.calendar.getAuthUrl to get the Google OAuth URL
 *    with redirectUri = window.location.origin + "/api/calendar/callback"
 *    and state = JSON.stringify({ token, memberId })
 * 3. User authorises in Google
 * 4. Google redirects to /api/calendar/callback?code=...&state=...
 * 5. This handler exchanges the code for tokens and saves them to the DB
 * 6. Redirects back to the Settings page with a success flag
 */

import type { Express, Request, Response } from "express";
import { exchangeCodeForTokens } from "./calendar";
import { updateMemberCalendarToken, getMembersByHousehold, getHouseholdByToken } from "./db";

function getQueryParam(req: Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}

export function registerCalendarOAuthRoutes(app: Express) {
  app.get("/api/calendar/callback", async (req: Request, res: Response) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");

    if (!code || !state) {
      res.redirect("/?calendarError=missing_params");
      return;
    }

    let token: string;
    let memberId: number;

    try {
      const parsed = JSON.parse(decodeURIComponent(state)) as { token: string; memberId: number };
      token = parsed.token;
      memberId = parsed.memberId;
    } catch {
      res.redirect("/?calendarError=invalid_state");
      return;
    }

    try {
      // Verify the household token is valid
      const household = await getHouseholdByToken(token);
      if (!household) {
        res.redirect("/?calendarError=invalid_household");
        return;
      }

      // Verify the member belongs to this household
      const members = await getMembersByHousehold(household.id);
      const member = members.find((m) => m.id === memberId);
      if (!member) {
        res.redirect("/?calendarError=invalid_member");
        return;
      }

      // Exchange code for tokens
      const redirectUri = `${req.protocol}://${req.get("host")}/api/calendar/callback`;
      const tokenData = await exchangeCodeForTokens(code, redirectUri);
      if (!tokenData) {
        res.redirect("/settings?calendarError=token_exchange_failed");
        return;
      }

      // Save the token JSON to the member record
      await updateMemberCalendarToken(memberId, JSON.stringify(tokenData));

      // Redirect back to settings with success
      res.redirect("/settings?calendarConnected=true");
    } catch (error) {
      console.error("[Calendar OAuth] Callback failed:", error);
      res.redirect("/settings?calendarError=server_error");
    }
  });
}
