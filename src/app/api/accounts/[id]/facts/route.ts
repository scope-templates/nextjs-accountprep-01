import { postFact, requestDeps } from '@/lib/handlers';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return postFact(requestDeps(req), (await params).id, req);
}
