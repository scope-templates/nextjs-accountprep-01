import { getAccount, requestDeps } from '@/lib/handlers';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return getAccount(requestDeps(req), (await params).id);
}
