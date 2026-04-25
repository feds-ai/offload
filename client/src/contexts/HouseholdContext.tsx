import React, { createContext, useContext, useState, useEffect } from "react";

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
  const [myMemberId, setMyMemberIdState] = useState<number | null>(null);
  const [token, setTokenState] = useState<string | null>(null);

  // Hydrate from localStorage on mount
  useEffect(() => {
    const storedToken = localStorage.getItem(LS_TOKEN_KEY);
    const storedMemberId = localStorage.getItem(LS_MEMBER_KEY);
    if (storedToken) setTokenState(storedToken);
    if (storedMemberId) setMyMemberIdState(Number(storedMemberId));
  }, []);

  function setToken(t: string | null) {
    setTokenState(t);
    if (t) {
      localStorage.setItem(LS_TOKEN_KEY, t);
    } else {
      localStorage.removeItem(LS_TOKEN_KEY);
      localStorage.removeItem(LS_MEMBER_KEY);
    }
  }

  function setMyMemberId(id: number | null) {
    setMyMemberIdState(id);
    if (id !== null) {
      localStorage.setItem(LS_MEMBER_KEY, String(id));
    } else {
      localStorage.removeItem(LS_MEMBER_KEY);
    }
  }

  function persistIdentity(t: string, memberId: number) {
    setTokenState(t);
    setMyMemberIdState(memberId);
    localStorage.setItem(LS_TOKEN_KEY, t);
    localStorage.setItem(LS_MEMBER_KEY, String(memberId));
  }

  function clearMemberId() {
    setMyMemberIdState(null);
    localStorage.removeItem(LS_MEMBER_KEY);
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
