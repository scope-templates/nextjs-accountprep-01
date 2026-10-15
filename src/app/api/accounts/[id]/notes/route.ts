import { postNote, requestDeps } from '@/lib/handlers';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return postNote(requestDeps(req), (await params).id, req);
}
