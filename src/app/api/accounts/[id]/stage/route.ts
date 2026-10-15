import { postStage, requestDeps } from '@/lib/handlers';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return postStage(requestDeps(req), (await params).id, req);
}
