/** Seeded demo witnesses (SIMULATED), used by the seed script to create readings. There is no login screen. */
export const DEMO_USERS = [
  { email: "witness1@demo.countrack.test", role: "witness", name: "Witness 1" },
  { email: "witness2@demo.countrack.test", role: "witness", name: "Witness 2" },
  { email: "witness3@demo.countrack.test", role: "witness", name: "Witness 3" },
  { email: "agent1@demo.countrack.test", role: "agent", name: "Party Agent 1" },
  { email: "observer1@demo.countrack.test", role: "observer", name: "Observer 1" },
] as const;

export type DemoUser = (typeof DEMO_USERS)[number];
