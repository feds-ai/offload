import React, { createContext, useContext, useState } from "react";

export interface HouseholdMember {
  id: number;
  householdId: number;
  userId: number | null;
  displayName: string;
  role: "primary" | "partner";
  googleCalendarToken: string | null;
  createdAt: Date;
}

export interface Household {
  id: number;
  name: string;
  shareToken: string;
  imbalanceThreshold: number;
  createdAt: Date;
  updatedAt: Date;
}

const LS_TOKEN_KEY = "offload_household_token";
const LS_MEMBER_KEY = "offload_member_id";

// Read from localStorage safely (SSR / private-browsing guard)
function readLS(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function writeLS(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch {}
}
function removeLS(key: string) {
  try { localStorage.removeItem(key); } catch {}
}

interface HouseholdContextValue {
  household: Household | null;
  members: HouseholdMember[];
  myMemberId: number | null;
  token: string | null;
  setHousehold: (h: Household | null) => void;
  setMembers: (m: HouseholdMember[]) => void;
  setMyMemberId: (id: number | null) => void;
  setToken: (t: string | null) => void;
  primaryMember: HouseholdMember | undefined;
  partnerMember: HouseholdMember | undefined;
  myMember: HouseholdMember | undefined;
  /** Persist token + memberId to localStorage */
  persistIdentity: (token: string, memberId: number) => void;
  /** Clear stored identity (but keep token so household is still accessible) */
  clearMemberId: () => void;
  /** True when we have a token but don't know which member this device is */
  needsIdentityCheck: boolean;
}

const HouseholdContext = createContext<HouseholdContextValue>({
  household: null,
  members: [],
  myMemberId: null,
  token: null,
  setHousehold: () => {},
  setMembers: () => {},
  setMyMemberId: () => {},
  setToken: () => {},
  primaryMember: undefined,
  partnerMember: undefined,
  myMember: undefined,
  persistIdentity: () => {},
  clearMemberId: () => {},
  needsIdentityCheck: false,
});

export function HouseholdProvider({ children }: { children: React.ReactNode }) {
  const [household, setHousehold] = useState<Household | null>(null);
  const [members, setMembers] = useState<HouseholdMember[]>([]);

  // Initialise synchronously from localStorage so token is available on the very first render.
  // Using a lazy initialiser avoids the race condition where a useEffect-based hydration fires
  // after the redirect check in Dashboard/Settings, causing ":token" to be sent to the server.
  const [myMemberId, setMyMemberIdState] = useState<number | null>(() => {
    const v = readLS(LS_MEMBER_KEY);
    return v ? Number(v) : null;
  });
  const [token, setTokenState] = useState<string | null>(() => readLS(LS_TOKEN_KEY));

  function setToken(t: string | null) {
    setTokenState(t);
    if (t) {
      writeLS(LS_TOKEN_KEY, t);
    } else {
      removeLS(LS_TOKEN_KEY);
      removeLS(LS_MEMBER_KEY);
    }
  }

  function setMyMemberId(id: number | null) {
    setMyMemberIdState(id);
    if (id !== null) {
      writeLS(LS_MEMBER_KEY, String(id));
    } else {
      removeLS(LS_MEMBER_KEY);
    }
  }

  function persistIdentity(t: string, memberId: number) {
    setTokenState(t);
    setMyMemberIdState(memberId);
    writeLS(LS_TOKEN_KEY, t);
    writeLS(LS_MEMBER_KEY, String(memberId));
  }

  function clearMemberId() {
    setMyMemberIdState(null);
    removeLS(LS_MEMBER_KEY);
  }

  const primaryMember = members.find((m) => m.role === "primary");
  const partnerMember = members.find((m) => m.role === "partner");
  const myMember = members.find((m) => m.id === myMemberId);

  // We have a token but no known member → need identity check
  const needsIdentityCheck = !!token && myMemberId === null && members.length > 0;

  return (
    <HouseholdContext.Provider
      value={{
        household,
        members,
        myMemberId,
        token,
        setHousehold,
        setMembers,
        setMyMemberId,
        setToken,
        primaryMember,
        partnerMember,
        myMember,
        persistIdentity,
        clearMemberId,
        needsIdentityCheck,
      }}
    >
      {children}
    </HouseholdContext.Provider>
  );
}

export function useHousehold() {
  return useContext(HouseholdContext);
}
