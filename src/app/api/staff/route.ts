import { getStaff, postStaff, requestDeps } from '@/lib/handlers';

export const GET = (req: Request) => getStaff(requestDeps(req));
export const POST = (req: Request) => postStaff(requestDeps(req), req);
