import { postOwner, requestDeps } from '@/lib/handlers';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return postOwner(requestDeps(req), (await params).id, req);
}
