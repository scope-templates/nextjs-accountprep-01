import type { LanguageModel } from 'ai';
import { z } from 'zod';
import { answerQuestion } from './assistant/answer';
import { getDb, STAGES, type Db } from './db';
import {
  accountRecord, addFact, addMeeting, addNote, addStaff, canReassign, changeStage, createAccount, HEAD_ONLY, findAccount, listAccounts, listStaff, logActivity,
  NOT_FOUND, STAFF_NOT_FOUND, parseId, reassignOwner, refuse, SIGNED_OUT, updateStaff, type Outcome, type Refusal, type Staff,
} from './desk';
import { cookieValue, staffForSession } from './session';

export type Deps = { db: Db; staff: Staff | null; now?: Date };

export function problem(status: number, code: string, title: string, detail?: string): Response {
  return new Response(JSON.stringify({ type: 'about:blank', status, code, title, ...(detail ? { detail } : {}) }), {
    status,
    headers: { 'content-type': 'application/problem+json' },
  });
}

const fromRefusal = (r: Refusal) => problem(r.status, r.code, r.title, r.detail);
const respond = <T,>(outcome: Outcome<T>, status = 200) => (outcome.ok ? Response.json(outcome.value, { status }) : fromRefusal(outcome));

const signedOut = () => fromRefusal(SIGNED_OUT);
const noAccount = () => fromRefusal(NOT_FOUND);

async function readBody(req: Request): Promise<{ ok: true; value: unknown } | Refusal> {
  try {
    return { ok: true, value: await req.json() };
  } catch {
    return refuse(400, 'invalid_json', 'The request body is not JSON');
  }
}

export function requestDeps(req: Request): Deps {
  const db = getDb();
  return { db, staff: staffForSession(db, cookieValue(req.headers.get('cookie'))) };
}

export function getAccounts({ db, staff }: Deps, url: URL): Response {
  if (!staff) return signedOut();
  const stage = url.searchParams.get('stage');
  if (stage && !(STAGES as readonly string[]).includes(stage)) return problem(400, 'invalid_stage', 'Unknown stage', `Stages: ${STAGES.join(', ')}.`);
  const owner = url.searchParams.get('owner');
  const ownerId = owner ? parseId(owner) : null;
  if (owner && !ownerId) return problem(400, 'invalid_owner', 'owner must be a staff id');
  return Response.json(listAccounts(db, { stage, ownerId }));
}

export async function postAccount({ db, staff, now }: Deps, req: Request): Promise<Response> {
  if (!staff) return signedOut();
  const body = await readBody(req);
  if (!body.ok) return fromRefusal(body);
  return respond(createAccount(db, staff, body.value, now), 201);
}

export function getAccount({ db, staff }: Deps, rawId: string): Response {
  if (!staff) return signedOut();
  const id = parseId(rawId);
  const record = id ? accountRecord(db, id) : undefined;
  return record ? Response.json(record) : noAccount();
}

type Write = (db: Db, actor: Staff | null, accountId: number, input: unknown, at?: Date) => Outcome<unknown>;

async function accountWrite(write: Write, { db, staff, now }: Deps, rawId: string, req: Request, status = 201): Promise<Response> {
  if (!staff) return signedOut();
  const id = parseId(rawId);
  if (!id) return noAccount();
  const body = await readBody(req);
  if (!body.ok) return fromRefusal(body);
  return respond(write(db, staff, id, body.value, now), status);
}

export const postFact = (deps: Deps, rawId: string, req: Request) => accountWrite(addFact, deps, rawId, req);
export const postNote = (deps: Deps, rawId: string, req: Request) => accountWrite(addNote, deps, rawId, req);
export const postMeeting = (deps: Deps, rawId: string, req: Request) => accountWrite(addMeeting, deps, rawId, req);
export const postStage = (deps: Deps, rawId: string, req: Request) => accountWrite(changeStage, deps, rawId, req, 200);

export async function postOwner(deps: Deps, rawId: string, req: Request): Promise<Response> {
  if (deps.staff && !canReassign(deps.staff)) return fromRefusal(HEAD_ONLY);
  return accountWrite(reassignOwner, deps, rawId, req, 200);
}

export function getStaff({ db, staff }: Deps): Response {
  if (!staff) return signedOut();
  return Response.json(listStaff(db));
}

export async function postStaff({ db, staff, now }: Deps, req: Request): Promise<Response> {
  if (!staff) return signedOut();
  const body = await readBody(req);
  if (!body.ok) return fromRefusal(body);
  return respond(addStaff(db, staff, body.value, now), 201);
}

export async function patchStaff({ db, staff, now }: Deps, rawId: string, req: Request): Promise<Response> {
  if (!staff) return signedOut();
  const id = parseId(rawId);
  if (!id) return fromRefusal(STAFF_NOT_FOUND);
  const body = await readBody(req);
  if (!body.ok) return fromRefusal(body);
  return respond(updateStaff(db, staff, id, body.value, now));
}

const questionInput = z.object({ question: z.string().trim().min(1).max(2000) });

export async function postAssistant({ db, staff, now = new Date(), model }: Deps & { model: LanguageModel | null }, rawId: string, req: Request): Promise<Response> {
  if (!staff) return signedOut();
  if (!model) return problem(503, 'assistant_unconfigured', 'The assistant is switched off on this server', 'ANTHROPIC_API_KEY is unset.');
  const id = parseId(rawId);
  const account = id ? findAccount(db, id) : undefined;
  if (!account) return noAccount();
  const body = await readBody(req);
  if (!body.ok) return fromRefusal(body);
  const parsed = questionInput.safeParse(body.value);
  if (!parsed.success) return problem(400, 'invalid_body', 'Send {"question": "..."}');
  logActivity(db, staff.id, 'assistant_asked', account.id, null, now);
  const failed = () => problem(502, 'model_call_failed', 'The model call failed');
  try {
    const reply = await answerQuestion({ db, model, account, actor: staff, question: parsed.data.question, abortSignal: req.signal, now });
    return reply.answer.trim() ? Response.json(reply) : failed();
  } catch (error) {
    console.error('assistant call failed', error);
    return failed();
  }
}
