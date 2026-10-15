import { postMeeting, requestDeps } from '@/lib/handlers';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return postMeeting(requestDeps(req), (await params).id, req);
}
