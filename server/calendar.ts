/**
 * Google Calendar integration helper.
 * Uses the Google Calendar REST API directly (no SDK needed).
 * Tokens are stored as JSON in householdMembers.googleCalendarToken.
 */
import { ENV } from "./_core/env";

interface TokenData {
  access_token: string;
  refresh_token: string;
  expiry_date: number; // ms timestamp
}

/**
 * Refresh an access token using the refresh_token.
 */
async function refreshAccessToken(refreshToken: string): Promise<TokenData | null> {
  const clientId = ENV.googleClientId;
  const clientSecret = ENV.googleClientSecret;
  if (!clientId || !clientSecret) return null;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) return null;
  const data = await res.json() as any;
  return {
    access_token: data.access_token,
    refresh_token: refreshToken,
    expiry_date: Date.now() + (data.expires_in ?? 3600) * 1000,
  };
}

/**
 * Exchange an authorization code for tokens.
 */
export async function exchangeCodeForTokens(
  code: string,
  redirectUri: string
): Promise<TokenData | null> {
  const clientId = ENV.googleClientId;
  const clientSecret = ENV.googleClientSecret;
  if (!clientId || !clientSecret) return null;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "(unreadable)");
    console.error("[Calendar] exchangeCodeForTokens failed:", res.status, errText);
    return null;
  }
  const data = await res.json() as any;
  if (!data.access_token) {
    console.error("[Calendar] exchangeCodeForTokens: no access_token in response", JSON.stringify(data));
    return null;
  }
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expiry_date: Date.now() + (data.expires_in ?? 3600) * 1000,
  };
}

/**
 * Get a valid access token, refreshing if needed.
 */
async function getValidAccessToken(tokenJson: string): Promise<string | null> {
  let tokenData: TokenData;
  try {
    tokenData = JSON.parse(tokenJson) as TokenData;
  } catch {
    return null;
  }

  // Refresh if expired or expiring within 5 minutes
  if (tokenData.expiry_date < Date.now() + 5 * 60 * 1000) {
    const refreshed = await refreshAccessToken(tokenData.refresh_token);
    if (!refreshed) return null;
    tokenData = refreshed;
  }

  return tokenData.access_token;
}

/**
 * Create a Google Calendar event for a given member.
 * Returns the Google Calendar event ID or null on failure.
 */
export async function createCalendarEvent(
  tokenJson: string,
  event: {
    title: string;
    description?: string;
    startDateTime?: Date | null; // if null, creates an all-day event on today
    endDateTime?: Date | null;
    allDay?: boolean;
    date?: Date | null; // for all-day events
  }
): Promise<string | null> {
  const accessToken = await getValidAccessToken(tokenJson);
  if (!accessToken) return null;

  let eventBody: Record<string, unknown>;

  if (event.allDay || !event.startDateTime) {
    // All-day event
    const dateStr = event.date
      ? event.date.toISOString().split("T")[0]
      : new Date().toISOString().split("T")[0];
    eventBody = {
      summary: event.title,
      description: event.description ?? "",
      start: { date: dateStr },
      end: { date: dateStr },
    };
  } else {
    // Timed event
    const start = event.startDateTime.toISOString();
    const end = event.endDateTime
      ? event.endDateTime.toISOString()
      : new Date(event.startDateTime.getTime() + 60 * 60 * 1000).toISOString();
    eventBody = {
      summary: event.title,
      description: event.description ?? "",
      start: { dateTime: start },
      end: { dateTime: end },
    };
  }

  const res = await fetch(
    "https://www.googleapis.com/calendar/v3/calendars/primary/events",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(eventBody),
    }
  );

  if (!res.ok) {
    console.error("[Calendar] Failed to create event:", await res.text());
    return null;
  }

  const data = await res.json() as any;
  return data.id as string ?? null;
}

/**
 * Delete a Google Calendar event for a given member.
 */
export async function deleteCalendarEvent(
  tokenJson: string,
  googleEventId: string
): Promise<boolean> {
  const accessToken = await getValidAccessToken(tokenJson);
  if (!accessToken) return false;

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events/${googleEventId}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  return res.ok || res.status === 404; // 404 means already deleted
}

/**
 * Check if Google Calendar is configured (env vars present).
 */
export function isCalendarConfigured(): boolean {
  return !!(ENV.googleClientId && ENV.googleClientSecret);
}
