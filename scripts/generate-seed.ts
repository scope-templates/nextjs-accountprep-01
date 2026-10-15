// Writes data/seed.json. Same seed number, same bytes, every run.
import { writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

export type SeedStaff = { id: number; name: string; email: string; role: 'rep' | 'head' | 'admin'; active: 0 | 1 };
export type SeedAccount = {
  id: number; name: string; kind: string; hq_city: string; hq_state: string; fleet_size_told: number | null;
  stage: string; owner_id: number; created_on: string; last_touched_on: string;
};
export type SeedContact = { id: number; account_id: number; name: string; title: string; email: string; phone: string; notes: string };
export type SeedMeeting = { id: number; account_id: number; held_on: string; attended_by: number; notes: string; next_step: string };
export type SeedFact = { id: number; account_id: number; field: string; value: string; checked_on: string; checked_by: number; note: string };
export type SeedNote = { id: number; account_id: number; author_id: number; written_at: string; body: string };
export type SeedActivity = { id: number; actor_id: number; action: string; account_id: number | null; detail: string | null; at: string };
export type Seed = {
  staff: SeedStaff[]; accounts: SeedAccount[]; contacts: SeedContact[]; meetings: SeedMeeting[];
  facts: SeedFact[]; notes: SeedNote[]; activity: SeedActivity[];
};

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SEED_NUMBER = 20260930;
let rand = mulberry32(SEED_NUMBER);
const int = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));
const pick = <T,>(items: readonly T[]): T => items[Math.floor(rand() * items.length)];
const chance = (p: number) => rand() < p;
function weighted<T>(pairs: readonly [T, number][]): T {
  let r = rand() * pairs.reduce((sum, [, w]) => sum + w, 0);
  for (const [value, w] of pairs) if ((r -= w) < 0) return value;
  return pairs[pairs.length - 1][0];
}
function pickSome<T>(items: readonly T[], n: number): T[] {
  const pool = [...items];
  const out: T[] = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
  return out;
}

const DAY = 86_400_000;
const toDay = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / DAY;
const fromDay = (d: number) => new Date(d * DAY).toISOString().slice(0, 10);
const addDays = (iso: string, n: number) => fromDay(toDay(iso) + n);
const maxIso = (a: string, b: string) => (a > b ? a : b);
const minIso = (a: string, b: string) => (a < b ? a : b);
const HOLIDAYS = new Set([
  '2025-01-01', '2025-05-26', '2025-07-04', '2025-09-01', '2025-11-27', '2025-12-25',
  '2026-01-01', '2026-05-25', '2026-07-03', '2026-09-07', '2026-11-26', '2026-12-25',
]);
const closed = (iso: string) => [0, 6].includes((toDay(iso) + 4) % 7) || HOLIDAYS.has(iso);
function weekday(iso: string, hi = '9999-12-31', lo = '0000-01-01'): string {
  let day = iso;
  while (closed(day)) day = addDays(day, 1);
  if (day <= hi) return day;
  day = iso;
  while (closed(day) && day > lo) day = addDays(day, -1);
  return day;
}
function workdayBefore(iso: string): string {
  let day = addDays(iso, -1);
  while (closed(day)) day = addDays(day, -1);
  return day;
}
const dayBetween = (lo: string, hi: string) => weekday(fromDay(int(toDay(lo), toDay(hi))), hi, lo);
const pad = (n: number) => String(n).padStart(2, '0');
const stamp = (iso: string) => `${iso}T${pad(int(14, 22))}:${pad(int(0, 59))}:00Z`;
const minutesAfter = (at: string, n: number) => new Date(Date.parse(at) + n * 60_000).toISOString().replace(/\.\d{3}Z$/, 'Z');
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const monthName = (iso: string) => MONTHS[Number(iso.slice(5, 7)) - 1];
const monthYear = (iso: string) => `${monthName(iso)} ${iso.slice(0, 4)}`;
const shortDate = (iso: string) => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`;
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
const round5 = (n: number) => Math.round(n / 5) * 5;

const WINDOW_START = '2025-10-01';
const WINDOW_END = '2026-09-30';
const FACTS_START = '2025-06-15';
const FACTS_END = '2026-09-14';

const STAFF: SeedStaff[] = [
  { id: 1, name: 'Delphine Okoro', email: 'delphine.okoro@pemberline.com', role: 'head', active: 1 },
  { id: 2, name: 'Marcus Tellwright', email: 'marcus.tellwright@pemberline.com', role: 'rep', active: 1 },
  { id: 3, name: 'Ivy Chandrapal', email: 'ivy.chandrapal@pemberline.com', role: 'rep', active: 1 },
  { id: 4, name: 'Teodora Ruiz-Kemper', email: 'teodora.ruizkemper@pemberline.com', role: 'rep', active: 1 },
  { id: 5, name: 'Owen Bastable', email: 'owen.bastable@pemberline.com', role: 'rep', active: 1 },
  { id: 6, name: 'Sanjay Whitcombe', email: 'sanjay.whitcombe@pemberline.com', role: 'admin', active: 1 },
  { id: 7, name: 'Lyle Prentiss', email: 'lyle.prentiss@pemberline.com', role: 'rep', active: 0 },
];
const HEAD = 1;
const ADMIN = 6;
const ASSISTANT_SINCE = '2026-04-13';
const LEFT_ON: Record<number, string> = { 7: '2026-03-16' };
const REP_SETTINGS: Record<number, { headChecks: number; terse: boolean }> = {
  1: { headChecks: 0, terse: false },
  2: { headChecks: 0.15, terse: false },
  3: { headChecks: 0.2, terse: false },
  4: { headChecks: 0, terse: true },
  5: { headChecks: 0.15, terse: false },
  7: { headChecks: 0.1, terse: false },
};
const repsActiveOn = (date: string) => STAFF.filter((s) => s.role === 'rep' && (LEFT_ON[s.id] ?? '9999') > date && (s.active || LEFT_ON[s.id])).map((s) => s.id);

type Stage = 'lead' | 'qualified' | 'demo' | 'proposal' | 'won' | 'lost';
const STAGE_ORDER: Stage[] = ['lead', 'qualified', 'demo', 'proposal', 'won'];
const STAGE_AFTER: Record<string, Stage> = { discovery: 'qualified', demo: 'demo', proposal: 'proposal', contract: 'won', lost: 'lost' };
type Row = [name: string, kind: string, city: string, state: string, stage: Stage, fleet: number | null];

const ACCOUNTS: Row[] = [
  ['Tullaver Area Transit', 'transit agency', 'Tullaver', 'OH', 'proposal', 64],
  ['Corvane County Transit Authority', 'transit agency', 'Corvane', 'IN', 'won', 38],
  ['Pruett Valley Regional Transit', 'transit agency', 'Pruett Valley', 'CO', 'demo', 92],
  ['Merrivane Transit District', 'transit agency', 'Merrivane', 'OR', 'qualified', 47],
  ['Hesper Falls Transit', 'transit agency', 'Hesper Falls', 'WI', 'lead', 21],
  ['Brackwater Regional Transit Authority', 'transit agency', 'Brackwater', 'NC', 'won', 118],
  ['Sallowmere Area Transit', 'transit agency', 'Sallowmere', 'MN', 'lost', 55],
  ['Lowry Fork Transit', 'transit agency', 'Lowry Fork', 'KY', 'lead', 16],
  ['Calder Bend Metro Transit', 'transit agency', 'Calder Bend', 'IA', 'proposal', 73],
  ['Norvell County Transit', 'transit agency', 'Norvell', 'TN', 'qualified', 29],
  ['Dunsforth Transit Authority', 'transit agency', 'Dunsforth', 'PA', 'demo', 140],
  ['Ondreth Valley Transit', 'transit agency', 'Ondreth', 'WA', 'won', 54],
  ['Wendlow Public Transit', 'transit agency', 'Wendlow', 'MI', 'lead', null],
  ['Teague Crossing Transit', 'transit agency', 'Teague Crossing', 'TX', 'qualified', 34],
  ['Seyburn Airport Express', 'airport shuttle', 'Seyburn', 'AZ', 'won', 26],
  ['Gessford Airport Shuttle Co.', 'airport shuttle', 'Gessford', 'NV', 'demo', 18],
  ['Amberlake Skyport Shuttle', 'airport shuttle', 'Amberlake', 'FL', 'lead', 12],
  ['Cassatt Point Airport Connection', 'airport shuttle', 'Cassatt Point', 'SC', 'qualified', 22],
  ['Juniper Gate Airport Shuttle', 'airport shuttle', 'Juniper Gate', 'UT', 'lost', 14],
  ['Ruddock Field Shuttle', 'airport shuttle', 'Ruddock', 'MO', 'proposal', 31],
  ['Quarrow Air Link', 'airport shuttle', 'Quarrow', 'NM', 'lead', 9],
  ['Haddon Reach Airport Coaches', 'airport shuttle', 'Haddon Reach', 'GA', 'demo', 40],
  ['Tarrow Regional Airport Shuttle', 'airport shuttle', 'Tarrow', 'KS', 'lead', 11],
  ['Dovecote Terminal Shuttles', 'airport shuttle', 'Dovecote', 'VA', 'won', 24],
  ['Vickery Student Transportation', 'school bus contractor', 'Arkell', 'OH', 'proposal', 54],
  ['Pettigrove School Bus Co.', 'school bus contractor', 'Felding', 'NY', 'won', 88],
  ['Lucero Pupil Transport', 'school bus contractor', 'Escara', 'NM', 'qualified', 43],
  ['Garroway Bus Lines', 'school bus contractor', 'Mordale', 'PA', 'demo', 76],
  ['Sobczak Student Transit', 'school bus contractor', 'Pinnock', 'WI', 'lost', 39],
  ['Mendenhall School Coach', 'school bus contractor', 'Abernook', 'IN', 'lead', 27],
  ['Dorrian Bus Service', 'school bus contractor', 'Saxby', 'MI', 'qualified', 33],
  ['Kowalczyk & Sons Bus Company', 'school bus contractor', 'Harrowfield', 'IL', 'won', 102],
  ['Easterby School Transportation', 'school bus contractor', 'Easterby', 'MA', 'proposal', 68],
  ['Nakashima Student Lines', 'school bus contractor', 'Ambry', 'CA', 'demo', 57],
  ['Okonkwo Bus Contractors', 'school bus contractor', 'Neverson', 'GA', 'lead', 45],
  ['Redhallow Pupil Transportation', 'school bus contractor', 'Redhallow', 'AL', 'lost', 36],
  ['Whitlow Creek School Bus', 'school bus contractor', 'Whitlow Creek', 'AR', 'qualified', 19],
  ['Ambroszek Bus Lines', 'school bus contractor', 'Dallin', 'NE', 'proposal', 48],
  ['Corrigan Flats Access Rides', 'paratransit provider', 'Corrigan Flats', 'OK', 'demo', 23],
  ['Ilsforth Mobility Services', 'paratransit provider', 'Ilsforth', 'CT', 'won', 35],
  ['Hatcher Paratransit', 'paratransit provider', 'Wynmoor', 'NJ', 'lead', 17],
  ['Coldspar Dial-a-Ride', 'paratransit provider', 'Coldspar', 'ID', 'qualified', 13],
  ['Lanthorne Accessible Transit', 'paratransit provider', 'Lanthorne', 'MD', 'lost', 28],
  ['Vashti Lake Community Rides', 'paratransit provider', 'Vashti Lake', 'MN', 'lead', 8],
  ['Orrin Valley Paratransit', 'paratransit provider', 'Orrin Valley', 'CA', 'proposal', 38],
  ['Prosper Ridge Senior Transit', 'paratransit provider', 'Prosper Ridge', 'NC', 'qualified', 15],
  ['Breckmoor University Shuttle Services', 'campus shuttle', 'Breckmoor', 'VT', 'demo', 20],
  ['Ulvane College Transit', 'campus shuttle', 'Ulvane', 'OR', 'lost', 12],
  ['Thessaly Medical Center Shuttles', 'campus shuttle', 'Thessaly Junction', 'TN', 'qualified', 10],
  ['Harker Mills Campus Transit', 'campus shuttle', 'Harker Mills', 'VA', 'won', 30],
  ['Wrenfield Tech Park Shuttle', 'campus shuttle', 'Wrenfield', 'TX', 'lead', 7],
  ['Saddler Institute Shuttles', 'campus shuttle', 'Saddler Plains', 'KS', 'proposal', 16],
  ['Cardell Coachways', 'charter coach', 'Cardell', 'KY', 'demo', 25],
  ['Mosley Run Coach Company', 'charter coach', 'Mosley Run', 'WV', 'lost', 19],
  ['Ivesbury Charter Lines', 'charter coach', 'Ivesbury', 'NH', 'qualified', 14],
  ['Rook Hollow Motorcoach', 'charter coach', 'Rook Hollow', 'MO', 'won', 37],
  ['Tamberlin Tours & Charter', 'charter coach', 'Tamberlin', 'SC', 'lead', 11],
  ['Cobalt Springs Coach', 'charter coach', 'Cobalt Springs', 'CO', 'proposal', 22],
  ['Selden-Marsh Coaches', 'charter coach', 'Sorvan', 'ME', 'lost', 18],
  ['Abelard Coach Lines', 'charter coach', 'Lindquist Bay', 'WI', 'lead', null],
];
const PUBLIC_KINDS = ['transit agency', 'paratransit provider', 'campus shuttle'];

const FIELDS = ['headcount', 'fleet size', 'depots', 'parent company', 'operating area', 'contract renewals', 'recent change'] as const;
type Field = (typeof FIELDS)[number];

const FIRST = [
  'Ramona', 'Dale', 'Priya', 'Bernadette', 'Stan', 'Tomas', 'Claire', 'Hector', 'Wanda', 'Earl', 'Lorna', 'Javier', 'Nadia',
  'Curtis', 'Monique', 'Russell', 'Ines', 'Gordon', 'Felicia', 'Arturo', 'Shelby', 'Douglas', 'Renee', 'Kwame', 'Patrice',
  'Leland', 'Rosalind', 'Desmond', 'Yolanda', 'Brent', 'Carmen', 'Wesley', 'Ngozi', 'Harlan', 'Dolores', 'Terrence', 'Mei',
  'Rodney', 'Beatriz', 'Vernon', 'Tamsin', 'Ezra', 'Gloria', 'Silas', 'Marisol', 'Clifford', 'Anika', 'Roy', 'Juniper', 'Otis',
];
const LAST = [
  'Albrecht', 'Bramhall', 'Castellanos', 'Dunleavy', 'Eckert', 'Fontaine', 'Gutierrez', 'Hargrove', 'Iwasaki', 'Jablonski',
  'Kincaid', 'Lindgren', 'Mbeki', 'Nordstrand', 'Ochoa', 'Pruitt', 'Quintero', 'Rasmussen', 'Szymanski', 'Thibodeaux',
  'Underhill', 'Vasquez', 'Wojcik', 'Yancey', 'Zielinski', 'Abernethy', 'Boateng', 'Crowder', 'Delacroix', 'Esposito',
  'Faraday', 'Galloway', 'Huxtable', 'Ingram', 'Jaramillo', 'Kowal', 'Lockridge', 'Mcalister', 'Navarro', 'Oyelaran',
  'Pemsworth', 'Ridley', 'Sandoval', 'Truong', 'Ulrich', 'Villanueva', 'Whitaker', 'Ybarra', 'Zamora', 'Haskins',
];
const LEAD_TITLE: Record<string, string> = {
  'transit agency': 'Director of Operations', 'airport shuttle': 'Operations Manager', 'school bus contractor': 'Transportation Director',
  'paratransit provider': 'Operations Manager', 'campus shuttle': 'Transportation Services Manager', 'charter coach': 'Operations Manager',
};
const OTHER_TITLES: Record<string, string[]> = {
  'transit agency': ['Fleet Maintenance Manager', 'General Manager', 'Procurement Officer', 'Maintenance Supervisor', 'Grants Manager', 'IT Coordinator'],
  'airport shuttle': ['Owner', 'Shop Foreman', 'General Manager', 'Dispatch Manager'],
  'school bus contractor': ['Owner', 'Shop Foreman', 'Safety and Training Manager', 'Office Manager', 'President'],
  'paratransit provider': ['Executive Director', 'Fleet Coordinator', 'Maintenance Lead', 'Finance Director'],
  'campus shuttle': ['Fleet Supervisor', 'Director of Facilities', 'Parking and Transit Coordinator'],
  'charter coach': ['Owner', 'Maintenance Director', 'Controller'],
};
const ROADS = ['Route 9', 'Ellery St', 'Saxton Rd', 'Mill Rd', 'Airport Blvd', 'County Rd 12', 'Industrial Pkwy', 'Harmon Ave', 'Depot St', 'Old Quarry Rd', 'Route 30', 'Fenner Ln'];
const GROUPS = ['Corliss Mobility Group', 'Harrell Transit Partners', 'Seacliff Mobility Holdings', 'Amsel Fleet Group', 'Tarkington Transport Partners'];
const PAINS = [
  'PM inspections slipping past due', 'a parts room nobody trusts', 'brake jobs tracked on a whiteboard', 'state inspection prep eating a full week',
  'warranty claims they never file', 'driver defect reports lost between shifts', 'tire rotations done whenever someone remembers',
  'their asset management plan for the FTA', 'wheelchair lift inspections on the vans', 'oil changes logged in three different places',
  'mechanics spending the first hour of each shift figuring out what to work on', 'no idea what a bus actually costs to keep on the road',
];
const TOOLS_TODAY = [
  'a shared spreadsheet', 'paper work orders and a filing cabinet', 'an old shop system from 2009 that only one person knows', 'the whiteboard in the shop',
  'a mix of spreadsheets and the fuel card reports', 'a generic CMMS built for factories', "their dealer's service portal plus email",
];
const EXTRAS = [
  'GM sat in for the last ten minutes.', 'Bad connection, half the call was on mute.', '{who} wants the recap in writing.',
  '{who} asked whether spares count toward the vehicle price.', 'They have a state inspection in three weeks, so timing is tight.',
  'Their IT person is a contractor who comes in Tuesdays.', '{who} brought up the cost of the last software rollout, which went badly.',
  'Mechanics were in the room this time, which helped.', 'Call ran long.', 'Short call; {who} had a breakdown on the road to deal with.',
];
const NEXT_STEPS: Record<string, string[]> = {
  intro: ['Schedule discovery with the shop foreman', 'Send the overview deck', 'Get the vehicle list', 'Follow up in two weeks'],
  discovery: ['Schedule shop visit', 'Book a demo for the shop', 'Get the vehicle list as a spreadsheet', 'Intro to their IT person'],
  shop: ['Book the demo', 'Send recap and the PM checklist sample'],
  demo: ['Send pricing', 'Second demo with finance', 'Send a reference contact', 'Loop in Delphine on pricing'],
  pricing: ['Draft proposal', 'Revise the quote', 'Wait on their budget numbers', 'Loop in Delphine on pricing'],
  proposal: ['Revise the proposal', 'Wait on their board vote', 'Answer their procurement questions'],
  contract: ['Get the PO', 'Send W-9 and insurance certificate', 'Book the onsite kickoff'],
  followup: ['Follow up in two weeks', 'Check back after their board meeting', 'Wait on their budget numbers', 'Send a reference contact'],
  onboarding: ['Finish the parts list import', 'Second training session for nights', 'Set up the driver defect app'],
  checkin: ['Quote the parts module', 'Schedule the quarterly review', 'Add a second admin login', 'Send the cost-per-vehicle report'],
  lost: [''],
};

type State = { fleet: number; depots: string[]; headcount: number; parent: string; area: string; contract: string; lead: string; change: string };
type EventKind =
  | 'depot_opened' | 'depot_closed' | 'fleet_up' | 'fleet_down' | 'new_lead' | 'acquired' | 'reorganized'
  | 'area_grew' | 'contract_ended' | 'contract_renewed' | 'headcount_up' | 'headcount_down';
type TimelineEvent = { kind: EventKind; on: string; field: Field; params: Record<string, string | number> };

const EVENT_FIELD: Record<EventKind, Field> = {
  depot_opened: 'depots', depot_closed: 'depots', fleet_up: 'fleet size', fleet_down: 'fleet size', new_lead: 'recent change',
  acquired: 'parent company', reorganized: 'parent company', area_grew: 'operating area', contract_ended: 'contract renewals',
  contract_renewed: 'contract renewals', headcount_up: 'headcount', headcount_down: 'headcount',
};
const EVENTS_BY_KIND: Record<string, EventKind[]> = {
  'transit agency': ['depot_opened', 'depot_closed', 'fleet_up', 'fleet_down', 'new_lead', 'reorganized', 'area_grew', 'contract_ended', 'headcount_up'],
  'airport shuttle': ['fleet_up', 'fleet_down', 'new_lead', 'acquired', 'area_grew', 'depot_opened', 'headcount_down'],
  'school bus contractor': ['depot_opened', 'depot_closed', 'fleet_up', 'fleet_down', 'new_lead', 'acquired', 'area_grew', 'contract_renewed', 'headcount_up'],
  'paratransit provider': ['fleet_up', 'new_lead', 'reorganized', 'area_grew', 'contract_ended', 'headcount_up'],
  'campus shuttle': ['fleet_up', 'fleet_down', 'new_lead', 'contract_renewed', 'area_grew'],
  'charter coach': ['acquired', 'fleet_up', 'fleet_down', 'depot_opened', 'new_lead', 'headcount_down'],
};

function initialState(row: Row, lead: string): State {
  const [, kind, city] = row;
  const fleet = row[5] ?? int(8, 30);
  const yards = fleet < 25 ? 1 : fleet < 70 ? int(1, 2) : int(2, 3);
  const depots = ['main yard', ...pickSome(ROADS, yards - 1).map((r) => `${r} garage`)];
  return {
    fleet, depots, lead, headcount: fleet * 2 + int(4, 30),
    parent: kind === 'transit agency' ? pick(['City department', 'County department', 'Joint powers agency, 3 counties'])
      : kind === 'paratransit provider' ? pick(['Nonprofit, own board', 'County human services department'])
        : kind === 'campus shuttle' ? pick(['University facilities department', 'Run by the hospital system'])
          : pick(['Independent, family-owned', 'Privately held, two owners', 'Employee-owned since 2018']),
    area: kind === 'school bus contractor' ? `${int(2, 5)} school districts`
      : kind === 'airport shuttle' ? 'Airport to downtown hotels and the convention center'
        : pick([`${city} plus three neighboring towns`, `${city} metro, weekday only`, 'Within a 30-mile radius of HQ']),
    contract: kind === 'school bus contractor' ? pick(['District contracts renew every July', 'Main district contract runs through June 2027'])
      : PUBLIC_KINDS.includes(kind) ? pick(['Board approves the budget each June', `Fleet software contract up ${pick(MONTHS)} 2027`, 'Fuel and maintenance budgets set in October'])
        : pick(['Hotel shuttle contracts renew each January', 'No long contracts; month to month with most clients', 'Fleet software contract up December 2026']),
    change: pick(['Moved maintenance in-house in 2024', 'New general manager in spring 2025', 'Opened a new wash bay in 2024', 'Switched fuel card provider in 2025', 'Added two electric buses in 2024']),
  };
}

function applyEvent(s: State, e: TimelineEvent): State {
  const next = { ...s, depots: [...s.depots] };
  const p = e.params;
  const when = monthYear(e.on);
  switch (e.kind) {
    case 'depot_opened': next.depots.push(`${p.road} yard`); next.change = `Opened a yard on ${p.road}, ${when}`; break;
    case 'depot_closed': next.depots = next.depots.filter((d) => d !== p.closed); next.change = `Closed the ${p.closed}, ${when}`; break;
    case 'fleet_up': next.fleet += Number(p.delta); next.change = `Added ${p.delta} vehicles, ${when}`; break;
    case 'fleet_down': next.fleet -= Number(p.delta); next.change = `Retired ${p.delta} vehicles, ${when}`; break;
    case 'new_lead': next.lead = String(p.to); next.change = `New ${p.title} since ${when}`; break;
    case 'acquired': next.parent = `Owned by ${p.group} since ${when}`; next.change = `Bought by ${p.group}, ${when}`; break;
    case 'reorganized': next.parent = `Independent regional authority since ${when}`; next.change = `Became an independent authority, ${when}`; break;
    case 'area_grew': next.area = String(p.area); next.change = `Took over ${p.what}, ${when}`; break;
    case 'contract_ended': next.contract = `Month to month with their old software vendor since ${when}`; next.change = `Ended their fleet software contract early, ${when}`; break;
    case 'contract_renewed': next.contract = `Renewed in ${when}, runs through June 2029`; next.change = `Contract renewed, ${when}`; break;
    case 'headcount_up': next.headcount += Number(p.delta); next.change = `Hired ${p.delta} people, ${when}`; break;
    case 'headcount_down': next.headcount -= Number(p.delta); next.change = `Cut ${p.delta} positions, ${when}`; break;
  }
  return next;
}

function makeEvent(kind: EventKind, on: string, row: Row, s: State, newPerson: () => string): TimelineEvent | null {
  const [, type, city] = row;
  const params: Record<string, string | number> = {};
  switch (kind) {
    case 'depot_opened': params.road = pick(ROADS.filter((r) => !s.depots.includes(`${r} garage`) && !s.depots.includes(`${r} yard`))); break;
    case 'depot_closed': if (s.depots.length < 2) return null; params.closed = s.depots[s.depots.length - 1]; break;
    case 'fleet_up':
      params.delta = Math.max(2, Math.round(s.fleet * (int(10, 30) / 100)));
      params.why = type === 'school bus contractor' ? `picking up the ${pick(['north county', 'Westfield district', 'charter school'])} routes`
        : type === 'airport shuttle' ? 'a new hotel contract' : type === 'charter coach' ? 'buying out a smaller operator' : 'the new weekend service';
      break;
    case 'fleet_down': if (s.fleet < 12) return null; params.delta = Math.max(2, Math.round(s.fleet * (int(8, 20) / 100))); params.why = pick(['an auction of the oldest units', 'losing a route contract', 'parking the high-mileage units']); break;
    case 'new_lead': params.from = s.lead; params.to = newPerson(); params.title = LEAD_TITLE[type].toLowerCase(); params.went = pick(['retired', 'left for another operator', 'moved to the county']); break;
    case 'acquired': if (PUBLIC_KINDS.includes(type)) return null; params.group = pick(GROUPS); break;
    case 'reorganized': if (!/department/i.test(s.parent)) return null; break;
    case 'area_grew':
      if (type === 'school bus contractor') { const n = Number(s.area.split(' ')[0]) + int(1, 2); params.what = 'the county rural routes'; params.area = `${n} school districts`; }
      else if (type === 'airport shuttle') { params.what = 'the cruise terminal runs'; params.area = `Airport, downtown ${city} and the cruise terminal`; }
      else { params.what = 'the county rural routes'; params.area = `All of ${city} County`; }
      if (params.area === s.area) return null;
      break;
    case 'contract_ended': if (/^Month to month/.test(s.contract)) return null; break;
    case 'contract_renewed': if (/^Renewed/.test(s.contract)) return null; params.who = type === 'school bus contractor' ? 'The main district' : 'The university'; break;
    case 'headcount_up': params.delta = int(10, 40); params.why = pick(['bringing the charter drivers in-house', 'adding a night shift in the shop', 'the new routes']); break;
    case 'headcount_down': params.delta = int(5, 20); params.why = pick(['the slow winter season', 'losing a contract']); break;
  }
  return { kind, on, field: EVENT_FIELD[kind], params };
}

function telling(e: TimelineEvent, s: State, terse: boolean): string {
  const p = e.params;
  const mon = monthName(e.on);
  const ord = ['', 'first', 'second', 'third', 'fourth', 'fifth'][s.depots.length] ?? 'another';
  const plain: Record<EventKind, string> = {
    depot_opened: `They opened a ${ord} yard on ${p.road} in ${mon}, mostly for the ${pick(['vans', 'spare buses', 'overflow from the main yard'])}.`,
    depot_closed: `They closed the ${p.closed} in ${mon} and moved everything into ${s.depots.length === 1 ? 'the main yard' : 'the other yards'}.`,
    fleet_up: `Fleet is up to ${s.fleet} since ${p.why} in ${mon}.`,
    fleet_down: `They are down to ${s.fleet} vehicles after ${p.why} in ${mon}.`,
    new_lead: `Met ${p.to}, their new ${p.title}. ${String(p.from).split(' ')[0]} ${p.went} in ${mon}.`,
    acquired: `Purchasing now goes through ${p.group} since the sale closed in ${mon}; anything big needs their sign-off.`,
    reorganized: `The county spun transit out into an independent regional authority in ${mon}, with its own board and its own procurement rules.`,
    area_grew: `They took over ${p.what} in ${mon}, so they now cover ${String(p.area).replace(/^All/, 'all')}.`,
    contract_ended: `They ended the contract with their old software vendor early in ${mon}; month to month until they pick a replacement.`,
    contract_renewed: `${p.who} renewed their contract in ${mon}, through June 2029.`,
    headcount_up: `They are at about ${round5(s.headcount)} people now after ${p.why}.`,
    headcount_down: `Headcount is down to about ${round5(s.headcount)} after ${p.why}.`,
  };
  if (!terse) return plain[e.kind];
  const short: Record<EventKind, string> = {
    depot_opened: `new yard on ${String(p.road).toLowerCase()} since ${mon.toLowerCase()}, ${s.depots.length} total now.`,
    depot_closed: `closed the ${String(p.closed).toLowerCase()} in ${mon.toLowerCase()}. ${s.depots.length} yard${s.depots.length > 1 ? 's' : ''} now.`,
    fleet_up: `fleet up to ${s.fleet} since ${mon.toLowerCase()} (${p.why}).`,
    fleet_down: `down to ${s.fleet} vehicles after ${p.why}.`,
    new_lead: `met ${String(p.to).toLowerCase()}, new ${p.title}. ${String(p.from).split(' ')[0].toLowerCase()} ${p.went} in ${mon.toLowerCase()}.`,
    acquired: `${p.group} bought them, closed in ${mon.toLowerCase()}. purchasing goes through them now.`,
    reorganized: `county spun transit out as its own authority in ${mon.toLowerCase()}. new board.`,
    area_grew: `took over ${p.what} in ${mon.toLowerCase()}. covers ${String(p.area).toLowerCase()} now.`,
    contract_ended: `ended the old software contract early in ${mon.toLowerCase()}. month to month until they pick.`,
    contract_renewed: `${String(p.who).toLowerCase()} renewed in ${mon.toLowerCase()}, through june 2029.`,
    headcount_up: `~${round5(s.headcount)} people now, ${p.why}.`,
    headcount_down: `headcount down to ~${round5(s.headcount)}.`,
  };
  return short[e.kind];
}

function factValue(field: Field, s: State, row: Row): string {
  const kind = row[1];
  const vans = Math.min(int(2, 6), s.fleet - 1);
  switch (field) {
    case 'headcount': {
      const shop = Math.max(2, Math.round(s.headcount / 12));
      return pick([`about ${round5(s.headcount)}`, `${s.headcount} employees`, `${shop} in the shop, ${s.headcount - shop - int(2, 6)} drivers`]);
    }
    case 'fleet size':
      return kind === 'paratransit provider' || kind === 'airport shuttle'
        ? pick([`${s.fleet} vehicles`, `${s.fleet - vans} cutaways + ${vans} vans`])
        : pick([`${s.fleet} buses`, `${s.fleet} vehicles`, `${s.fleet} (${int(1, 4)} of them spares)`]);
    case 'depots':
      return s.depots.length === 1 ? pick(['1', '1 (main yard)']) : pick([`${s.depots.length}`, `${s.depots.length} (${s.depots.join(', ')})`]);
    case 'parent company': return s.parent;
    case 'operating area': return s.area;
    case 'contract renewals': return s.contract;
    case 'recent change': return s.change;
  }
}

type Basis = { fields: Field[]; plain: (checked: string) => string; terse: (checked: string) => string; kinds?: string[]; months?: number[] };
const DOCUMENTS: Basis[] = [
  { fields: ['headcount', 'depots'], plain: (d) => `their careers page, ${monthName(d)}`, terse: (d) => `careers page, ${monthName(d).toLowerCase()}` },
  { fields: ['parent company', 'fleet size', 'operating area'], plain: () => 'county filing', terse: () => 'county filing', kinds: ['transit agency', 'paratransit provider'] },
  { fields: ['headcount', 'fleet size', 'parent company'], plain: () => 'annual report', terse: () => 'their annual report', kinds: PUBLIC_KINDS },
  { fields: ['contract renewals', 'fleet size', 'depots'], plain: () => 'board meeting minutes', terse: () => `board packet, p. ${int(3, 40)}`, kinds: ['transit agency', 'paratransit provider', 'school bus contractor'] },
  { fields: ['fleet size', 'depots', 'contract renewals'], plain: () => 'from their RFP', terse: () => `their RFP, section ${int(2, 7)}` },
  { fields: ['parent company', 'recent change', 'fleet size'], plain: () => 'press release they put out', terse: () => 'their press release' },
  { fields: ['recent change', 'parent company', 'operating area'], plain: () => 'news story in the local paper', terse: () => 'local paper' },
  { fields: ['fleet size', 'operating area', 'parent company'], plain: () => 'state association directory', terse: () => 'state assoc. directory' },
  { fields: ['depots', 'fleet size'], plain: (d) => `job posting for mechanics, ${monthName(d)}`, terse: (d) => `mechanic job posting, ${monthName(d).toLowerCase()}` },
  { fields: ['contract renewals', 'headcount'], plain: () => 'their budget document', terse: (d) => `their FY${d.slice(2, 4)} budget doc`, kinds: PUBLIC_KINDS },
  { fields: [...FIELDS].filter((f) => f !== 'contract renewals'), plain: () => 'heard at the regional show', terse: () => 'heard it at the state show', months: [3, 4, 10, 11] },
];
type CallBasis = { fields: Field[]; meeting?: string; plain: (held: string) => string; terse: (held: string) => string };
const CALLS: CallBasis[] = [
  { fields: [...FIELDS], plain: () => 'their ops lead said so on the call', terse: (h) => `asked on the ${shortDate(h)} call` },
  { fields: ['headcount', 'fleet size', 'depots', 'parent company'], meeting: 'intro', plain: () => 'asked on the intro call', terse: (h) => `intro call, ${shortDate(h)}` },
  { fields: ['fleet size', 'depots', 'headcount'], meeting: 'shop', plain: () => 'shop visit', terse: () => 'counted the lot on the site visit' },
  { fields: ['contract renewals', 'parent company', 'recent change'], plain: () => 'GM mentioned it on the call', terse: (h) => `GM told me on the ${shortDate(h)} call, then I checked w/ the shop lead` },
  { fields: [...FIELDS], plain: (h) => `asked on the ${shortDate(h)} call`, terse: (h) => `confirmed w/ ${pick(['the office mgr', 'their safety lead', 'dispatch', 'the night foreman'])} on ${shortDate(h)}` },
];

function meetingKinds(stage: Stage, n: number): string[] {
  const ladder: Record<Stage, string[]> = {
    lead: ['intro', 'followup', 'followup'],
    qualified: ['intro', 'discovery', 'followup', 'discovery', 'shop', 'followup', 'followup'],
    demo: ['intro', 'discovery', 'shop', 'demo', 'followup', 'demo', 'followup', 'followup', 'followup'],
    proposal: ['intro', 'discovery', 'shop', 'demo', 'demo', 'pricing', 'proposal', 'followup', 'followup', 'pricing', 'followup', 'followup'],
    won: ['intro', 'discovery', 'demo', 'pricing', 'proposal', 'contract', 'onboarding', 'onboarding', 'checkin'],
    lost: ['intro', 'discovery', 'demo', 'followup', 'pricing', 'followup', 'followup', 'followup'],
  };
  const out = Array.from({ length: n }, (_, i) => ladder[stage][i] ?? (stage === 'won' ? 'checkin' : 'followup'));
  if (stage === 'lost' && n) out[n - 1] = 'lost';
  return out;
}
const MEETING_COUNT: Record<Stage, [number, number]> = { lead: [0, 3], qualified: [3, 7], demo: [5, 9], proposal: [7, 12], won: [11, 16], lost: [4, 8] };

function meetingNote(kind: string, who: string, fleet: number, row: Row, terse: boolean, date: string, again: boolean): string {
  const pain = pick(PAINS);
  const tool = pick(TOOLS_TODAY);
  const month = monthName(date);
  const bays = pick(['four', 'six', 'eight', 'ten', 'twelve']);
  const lifts = pick(['one lift', 'two lifts', 'a lift and a pit']);
  if (terse) {
    const w = who.toLowerCase();
    const short: Record<string, string[]> = {
      intro: [`intro w/ ${w}. ~${fleet} vehicles. ${tool}. main pain: ${pain}.`, `intro. ${w} picked up on the 2nd try. ${fleet} units. wants a demo w/ the foreman.`],
      discovery: [`disco call. ${w} + lead mechanic. ${pain}. no budget owner named.`, `disco. GM signs to $${int(15, 40)}k. ${bays} bays. ${pain}.`],
      demo: again
        ? [`demo #2 w/ finance + ${w}. all pricing q's.`, `2nd demo, mechanics this time. ${w} wants the tablet app on nights.`]
        : [`demo went fine. ${w} quiet, foreman asked all the questions. wants tablet in the bay.`, `demo on their own list, ${fleet} units. ${w} liked the due list. ran ${int(10, 25)} min over.`],
      proposal: [`proposal sent to ${w}. ${fleet} units std tier, onboarding in 2 phases.`, `walked ${w} through the proposal. board vote in ${month.toLowerCase()}.`],
      pricing: [`pricing call. ${fleet} units std tier. pushback on onboarding fee, held at full price.`, `${w} countered ~${int(8, 14)}% under. told them I'd ask delphine.`],
      shop: [`onsite. counted the lot, ~${fleet}. parts cage is a mess.`, `shop visit. ${bays} bays, ${lifts}. mechanics skeptical but friendly.`],
      followup: [`f/u w/ ${w}. waiting on budget.`, `checked in. ${w} out sick, talked to the office mgr instead.`, `f/u. ${w} says the ${month.toLowerCase()} board packet is due first. call back after.`, `${w} emailed 2 q's on import. answered same day.`],
      contract: [`order form back w/ ${int(1, 4)} redlines. net ${pick([30, 45, 60])} ok per delphine.`],
      onboarding: [`kickoff done. ${fleet} vehicles imported. ${w} is admin.`, `training, both shifts. nights had more q's.`, `wk 2 onboarding. ${int(40, 250)} dup part numbers, ${w} cleaning up.`],
      checkin: [`monthly. PM compliance ${int(84, 97)}%. parts module interest.`, `check-in w/ ${w}. ${pick(['app logout complaints again', 'tablet sync issue on nights', 'one mechanic refuses to use it'])}, sent to support.`, `qbr. ${int(2, 9)} open work orders older than 30 days, down from ${int(20, 60)}.`],
      lost: [`lost. ${w} says the board froze spend. revisit in spring.`],
    };
    return pick(short[kind]);
  }
  const plain: Record<string, string[]> = {
    intro: [
      `Intro call with ${who}. They run ${fleet} vehicles and keep maintenance in ${tool}. Biggest complaint is ${pain}.`,
      `First call. ${who} heard about us from another operator at the state association. Short call, mostly about ${pain}.`,
      `${who} took the call from the shop floor. ${fleet} vehicles, ${tool}. Asked about pricing before anything else.`,
      `Intro. ${who} was polite but guarded; their last software purchase took two years to roll out and the mechanics never used it.`,
      `Intro with ${who}. Fifteen minutes. Interested, wants to see it with the shop foreman.`,
    ],
    discovery: [
      `Discovery with ${who} and one of the mechanics. They walked through how a work order moves: driver writes it up, dispatch calls the shop, someone types it into ${tool}. ${cap(pain)} came up three times.`,
      `Went through their PM intervals. They do A/B/C inspections at 6k/12k/24k miles but nobody can say which buses are due this week. ${who} wants a weekly list per mechanic.`,
      `${who} shared their vehicle list: ${fleet} units, model years ${int(2008, 2013)} to ${int(2022, 2025)}. Older units eat most of the parts budget.`,
      `Discovery. Asked who signs off on purchases; ${who} says the GM up to $${int(15, 40)}k, board above that. Shop is ${bays} bays, ${lifts}.`,
      `${who} and the parts manager. Parts are ordered when someone notices the shelf is empty. They lost a bus for nine days in ${month} waiting on a starter.`,
    ],
    demo: again
      ? [
        `Second demo, this time with finance and ${who}. Questions were all about per-vehicle pricing and whether retired buses still count. They don't.`,
        `Follow-up demo for the night shift. ${who} sat in; the mechanics mostly wanted to see the tablet app offline.`,
      ]
      : [
        `Demo for ${who} and the shop foreman. They liked the PM calendar and the defect report from the driver app. Foreman asked if mechanics can close a work order from a tablet in the bay; yes.`,
        `Ran the demo on their own vehicle list (${fleet} units). ${who} asked a lot about parts reorder points. Went 15 minutes over.`,
        `Demo. ${who} brought three mechanics. The one who has been there 30 years asked the best questions, mostly about how the PM due list handles buses that sit for a month.`,
      ],
    proposal: [
      `Sent the proposal to ${who}: ${fleet} vehicles at the standard tier, onboarding in two phases.`,
      `Walked ${who} and their GM through the proposal. They want to take it to the board in ${month}.`,
      `Proposal review with ${who}. Procurement asked for our insurance certificate and a reference.`,
    ],
    pricing: [
      `Pricing review with ${who}. ${fleet} vehicles at the standard tier. They pushed for a multi-year discount; told them Delphine would look at it.`,
      `Went line by line through the quote. ${who} wants onboarding split across two budget years.`,
      `${who} came back with a counter on price, about ${int(8, 15)}% under our quote. Said I would take it to Delphine.`,
    ],
    shop: [
      `Shop visit. ${cap(bays)} bays, ${lifts}. ${who} showed the parts cage and the binder of inspection sheets. Mechanics were friendly but skeptical.`,
      `Onsite at their yard in ${row[2]}. Roughly ${fleet} vehicles on the lot, matches what they told us. ${cap(pain)} is visible everywhere.`,
    ],
    followup: [
      `Quick follow-up with ${who}. Nothing new, waiting on their budget.`,
      `Check-in call. ${who} is busy with the ${month} service change and asked to talk again in a few weeks.`,
      `Follow-up. ${who} forwarded our recap to the GM, who wants to see it.`,
      `${who} called back with two questions about data import from ${tool}. Answered both.`,
      `Follow-up with ${who} and their GM. GM asked what happens to their data if they leave. Walked through the export.`,
    ],
    contract: [
      `Contract review with ${who} and their procurement contact. Redlines on the data ownership clause and payment terms (they want net 60).`,
      `Went through the order form. ${who} needs a W-9 and our insurance certificate before purchasing will issue the PO.`,
    ],
    onboarding: [
      `Onboarding kickoff. Imported ${fleet} vehicles and their PM intervals. ${who} is the admin.`,
      `Training session for the mechanics, two shifts. Night shift had more questions about the tablet app than day shift.`,
      `Week two of onboarding. Parts list import had ${int(40, 300)} duplicate part numbers; ${who} is cleaning them up.`,
    ],
    checkin: [
      `Monthly check-in with ${who}. PM compliance went from about ${int(55, 78)}% to ${int(88, 97)}% since go-live. They want the parts module next quarter.`,
      `Check-in. ${who} is happy, a couple of complaints about ${pick(['the mobile app logging mechanics out', 'slow sync on the shop tablets', 'the parts report export'])}. Passed to support.`,
      `Check-in with ${who}. They passed their state inspection with zero write-ups for the first time in ${int(3, 8)} years.`,
      `Quarterly review. ${who} asked for a second admin login and a report of cost per vehicle by model year.`,
    ],
    lost: [
      `${who} called to say they went with a bigger vendor that the state contract already covers. Price was not the issue.`,
      `Debrief with ${who}. Board decided to hold off on any new software this fiscal year.`,
      `They chose to stay with ${tool}. ${who} said the shop didn't want another change this year.`,
    ],
  };
  const first = pick(plain[kind]);
  return chance(0.35) && kind !== 'lost' ? `${first} ${pick(EXTRAS).replace('{who}', who)}` : first;
}

function firstPerson(text: string): string {
  return text
    .replace('told them Delphine would look at it', 'told them I would look at it')
    .replace('Said I would take it to Delphine.', 'Said I would think about it.');
}

type Phase = 'lead' | 'selling' | 'customer';

function noteBody(author: number, row: Row, fleet: number, who: string, phase: Phase): string {
  const w = who.toLowerCase();
  if (REP_SETTINGS[author]?.terse) {
    const terse: Record<Phase, string[]> = {
      lead: [
        `left vm for ${w}. ${pick(['2nd', '3rd'])} time this month.`,
        `${w} forwarded our deck to the GM w/ "worth a look".`,
        `${w} asked for the security questionnaire. sent ${pick(['mon', 'tue', 'wed', 'thu', 'fri'])}.`,
      ],
      selling: [
        `${w} wants a 12 mo pilot under ${int(20, 40)} vehicles. delphine ok'd if they sign by Q${int(1, 4)}.`,
        `their fiscal year starts ${pick(['july 1', 'oct 1', 'jan 1'])}. don't push pricing before ${pick(['may', 'aug', 'nov'])}.`,
        `shop foreman is the real decision maker here, not the title on the org chart.`,
        `GM came to the call unannounced. asked about cost per bus. ${fleet} units x std tier, he didn't flinch.`,
      ],
      customer: [
        `${w} wants a parts module quote before ${pick(['their budget closes', 'the summer', 'year end'])}.`,
        `2 mechanics still not logging in on nights. told ${w}.`,
        `first invoice paid. ${w} asked for ${pick(['two', 'three'])} more tablet logins.`,
      ],
    };
    return pick(terse[phase]);
  }
  if (author === HEAD) {
    const head: Record<Phase, string[]> = {
      lead: [
        `Pipeline review: ${pick(['keep', 'push', 'hold'])} this one ${pick(['this quarter', 'into next quarter', 'until their board meets'])}.`,
        `Spoke with ${who} at the state conference. Warm, but they want to see a reference in ${row[3]}.`,
      ],
      selling: [
        `Approved a ${pick([10, 12, 15])}% multi-year discount for ${row[0]} if they commit to three years.`,
        `Not a fit for the enterprise tier. Keep them on standard.`,
        `Reviewed the deal. Hold on onboarding fee, flex on payment terms.`,
      ],
      customer: [
        `Asked ${who} to be a reference for other operators in ${row[3]}; they said yes.`,
        `Bring up the parts module at their next quarterly review.`,
      ],
    };
    return pick(head[phase]);
  }
  const plain: Record<Phase, string[]> = {
    lead: [
      `${who} wants a call ${pick(['Tuesday', 'Wednesday', 'Thursday'])} after their ${pick(['safety meeting', 'staff meeting', 'shift change'])}.`,
      `${who} asked for a copy of our security questionnaire answers. Sent.`,
      `${who} is out on leave until next month. Talk to the office manager in the meantime.`,
    ],
    selling: [
      `Sent ${who} the ${pick(['sample PM report', 'reference list', 'pricing sheet'])}.`,
      `Budget season for them runs through ${pick(['May', 'June', 'October', 'March'])}. Don't expect a decision before then.`,
      `${who} mentioned they are also talking to one other vendor but wouldn't say who.`,
      `Their mechanics are union; any rollout plan has to go through the shop steward.`,
      `They have ${fleet} vehicles but only ${pick(['two', 'three', 'four'])} mechanics, so tablet licenses matter more than seat count.`,
    ],
    customer: [
      `${who} asked for ${pick(['two', 'three'])} more tablet logins for the night shift.`,
      `First-year invoice paid. ${who} wants another training session for new mechanics.`,
      `The shop steward asked for a copy of the training plan. Sent it to ${who}.`,
    ],
  };
  return pick(plain[phase]);
}

const contactNote = () =>
  pick([
    '', '', '', '', '', '',
    `Prefers email. Out most ${pick(['Mondays', 'Fridays', 'Wednesday afternoons'])}.`,
    `Best reached before ${pick(['7', '8', '9'])}am, the shop gets loud after that.`,
    `Came over from the ${pick(['county public works fleet', 'state DOT', 'city sanitation garage', 'a dealership service department'])} in ${int(2016, 2024)}.`,
    `Signs anything under $${pick([5, 10, 15, 20])}k without the board.`,
    `Ex-mechanic, ${int(12, 30)} years on the floor. Will ask about the parts module first.`,
    `Wants demos under ${pick([20, 30])} minutes.`,
    `Calendar goes through ${pick(['Joyce', 'Marta', 'Deshawn', 'the front office'])}.`,
    pick(['Text works better than calls.', 'Answers email at night, not during the day.', 'Will not pick up an unknown number.']),
    `On the board of the state ${pick(['pupil transportation', 'transit', 'paratransit'])} association.`,
    'Likes a written recap after every call.',
    'Very skeptical of software after their last rollout.',
    'Also covers the night shift, so afternoons are bad.',
    'Runs the budget. Talk numbers.',
    'Champion. Pushed for the demo internally.',
  ]);

const slug = (name: string) => name.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '');

export function buildSeed(): Seed {
  rand = mulberry32(SEED_NUMBER);
  const accounts: SeedAccount[] = [];
  const contacts: SeedContact[] = [];
  const meetings: SeedMeeting[] = [];
  const facts: SeedFact[] = [];
  const notes: SeedNote[] = [];
  const activity: Omit<SeedActivity, 'id'>[] = [];
  const usedNames = new Set<string>(STAFF.map((s) => s.name));
  const newPerson = () => {
    for (;;) {
      const name = `${pick(FIRST)} ${pick(LAST)}`;
      if (!usedNames.has(name)) return usedNames.add(name), name;
    }
  };
  const usedText = new Set<string>();
  const shape = (text: string, accountId: number) => `${accountId}:${text.replace(/\b[A-Za-z][a-z]*\b/g, (w) => (/^[A-Z]/.test(w) ? 'N' : w)).replace(/\d+/g, '0')}`;
  const taken = (text: string, accountId: number) => usedText.has(text) || usedText.has(shape(text, accountId));
  const unique = (make: () => string, accountId: number) => {
    let text = make();
    for (let tries = 0; text && taken(text, accountId) && tries < 20; tries++) text = make();
    if (text && taken(text, accountId)) return '';
    usedText.add(text);
    usedText.add(shape(text, accountId));
    return text;
  };

  const worlds = ACCOUNTS.map((row, index) => {
    const id = index + 1;
    const stage = row[4];
    const created = stage === 'lead' ? dayBetween('2026-03-01', '2026-08-20') : dayBetween('2025-03-03', '2026-02-13');
    const lead = newPerson();
    let state = initialState(row, lead);
    const states: { from: string; state: State }[] = [{ from: '0000-00-00', state }];
    const events: TimelineEvent[] = [];
    const count = weighted([[0, 30], [1, 35], [2, 22], [3, 13]] as [number, number][]);
    const dates = Array.from({ length: count }, () => dayBetween(maxIso(addDays(created, 30), '2025-07-01'), '2026-09-15')).sort();
    for (const on of dates) {
      const kinds = EVENTS_BY_KIND[row[1]].filter((k) => !events.some((e) => e.field === EVENT_FIELD[k]));
      if (!kinds.length) break;
      const event = makeEvent(pick(kinds), on, row, state, newPerson);
      if (!event) continue;
      events.push(event);
      state = applyEvent(state, event);
      states.push({ from: on, state });
    }
    const stateOn = (date: string) => states.filter((s) => s.from <= date).at(-1)!.state;
    return { id, row, created, lead, events, stateOn };
  });

  for (const world of worlds) {
    const { id, row, created, events, stateOn } = world;
    const [name, kind, city, state, stage, fleetTold] = row;
    const startOwner = weighted(repsActiveOn(created).filter((r) => created < '2025-09-01' || !LEFT_ON[r]).map((r) => [r, LEFT_ON[r] ? 3 : 1] as [number, number]));
    const handover = LEFT_ON[startOwner];
    const laterOwner = handover ? pick(repsActiveOn(handover)) : startOwner;
    const ownerOn = (date: string) => (handover && date >= handover ? laterOwner : startOwner);
    const habitOn = (date: string) => REP_SETTINGS[ownerOn(date)];
    let touched = created;
    const touch = (date: string) => { touched = maxIso(touched, date); };
    const log = (actor: number, action: string, at: string, detail: string | null = null) => activity.push({ actor_id: actor, action, account_id: id, detail, at });

    log(startOwner, 'account_created', `${created}T13:${pad(int(0, 59))}:00Z`);
    if (handover) log(HEAD, 'owner_changed', `${handover}T15:${String(int(0, 59)).padStart(2, '0')}:00Z`, JSON.stringify({ from: startOwner, to: laterOwner }));

    const domain = `${slug(name)}.${kind === 'transit agency' || kind === 'paratransit provider' ? 'org' : 'com'}`;
    const people: { name: string; title: string; from: string; until: string }[] = [{ name: world.lead, title: LEAD_TITLE[kind], from: '0000', until: '9999' }];
    for (const e of events.filter((ev) => ev.kind === 'new_lead')) {
      people[0].until = e.on;
      people.push({ name: String(e.params.to), title: LEAD_TITLE[kind], from: '9999', until: '9999' });
    }
    const otherCount = Math.max(people.length > 1 ? 1 : 0, weighted([[0, 15], [1, 50], [2, 30], [3, 5]] as [number, number][]));
    for (const title of pickSome(OTHER_TITLES[kind], otherCount)) {
      let name = newPerson();
      while (people.some((p) => p.name.split(' ')[0] === name.split(' ')[0])) name = newPerson();
      people.push({ name, title, from: '0000', until: '9999' });
    }
    const whoOn = (date: string) => pick(people.filter((p) => p.from <= date && p.until > date)).name.split(' ')[0];

    const [lo, hi] = MEETING_COUNT[stage];
    const start = maxIso(created, WINDOW_START);
    const meetingDates = Array.from({ length: int(lo, hi) }, () => dayBetween(start, WINDOW_END)).sort();
    const kinds = meetingKinds(stage, meetingDates.length);
    const told = new Map<TimelineEvent, string>();
    const held: { on: string; kind: string; attendee: number }[] = [];
    let stageNow = 'lead' as Stage;
    meetingDates.forEach((date, k) => {
      const attendee = chance(0.12) ? HEAD : ownerOn(date);
      const terse = REP_SETTINGS[attendee]?.terse ?? false;
      const news = kinds[k] === 'intro' ? undefined : events.find((e) => !told.has(e) && e.on < date && toDay(date) - toDay(e.on) <= 120 && chance(0.8));
      const again = held.some((m) => m.kind === kinds[k]);
      const write = () => meetingNote(kinds[k], whoOn(date), stateOn(date).fleet, row, terse, date, again);
      let text = '';
      for (let tries = 0; !text && tries < 5; tries++) text = unique(write, id);
      text ||= write();
      if (news) {
        told.set(news, date);
        if (news.kind === 'new_lead') people.find((p) => p.name === news.params.to)!.from = date;
        text = `${telling(news, stateOn(date), terse)} ${text}`;
      }
      meetings.push({
        id: 0, account_id: id, held_on: date, attended_by: attendee,
        notes: attendee === HEAD ? firstPerson(text) : text,
        next_step: pick(NEXT_STEPS[kinds[k]].filter((s) => attendee !== HEAD || !s.includes('Delphine'))),
      });
      held.push({ on: date, kind: kinds[k], attendee });
      const loggedAt = stamp(date);
      log(attendee, 'meeting_logged', loggedAt);
      const reached = STAGE_AFTER[kinds[k]];
      if (reached && (reached === 'lost' || STAGE_ORDER.indexOf(reached) > STAGE_ORDER.indexOf(stageNow))) {
        log(attendee === HEAD ? HEAD : ownerOn(date), 'stage_changed', minutesAfter(loggedAt, int(1, 20)), JSON.stringify({ from: stageNow, to: reached }));
        stageNow = reached;
      }
      const askedOn = workdayBefore(date);
      if (askedOn >= ASSISTANT_SINCE && chance(0.2)) log(attendee, 'assistant_asked', stamp(askedOn));
      touch(date);
    });
    for (const e of events.filter((ev) => !told.has(ev) && chance(0.6))) {
      const on = dayBetween(addDays(e.on, 3), minIso(addDays(e.on, 40), WINDOW_END));
      if (on < start || on <= e.on) continue;
      const author = ownerOn(on);
      told.set(e, on);
      if (e.kind === 'new_lead') people.find((p) => p.name === e.params.to)!.from = on;
      notes.push({ id: 0, account_id: id, author_id: author, written_at: stamp(on), body: telling(e, stateOn(on), REP_SETTINGS[author].terse) });
      log(author, 'note_added', stamp(on));
      touch(on);
    }

    people.forEach((person) => {
      const [first, last] = person.name.split(' ');
      const gone = person.until !== '9999';
      contacts.push({
        id: 0, account_id: id, name: person.name, title: gone ? `Former ${person.title}` : person.title,
        email: `${first[0].toLowerCase()}${last.toLowerCase()}@${domain}`,
        phone: `(${int(201, 989)}) 555-01${String(int(0, 99)).padStart(2, '0')}`,
        notes: gone ? `${cap(String(events.find((e) => e.params.from === person.name)!.params.went))} in ${monthYear(person.until)}.`
          : person.from !== '0000' ? `Took over as ${person.title.toLowerCase()} in ${monthYear(events.find((e) => e.params.to === person.name)!.on)}.` : unique(contactNote, id),
      });
    });

    const factCount = weighted([[0, 5], [2, 10], [3, 22], [4, 22], [5, 18], [6, 14], [9, 2], [12, 5]] as [number, number][]);
    const floor = maxIso(created, FACTS_START);
    const factEnd = stageNow === 'lost' ? minIso(FACTS_END, held[held.length - 1].on) : FACTS_END;
    const callable = held.filter((m) => m.on <= factEnd && (m.attendee === ownerOn(m.on) || (m.attendee === HEAD && habitOn(m.on).headChecks > 0)));
    for (let k = 0; k < factCount; k++) {
      const useCall = callable.length > 0 && chance(0.5);
      let checkedOn: string;
      let field: Field;
      let note: string;
      let checker: number;
      if (useCall) {
        const basis = pick(CALLS.filter((s) => !s.meeting || callable.some((m) => m.kind === s.meeting)));
        const meeting = pick(callable.filter((m) => !basis.meeting || m.kind === basis.meeting));
        checkedOn = weekday(minIso(addDays(meeting.on, int(0, 2)), factEnd), factEnd);
        if (checkedOn < meeting.on) checkedOn = meeting.on;
        field = pick(basis.fields);
        checker = meeting.attendee;
        note = REP_SETTINGS[checker].terse ? basis.terse(meeting.on) : basis.plain(meeting.on);
      } else {
        if (floor > factEnd) continue;
        checkedOn = dayBetween(floor, factEnd);
        const month = Number(checkedOn.slice(5, 7));
        const bases = DOCUMENTS.filter((s) => (!s.kinds || s.kinds.includes(kind)) && (!s.months || s.months.includes(month)));
        const basis = pick(bases);
        field = pick(basis.fields);
        checker = chance(habitOn(checkedOn).headChecks) ? HEAD : ownerOn(checkedOn);
        note = REP_SETTINGS[checker].terse ? basis.terse(checkedOn) : basis.plain(checkedOn);
      }
      if (facts.some((f) => f.account_id === id && f.field === field && f.checked_on === checkedOn)) continue;
      facts.push({ id: 0, account_id: id, field, value: factValue(field, stateOn(checkedOn), row), checked_on: checkedOn, checked_by: checker, note });
      log(checker, 'fact_added', stamp(checkedOn));
      touch(checkedOn);
    }

    const signed = held.find((m) => m.kind === 'contract')?.on;
    const phaseOn = (date: string): Phase => (stage === 'lead' ? 'lead' : stage === 'won' && signed && date > signed ? 'customer' : 'selling');
    const lastNoteDay = stage === 'lost' && held.length ? held[held.length - 1].on : WINDOW_END;
    const noteCount = stage === 'lead' ? int(0, 1) : int(0, 3);
    for (let k = 0; k < noteCount && start <= lastNoteDay; k++) {
      const on = dayBetween(start, lastNoteDay);
      const author = chance(0.2) ? HEAD : ownerOn(on);
      const body = unique(() => noteBody(author, row, stateOn(on).fleet, whoOn(on), phaseOn(on)), id);
      if (!body) continue;
      notes.push({ id: 0, account_id: id, author_id: author, written_at: stamp(on), body });
      log(author, 'note_added', stamp(on));
      touch(on);
    }

    accounts.push({ id, name, kind, hq_city: city, hq_state: state, fleet_size_told: fleetTold, stage: stageNow, owner_id: ownerOn('9999'), created_on: created, last_touched_on: touched });
  }

  for (const [staffId, on] of Object.entries(LEFT_ON)) {
    const person = STAFF.find((x) => x.id === Number(staffId))!;
    activity.push({
      actor_id: ADMIN, action: 'staff_deactivated', account_id: null, at: `${on}T22:${String(int(0, 59)).padStart(2, '0')}:00Z`,
      detail: JSON.stringify({ staff_id: person.id, from: { role: person.role, active: 1 }, to: { role: person.role, active: 0 } }),
    });
  }

  const ordered = <T extends { id: number }>(rows: T[], key: (r: T) => string) =>
    rows.map((r, i) => ({ r, i })).sort((a, b) => key(a.r).localeCompare(key(b.r)) || a.i - b.i).map(({ r }, i) => ({ ...r, id: i + 1 }));

  return {
    staff: STAFF,
    accounts,
    contacts: contacts.map((c, i) => ({ ...c, id: i + 1 })),
    meetings: ordered(meetings, (m) => m.held_on),
    facts: ordered(facts, (f) => f.checked_on),
    notes: ordered(notes, (n) => n.written_at),
    activity: ordered(activity.map((a) => ({ id: 0, ...a })), (a) => a.at),
  };
}

export function serializeSeed(seed: Seed): string {
  const tables = Object.entries(seed) as [string, object[]][];
  const body = tables.map(([name, rows]) => `"${name}": [\n${rows.map((r) => JSON.stringify(r)).join(',\n')}\n]`).join(',\n');
  return `{\n${body}\n}\n`;
}

export const SEED_PATH = fileURLToPath(new URL('../data/seed.json', import.meta.url));

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  writeFileSync(SEED_PATH, serializeSeed(buildSeed()));
  console.log(`wrote ${SEED_PATH}`);
}
