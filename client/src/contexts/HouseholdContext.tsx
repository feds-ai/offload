import React, { createContext, useContext, useState, useEffect } from "react";

export interface HouseholdMember {
  id: number;
  householdId: number;
  userId: number;
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

interface HouseholdContextValue {
  household: Household | null;
  members: HouseholdMember[];
  myMemberId: number | null;
  setHousehold: (h: Household | null) => void;
  setMembers: (m: HouseholdMember[]) => void;
  setMyMemberId: (id: number | null) => void;
  primaryMember: HouseholdMember | undefined;
  partnerMember: HouseholdMember | undefined;
  myMember: HouseholdMember | undefined;
}

const HouseholdContext = createContext<HouseholdContextValue>({
  household: null,
  members: [],
  myMemberId: null,
  setHousehold: () => {},
  setMembers: () => {},
  setMyMemberId: () => {},
  primaryMember: undefined,
  partnerMember: undefined,
  myMember: undefined,
});

export function HouseholdProvider({ children }: { children: React.ReactNode }) {
  const [household, setHousehold] = useState<Household | null>(null);
  const [members, setMembers] = useState<HouseholdMember[]>([]);
  const [myMemberId, setMyMemberId] = useState<number | null>(null);

  const primaryMember = members.find((m) => m.role === "primary");
  const partnerMember = members.find((m) => m.role === "partner");
  const myMember = members.find((m) => m.id === myMemberId);

  return (
    <HouseholdContext.Provider
      value={{
        household,
        members,
        myMemberId,
        setHousehold,
        setMembers,
        setMyMemberId,
        primaryMember,
        partnerMember,
        myMember,
      }}
    >
      {children}
    </HouseholdContext.Provider>
  );
}

export function useHousehold() {
  return useContext(HouseholdContext);
}
