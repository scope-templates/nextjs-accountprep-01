import { getAccounts, postAccount, requestDeps } from '@/lib/handlers';

export const GET = (req: Request) => getAccounts(requestDeps(req), new URL(req.url));
export const POST = (req: Request) => postAccount(requestDeps(req), req);
